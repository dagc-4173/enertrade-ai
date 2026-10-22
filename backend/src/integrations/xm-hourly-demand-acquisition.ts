import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeXmResponse } from './providers/xm.provider';
import { ExternalDataError, isDate, isObject, type ExternalDataset } from './types/external-data';

export const hourlyDemandDefinition = {
  metric: 'DemaReal', entity: 'Sistema', unit: 'kWh', granularity: 'hourly',
  target: 'demanda_real_kwh', experimental: true,
  semanticScope: 'Demanda de usuarios regulados y no regulados del SIN; no incluye Alumbrado Público.',
  equivalentToDemaSIN: false, temporalIdentity: 'fecha_xm + periodo XM 1..24; sin timestamp inferido',
} as const;
const dataset: ExternalDataset = { id: 'DemaReal', name: 'Demanda Real por Sistema (experimental)', unit: 'kWh', granularity: 'hourly', maxInclusiveDays: 30, supportsFilters: false };
const base = 'https://servapibi.xm.com.co';
const version = '1.0.0';
const maxBytes = 2 * 1024 * 1024;
export type HourlyDemandRange = { startDate: string; endDate: string };
type Transport = (url: string, init: RequestInit) => Promise<Response>;
const sha256 = (body: string) => createHash('sha256').update(body, 'utf8').digest('hex');
const fail = (code: string, message: string, status = 422): never => { throw new ExternalDataError(status, code, message); };

function days(range: HourlyDemandRange): string[] {
  if (!isObject(range) || Object.keys(range).length !== 2 || !isDate(range.startDate) || !isDate(range.endDate)) {
    return fail('INVALID_EXTERNAL_DATES', 'Se requieren startDate y endDate calendario.');
  }
  const count = (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000 + 1;
  if (count < 1 || count > 30) return fail('INVALID_EXTERNAL_DATE_RANGE', 'La captura admite de 1 a 30 días inclusivos.');
  return Array.from({ length: count }, (_, i) => new Date(Date.parse(range.startDate) + i * 86_400_000).toISOString().slice(0, 10));
}

function parse(body: string): unknown {
  try { return JSON.parse(body); } catch { return fail('EXTERNAL_RESPONSE_INVALID', 'XM devolvió JSON inválido.', 502); }
}

function catalogEntry(body: string) {
  const raw = parse(body);
  if (!isObject(raw) || !Array.isArray(raw.Items)) return fail('XM_DEMAND_CATALOG_INVALID', 'El catálogo XM no cumple el contrato.', 502);
  const matches: Record<string, unknown>[] = [];
  for (const item of raw.Items) {
    if (!isObject(item) || !Array.isArray(item.ListEntities)) return fail('XM_DEMAND_CATALOG_INVALID', 'El catálogo XM no cumple el contrato.', 502);
    for (const entity of item.ListEntities) {
      if (isObject(entity) && isObject(entity.Values) && entity.Values.MetricId === 'DemaReal' && entity.Values.Entity === 'Sistema') matches.push(entity.Values);
    }
  }
  const entry = matches[0];
  if (matches.length !== 1 || !entry || entry.MetricUnits !== 'kWh' || entry.Type !== 'HourlyEntities' ||
      entry.Url !== `${base}/hourly` || !Number.isFinite(Number(entry.MaxDays)) || Number(entry.MaxDays) < 30 ||
      typeof entry.MetricDescription !== 'string' || !/no incluye alumbrado p[uú]blico/i.test(entry.MetricDescription)) {
    return fail('XM_DEMAND_CATALOG_INCOMPATIBLE', 'La unidad, resolución o definición de DemaReal/Sistema cambió; requiere revisión.', 502);
  }
  return entry;
}

export function normalizeHourlyDemand(rawBody: string, range: HourlyDemandRange) {
  const expectedDays = days(range);
  const raw = parse(rawBody);
  const data = normalizeXmResponse(raw, { provider: 'xm', dataset: 'DemaReal', ...range }, dataset);
  if (!isObject(raw) || !Array.isArray(raw.Items) || raw.Items.length !== expectedDays.length) return fail('XM_DEMAND_INCOMPLETE', 'Faltan días del rango solicitado.');
  for (const item of raw.Items) {
    const values = item.HourlyEntities[0].Values;
    const periodKeys = Object.keys(values).filter(key => key !== 'code');
    if (periodKeys.length !== 24 || periodKeys.some(key => !/^Hour(0[1-9]|1[0-9]|2[0-4])$/.test(key))) {
      return fail('XM_DEMAND_PERIODS_INVALID', 'Cada día debe contener exactamente los periodos Hour01..Hour24.');
    }
  }
  const keys = new Set(data.records.map(row => `${row.date}/${row.hour}`));
  if (data.records.length !== expectedDays.length * 24 || keys.size !== data.records.length ||
      expectedDays.some(date => Array.from({ length: 24 }, (_, i) => `${date}/${i + 1}`).some(key => !keys.has(key)))) {
    return fail('XM_DEMAND_INCOMPLETE', 'El rango debe contener todos los días y periodos únicos.');
  }
  if (data.records.some(row => row.value < 0)) return fail('XM_DEMAND_NEGATIVE', 'La demanda real no admite energía negativa en este perfil.');
  return {
    definition: hourlyDemandDefinition,
    query: { provider: 'xm', dataset: 'DemaReal', ...range },
    records: data.records.map(row => ({ fecha_xm: row.date, periodo: row.hour!, demanda_real_kwh: row.value })),
  };
}

export type HourlyDemandAcquisition = {
  rawBody: string; catalogRawBody: string;
  normalized: ReturnType<typeof normalizeHourlyDemand>;
  manifest: {
    requestAttempts?: { catalog?: { attempt: number; outcome: string }[]; data?: { attempt: number; outcome: string }[] };
    status: 'validated'; adapterVersion: string; normalizerVersion: string;
    requestedRange: HourlyDemandRange; catalogRetrievedAt: string; retrievedAt: string;
    rawSha256: string; catalogSha256: string; normalizedSha256: string;
    catalogEntry: Record<string, unknown>;
    quality: { rulesetId: string; rulesetVersion: string; completeDays: number; recordCount: number; missingPeriods: number; duplicatePeriods: number; negativeValues: number };
    limitations: string[];
  };
};

class RetryableXmHttpError extends ExternalDataError {}

async function requestXmHourlyOnce(path: '/Lists' | '/hourly', body: object, transport: Transport, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(`${base}${path}`, { method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) { await response.body?.cancel(); if ([408, 429, 502, 503, 504].includes(response.status)) throw new RetryableXmHttpError(502, 'EXTERNAL_HTTP_ERROR', 'XM devolvió un estado HTTP transitorio.'); return fail('EXTERNAL_HTTP_ERROR', 'XM devolvió un estado HTTP no exitoso.', 502); }
    if (!response.body) return fail('EXTERNAL_RESPONSE_INVALID', 'XM devolvió una respuesta vacía.', 502);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); return fail('XM_DEMAND_RESPONSE_TOO_LARGE', 'La respuesta supera 2 MiB.', 502); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let rawBody: string;
    try { rawBody = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
    catch { return fail('EXTERNAL_RESPONSE_INVALID', 'XM devolvió una codificación inválida.', 502); }
    if (controller.signal.aborted) return fail('EXTERNAL_TIMEOUT', 'XM no respondió a tiempo.', 504);
    return { rawBody, retrievedAt: new Date().toISOString() };
  } catch (error) {
    if (controller.signal.aborted) return fail('EXTERNAL_TIMEOUT', 'XM no respondió a tiempo.', 504);
    if (error instanceof ExternalDataError) throw error;
    return fail('EXTERNAL_NETWORK_ERROR', 'No fue posible completar la consulta XM.', 502);
  } finally { clearTimeout(timer); }
}

// Only read-only XM queries are retried; schema/content validation never is.
export async function requestXmHourly(path: '/Lists' | '/hourly', body: object, transport: Transport, timeoutMs: number,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<{ rawBody: string; retrievedAt: string; attempts?: { attempt: number; outcome: string }[] }> {
  const attempts: { attempt: number; outcome: string }[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const receipt = await requestXmHourlyOnce(path, body, transport, timeoutMs);
      attempts.push({ attempt, outcome: 'succeeded' });
      return { ...receipt, attempts };
    } catch (error) {
      const code = error instanceof ExternalDataError ? error.code : 'EXTERNAL_NETWORK_ERROR';
      attempts.push({ attempt, outcome: code });
      const retryable = error instanceof RetryableXmHttpError || code === 'EXTERNAL_TIMEOUT' || code === 'EXTERNAL_NETWORK_ERROR';
      if (!retryable || attempt === 2) throw Object.assign(error instanceof Error ? error : new Error('XM request failed'), { attempts });
      await wait(750);
    }
  }
  throw new Error('XM retry loop exhausted');
}

export async function acquireHourlyDemand(range: HourlyDemandRange, transport: Transport = fetch, timeoutMs = 15_000): Promise<HourlyDemandAcquisition> {
  const calendar = days(range);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) return fail('INVALID_XM_TIMEOUT', 'El timeout debe ser positivo.');
  const catalog = await requestXmHourly('/Lists', { MetricId: 'ListadoMetricas' }, transport, timeoutMs);
  const entry = catalogEntry(catalog.rawBody);
  const acquired = await requestXmHourly('/hourly', { MetricId: 'DemaReal', Entity: 'Sistema', StartDate: range.startDate, EndDate: range.endDate, Filter: [] }, transport, timeoutMs);
  const normalized = normalizeHourlyDemand(acquired.rawBody, range);
  return { rawBody: acquired.rawBody, catalogRawBody: catalog.rawBody, normalized,
    manifest: { requestAttempts: { catalog: catalog.attempts, data: acquired.attempts }, status: 'validated', adapterVersion: version, normalizerVersion: version, requestedRange: { ...range },
      catalogRetrievedAt: catalog.retrievedAt, retrievedAt: acquired.retrievedAt,
      rawSha256: sha256(acquired.rawBody), catalogSha256: sha256(catalog.rawBody), normalizedSha256: sha256(JSON.stringify(normalized)), catalogEntry: entry,
      quality: { rulesetId: 'xm_demareal_hourly_capture', rulesetVersion: version, completeDays: calendar.length, recordCount: normalized.records.length, missingPeriods: 0, duplicatePeriods: 0, negativeValues: 0 },
      limitations: ['No equivale a DemaSIN; excluye alumbrado público.', 'No se reconstruyen revisiones ni disponibilidad histórica al origen.', 'Periodos XM preservados; no se infiere zona horaria ni timestamp.', 'Sin preparación Prisma, entrenamiento, inferencia ni validación académica.', 'Acceso público no acredita licencia universal de redistribución.'],
    } };
}

export function replayHourlyDemand(acquisition: HourlyDemandAcquisition) {
  const normalized = normalizeHourlyDemand(acquisition.rawBody, acquisition.manifest.requestedRange);
  const entry = catalogEntry(acquisition.catalogRawBody);
  const m = acquisition.manifest;
  if (m.status !== 'validated' || m.adapterVersion !== version || m.normalizerVersion !== version ||
      m.rawSha256 !== sha256(acquisition.rawBody) || m.catalogSha256 !== sha256(acquisition.catalogRawBody) ||
      m.normalizedSha256 !== sha256(JSON.stringify(normalized)) || JSON.stringify(acquisition.normalized) !== JSON.stringify(normalized) ||
      JSON.stringify(m.catalogEntry) !== JSON.stringify(entry) || m.quality.rulesetId !== 'xm_demareal_hourly_capture' || m.quality.rulesetVersion !== version ||
      m.quality.recordCount !== normalized.records.length || m.quality.completeDays !== days(m.requestedRange).length ||
      m.quality.missingPeriods !== 0 || m.quality.duplicatePeriods !== 0 || m.quality.negativeValues !== 0 ||
      !Number.isFinite(Date.parse(m.retrievedAt)) || !Number.isFinite(Date.parse(m.catalogRetrievedAt))) {
    return fail('XM_DEMAND_EVIDENCE_INVALID', 'Los hashes o metadatos de la captura no coinciden.');
  }
  return normalized;
}

export async function saveHourlyDemand(acquisition: HourlyDemandAcquisition, directory: string) {
  replayHourlyDemand(acquisition);
  const target = resolve(directory);
  // Exclusive directory; never replace an earlier acquisition. Manifest is written last.
  await mkdir(target, { recursive: false });
  await writeFile(resolve(target, 'raw.json'), acquisition.rawBody, { flag: 'wx' });
  await writeFile(resolve(target, 'catalog-raw.json'), acquisition.catalogRawBody, { flag: 'wx' });
  await writeFile(resolve(target, 'normalized.json'), JSON.stringify(acquisition.normalized), { flag: 'wx' });
  await writeFile(resolve(target, 'manifest.json'), JSON.stringify(acquisition.manifest, null, 2) + '\n', { flag: 'wx' });
  return target;
}

/** Discovery allows unpublished days; acquisition still requires a complete contiguous window. */
export async function discoverHourlyDemand(today: string, transport: Transport = fetch) {
  if (!isDate(today)) return fail('INVALID_EXTERNAL_DATES', 'La fecha de referencia no es válida.');
  const day = Date.parse(today), endDate = new Date(day - 86400000).toISOString().slice(0, 10);
  const startDate = new Date(day - 7 * 86400000).toISOString().slice(0, 10);
  const acquired = await requestXmHourly('/hourly', { MetricId: 'DemaReal', Entity: 'Sistema', StartDate: startDate, EndDate: endDate, Filter: [] }, transport, 15000);
  const raw = parse(acquired.rawBody);
  if (!isObject(raw) || !isObject(raw.Metric) || raw.Metric.Id !== 'DemaReal' || !Array.isArray(raw.Items)) return fail('EXTERNAL_RESPONSE_INVALID', 'XM devolvió una respuesta no válida.', 502);
  const seen = new Set<string>(), complete: string[] = [], incompleteDates: string[] = [];
  for (const item of raw.Items) {
    if (!isObject(item) || !isDate(item.Date) || item.Date < startDate || item.Date > endDate || seen.has(item.Date)) return fail('EXTERNAL_RESPONSE_INVALID', 'XM devolvió fechas inválidas o duplicadas.', 502);
    seen.add(item.Date);
    try {
      normalizeHourlyDemand(JSON.stringify({ Metric: raw.Metric, Items: [item] }), { startDate: item.Date, endDate: item.Date });
      complete.push(item.Date);
    } catch (error) {
      if (!(error instanceof ExternalDataError)) throw error;
      incompleteDates.push(item.Date);
    }
  }
  return { ...acquired, requestedRange: { startDate, endDate }, latestCompleteDay: complete.sort().at(-1) ?? null, incompleteDates };
}

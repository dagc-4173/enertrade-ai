import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeXmResponse } from './providers/xm.provider';
import { requestXmHourly } from './xm-hourly-demand-acquisition';
import { ExternalDataError, isDate, isObject, type ExternalDataset } from './types/external-data';

export type MarketSeries = 'supply' | 'price';
export const marketSeries = {
  supply: { metric: 'Gene', target: 'energia_kwh', unit: 'kWh', warning: 'Generación agregada del SIN como aproximación de oferta; no representa disponibilidad ni ofertas de un proveedor.' },
  price: { metric: 'PrecBolsNaci', target: 'precio_cop_kwh', unit: 'COP/kWh', warning: 'Precio de bolsa nacional de referencia; no es una tarifa individual ni un precio de transacción garantizado.' },
} as const;
type Range = { startDate: string; endDate: string };
type Transport = (url: string, init: RequestInit) => Promise<Response>;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const fail = (message: string): never => { throw new ExternalDataError(422, 'CHRONOS_SERIES_INVALID', message); };
const parse = (s: string): unknown => { try { return JSON.parse(s) } catch { return fail('XM devolvió JSON inválido.') } };
const offset = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
function calendar(range: Range) {
  if (!isDate(range.startDate) || !isDate(range.endDate)) return fail('Fechas de contexto inválidas.');
  const count = (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86400000 + 1;
  if (count < 1 || count > 30) return fail('Se admiten entre 1 y 30 días completos.');
  return Array.from({ length: count }, (_, i) => offset(range.startDate, i));
}
export function normalizeMarketSeries(kind: MarketSeries, rawBody: string, range: Range) {
  const definition = marketSeries[kind], expected = calendar(range), raw = parse(rawBody);
  const dataset: ExternalDataset = { id: definition.metric, name: definition.metric, unit: definition.unit, granularity: 'hourly', maxInclusiveDays: 30, supportsFilters: false };
  const normalized = normalizeXmResponse(raw, { provider: 'xm', dataset: definition.metric, ...range }, dataset);
  if (!isObject(raw) || !Array.isArray(raw.Items) || raw.Items.length !== expected.length) return fail('Faltan días del contexto.');
  for (const item of raw.Items) {
    const keys = Object.keys(item.HourlyEntities[0].Values).filter(k => k !== 'code');
    if (keys.length !== 24 || keys.some(k => !/^Hour(0[1-9]|1[0-9]|2[0-4])$/.test(k))) return fail('Se requieren exactamente 24 periodos por día.');
  }
  if (normalized.records.length !== expected.length * 24 || expected.some((d, i) => normalized.records[i * 24]?.date !== d)) return fail('El contexto tiene días faltantes.');
  if (kind === 'supply' && normalized.records.some(r => r.value < 0)) return fail('La generación no puede ser negativa.');
  return { definition: { kind, ...definition }, query: range, records: normalized.records };
}
export function createMarketSeriesAdapter(kind: MarketSeries, transport: Transport = fetch) {
  const definition = marketSeries[kind];
  const query = (range: Range) => requestXmHourly('/hourly', { MetricId: definition.metric, Entity: 'Sistema', StartDate: range.startDate, EndDate: range.endDate, Filter: [] }, transport, 15000);
  return {
    async discover(today: string) {
      if (!isDate(today)) return fail('Fecha inválida.');
      const requestedRange = { startDate: offset(today, -7), endDate: offset(today, -1) };
      const receipt = await query(requestedRange), raw = parse(receipt.rawBody);
      if (!isObject(raw) || !isObject(raw.Metric) || raw.Metric.Id !== definition.metric || !Array.isArray(raw.Items)) return fail('Métrica inesperada.');
      const seen = new Set<string>(), complete: string[] = [], incompleteDates: string[] = [];
      for (const item of raw.Items) {
        if (!isObject(item) || !isDate(item.Date) || item.Date < requestedRange.startDate || item.Date > requestedRange.endDate || seen.has(item.Date)) return fail('Fechas inesperadas o duplicadas.');
        seen.add(item.Date);
        try { normalizeMarketSeries(kind, JSON.stringify({ Metric: raw.Metric, Items: [item] }), { startDate: item.Date, endDate: item.Date }); complete.push(item.Date) }
        catch (e) { if (!(e instanceof ExternalDataError)) throw e; incompleteDates.push(item.Date) }
      }
      return { ...receipt, requestedRange, latestCompleteDay: complete.sort().at(-1) ?? null, incompleteDates };
    },
    async acquire(range: Range) {
      calendar(range);
      const catalog = await requestXmHourly('/Lists', { MetricId: 'ListadoMetricas' }, transport, 15000);
      const rawCatalog = parse(catalog.rawBody);
      if (!isObject(rawCatalog) || !Array.isArray(rawCatalog.Items)) return fail('Catálogo XM inválido.');
      const matches: Record<string, unknown>[] = [];
      for (const item of rawCatalog.Items) {
        if (!isObject(item) || !Array.isArray(item.ListEntities)) return fail('Catálogo XM inválido.');
        for (const entity of item.ListEntities) if (isObject(entity) && isObject(entity.Values) && entity.Values.MetricId === definition.metric && entity.Values.Entity === 'Sistema') matches.push(entity.Values);
      }
      const entry = matches[0];
      if (matches.length !== 1 || !entry || entry.MetricUnits !== definition.unit || entry.Type !== 'HourlyEntities' || entry.Url !== 'https://servapibi.xm.com.co/hourly' || Number(entry.MaxDays) < 30 || !Number.isFinite(Number(entry.MaxDays))) return fail('La definición de la métrica XM cambió.');
      const receipt = await query(range), normalized = normalizeMarketSeries(kind, receipt.rawBody, range), normalizedBody = JSON.stringify(normalized);
      const manifest = { status: 'validated', adapterVersion: '1.0.0', kind, metric: definition.metric, unit: definition.unit, requestedRange: range, retrievedAt: receipt.retrievedAt, catalogRetrievedAt: catalog.retrievedAt, catalogEntry: entry, rawSha256: hash(receipt.rawBody), catalogSha256: hash(catalog.rawBody), normalizedSha256: hash(normalizedBody), recordCount: normalized.records.length };
      return { context: normalized.records.map(r => r.value), rawSha256: manifest.rawSha256, normalizedSha256: manifest.normalizedSha256,
        async save(directory: string) {
          await mkdir(directory);
          for (const [file, text] of [['raw.json', receipt.rawBody], ['catalog-raw.json', catalog.rawBody], ['normalized.json', normalizedBody], ['manifest.json', JSON.stringify(manifest, null, 2)]]) await writeFile(resolve(directory, file!), text!, { flag: 'wx' });
        } };
    },
  };
}

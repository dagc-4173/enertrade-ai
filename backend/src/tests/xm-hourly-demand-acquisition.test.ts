import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireHourlyDemand, normalizeHourlyDemand, replayHourlyDemand, saveHourlyDemand } from '@/integrations/xm-hourly-demand-acquisition';
import { XmProvider } from '@/integrations/providers/xm.provider';

const range = { startDate: '2024-02-29', endDate: '2024-02-29' };
const catalog = () => ({ Items: [{ ListEntities: [{ Values: { MetricId: 'DemaReal', Entity: 'Sistema', MetricUnits: 'kWh', Type: 'HourlyEntities',
  Url: 'https://servapibi.xm.com.co/hourly', MaxDays: 31,
  MetricDescription: 'Demanda de usuarios regulados y no regulados del Sistema Interconectado Nacional (no incluye Alumbrado Público)' } }] }] });
const raw = (dates = ['2024-02-29']) => ({ Metric: { Id: 'DemaReal' }, Items: dates.map(Date => ({ Date, HourlyEntities: [{ Id: 'Sistema',
  Values: { code: 'Sistema', ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`Hour${String(i + 1).padStart(2, '0')}`, `${i}.25000`])) } }] })) });
function transport(data = raw(), metadata = catalog()) {
  const requests: { url: string; init: RequestInit }[] = [];
  return { requests, fetch: async (url: string, init: RequestInit) => { requests.push({ url, init }); return Response.json(url.endsWith('/Lists') ? metadata : data); } };
}

describe('DemaReal hourly capture, HU-01/HU-02, fixtures only', () => {
  test('DR-01: exact request, independent target, 24 periods, stable replay', async () => {
    const source = raw(); (source.Items[0]!.HourlyEntities[0]!.Values as Record<string, string>).Hour01 = '0';
    const t = transport(source); const a = await acquireHourlyDemand(range, t.fetch);
    expect(t.requests.map(r => r.url)).toEqual(['https://servapibi.xm.com.co/Lists', 'https://servapibi.xm.com.co/hourly']);
    expect(JSON.parse(t.requests[1]!.init.body as string)).toEqual({ MetricId: 'DemaReal', Entity: 'Sistema', StartDate: range.startDate, EndDate: range.endDate, Filter: [] });
    expect(t.requests.every(r => r.init.redirect === 'error')).toBe(true);
    expect(a.normalized.definition).toMatchObject({ equivalentToDemaSIN: false, experimental: true, target: 'demanda_real_kwh' });
    expect(a.normalized.records).toHaveLength(24);
    expect(a.normalized.records[0]).toEqual({ fecha_xm: '2024-02-29', periodo: 1, demanda_real_kwh: 0 });
    expect(a.manifest.quality).toMatchObject({ completeDays: 1, recordCount: 24, missingPeriods: 0 });
    expect(replayHourlyDemand(a)).toEqual(a.normalized);
    expect(a.normalized.records.every(row => !('timestamp' in row))).toBe(true);
  });
  test('DR-02: legacy catalog excludes DemaReal; DemaSIN remains daily', async () => {
    const provider = new XmProvider();
    expect(provider.listDatasets().map(d => d.id)).toEqual(['Gene', 'DemaSIN', 'PrecBolsNaci']);
    expect(provider.listDatasets().find(d => d.id === 'DemaSIN')?.granularity).toBe('daily');
    await expect(provider.query({ provider: 'xm', dataset: 'DemaReal', ...range })).rejects.toMatchObject({ code: 'UNSUPPORTED_EXTERNAL_DATASET' });
  });
  test.each([
    { startDate: '2023-02-29', endDate: '2023-02-29' },
    { startDate: '2024-03-01', endDate: '2024-02-29' },
    { startDate: '2024-03-01', endDate: '2024-03-31' },
    { ...range, url: 'https://example.com' },
  ])('DR-03: invalid input rejected before network %j', async input => {
    const t = transport(); await expect(acquireHourlyDemand(input, t.fetch)).rejects.toBeDefined(); expect(t.requests).toHaveLength(0);
  });
  test.each(['missing', 'extra', 'null', 'negative', 'duplicate', 'wrongMetric', 'wrongEntity', 'missingDay', 'nonNumeric'])('DR-04: rejects %s', kind => {
    const source = raw(); const values = source.Items[0]!.HourlyEntities[0]!.Values as Record<string, unknown>;
    if (kind === 'missing') delete values.Hour24;
    if (kind === 'extra') values.Hour25 = '1';
    if (kind === 'null') values.Hour02 = null;
    if (kind === 'negative') values.Hour03 = '-1';
    if (kind === 'duplicate') source.Items.push(structuredClone(source.Items[0]!));
    if (kind === 'wrongMetric') source.Metric.Id = 'DemaSIN';
    if (kind === 'wrongEntity') source.Items[0]!.HourlyEntities[0]!.Id = 'Agente';
    if (kind === 'missingDay') source.Items = [];
    if (kind === 'nonNumeric') values.Hour01 = 'NaN';
    expect(() => normalizeHourlyDemand(JSON.stringify(source), range)).toThrow();
  });
  test('DR-05: leap-day and unordered multi-day data sorted, internal missing day rejected', () => {
    const dates = ['2024-03-01', '2024-02-28', '2024-02-29'];
    const requested = { startDate: '2024-02-28', endDate: '2024-03-01' };
    const n = normalizeHourlyDemand(JSON.stringify(raw(dates)), requested);
    expect(n.records).toHaveLength(72); expect(n.records[0]?.fecha_xm).toBe('2024-02-28'); expect(n.records.at(-1)?.fecha_xm).toBe('2024-03-01');
    expect(() => normalizeHourlyDemand(JSON.stringify(raw(['2024-02-28', '2024-03-01'])), requested)).toThrow();
  });
  test.each(['units', 'resolution', 'scope', 'duplicate'])('DR-06: catalog drift %s blocks data request', async kind => {
    const c = catalog(); const entry = c.Items[0]!.ListEntities[0]!.Values;
    if (kind === 'units') entry.MetricUnits = 'MW';
    if (kind === 'resolution') entry.Type = 'DailyEntities';
    if (kind === 'scope') entry.MetricDescription = 'Otra definición';
    if (kind === 'duplicate') c.Items[0]!.ListEntities.push(structuredClone(c.Items[0]!.ListEntities[0]!));
    const t = transport(raw(), c); await expect(acquireHourlyDemand(range, t.fetch)).rejects.toMatchObject({ code: 'XM_DEMAND_CATALOG_INCOMPATIBLE' }); expect(t.requests).toHaveLength(1);
  });
  test('DR-07: HTTP, malformed JSON, network, oversized response, timeout fail explicitly', async () => {
    await expect(acquireHourlyDemand(range, async () => new Response('private', { status: 503 }))).rejects.toMatchObject({ code: 'EXTERNAL_HTTP_ERROR' });
    await expect(acquireHourlyDemand(range, async () => new Response('{'))).rejects.toMatchObject({ code: 'EXTERNAL_RESPONSE_INVALID' });
    await expect(acquireHourlyDemand(range, async () => { throw Error('private'); })).rejects.toMatchObject({ code: 'EXTERNAL_NETWORK_ERROR' });
    await expect(acquireHourlyDemand(range, async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)))).rejects.toMatchObject({ code: 'XM_DEMAND_RESPONSE_TOO_LARGE' });
    await expect(acquireHourlyDemand(range, async (_url, init) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(Error('private')), { once: true })), 5)).rejects.toMatchObject({ code: 'EXTERNAL_TIMEOUT' });
  });
  test('DR-08: raw/catalog/normalized/quality tampering detected', async () => {
    const a = await acquireHourlyDemand(range, transport().fetch);
    for (const field of ['rawBody', 'catalogRawBody'] as const) {
      const b = structuredClone(a); b[field] += ' '; expect(() => replayHourlyDemand(b)).toThrow();
    }
    const b = structuredClone(a); b.normalized.records[0]!.demanda_real_kwh = 123; expect(() => replayHourlyDemand(b)).toThrow();
    const c = structuredClone(a); c.manifest.quality.recordCount = 1; expect(() => replayHourlyDemand(c)).toThrow();
  });
  test('DR-09: exclusive persistence, replay from disk, no overwrite', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'enertrade-demareal-test-'));
    try {
      const target = join(parent, 'capture'); const a = await acquireHourlyDemand(range, transport().fetch);
      await saveHourlyDemand(a, target);
      const loaded = { rawBody: await readFile(join(target, 'raw.json'), 'utf8'), catalogRawBody: await readFile(join(target, 'catalog-raw.json'), 'utf8'),
        normalized: JSON.parse(await readFile(join(target, 'normalized.json'), 'utf8')), manifest: JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')) };
      expect(replayHourlyDemand(loaded)).toEqual(a.normalized);
      await expect(saveHourlyDemand(a, target)).rejects.toMatchObject({ code: 'EEXIST' });
      expect(await readFile(join(target, 'raw.json'), 'utf8')).toBe(a.rawBody);
    } finally { await rm(parent, { recursive: true, force: true }); }
  });
});

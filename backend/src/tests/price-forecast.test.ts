import { test, expect, mock, afterAll, spyOn } from 'bun:test';
import express from 'express';
import { readFileSync } from 'node:fs';
import artifact from '@/models/xm-preciobolsnaci-b1/1.0.0/rule.json';
import { loadRule, validateRule, createRuleLoader } from '@/models/xm-preciobolsnaci-b1/rule-loader';
import { createPriceForecastService } from '@/services/price-forecast.service';
import { createForecastRouter } from '@/controllers/forecast.controller';
import { messages } from '@/services/forecast.contract';

function fixture(date = '2024-09-28') {
  return { id: 49, sourceDatasetId: 68, profileId: artifact.sourceProfileId, profileVersion: '1.0.0',
    sourceRulesetId: artifact.sourceRulesetId, sourceRulesetVersion: '1.0.0', content: {
      variables: { minimum: [
        { name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' },
        { name: 'periodo', type: 'number', representation: 'integer 1..24' },
        { name: 'precio_cop_kwh', type: 'number', unit: 'COP/kWh' },
      ], context: [] },
      records: Array.from({ length: 24 }, (_, i) => ({ sourceRecordIndex: i, fecha_xm: date, periodo: i + 1,
        precio_cop_kwh: i === 0 ? 0 : i === 1 ? -0.123456789 : 934.62574 + i / 100000 })),
    } };
}
const request = { preparedDatasetId: 49, targetDate: '2024-09-29' };
const app = express();
app.use('/forecasts', createForecastRouter(undefined, undefined, undefined, undefined,
  createPriceForecastService(async id => id === 49 ? fixture() : null)));
app.use('/failure', createForecastRouter(undefined, undefined, undefined, undefined,
  createPriceForecastService(async () => { throw new Error('private database details'); })));
app.use('/bad-rule', createForecastRouter(undefined, undefined, undefined, undefined,
  createPriceForecastService(async () => fixture(), createRuleLoader(() => '{'))));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(r => server.listening ? r() : server.once('listening', r));
const address = server.address(); if (!address || typeof address === 'string') throw Error('listener');
const base = `http://127.0.0.1:${address.port}`;
afterAll(() => new Promise<void>(r => server.close(() => r())));
const post = (body: unknown, path = '/forecasts/price') => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('HU08 exact HTTP response with 24 precise prices and honest scope', async () => {
  const response = await post(request); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'available', preparedDatasetId: 49, sourceDatasetId: 68,
    forecastType: 'market_reference_price', target: 'precio_cop_kwh', unit: 'COP/kWh', granularity: 'hourly', horizonDays: 1,
    rule: { id: artifact.ruleId, version: '1.0.0', type: 'deterministic_baseline', description: 'same period previous day' },
    targetDate: request.targetDate, predictions: fixture().content.records.map(r => ({ periodo: r.periodo, precio_cop_kwh: r.precio_cop_kwh })),
    factors: artifact.factors, scope: artifact.scope });
});
test('D-1 only, arbitrary input order, no target/future prices, no fetch or source mutation', async () => {
  const p = fixture(); p.content.records.reverse();
  p.content.records.push({ sourceRecordIndex: 24, fecha_xm: request.targetDate, periodo: 1, precio_cop_kwh: NaN },
    { sourceRecordIndex: 25, fecha_xm: '2024-09-30', periodo: 1, precio_cop_kwh: Infinity },
    { sourceRecordIndex: 26, fecha_xm: '2024-09-27', periodo: 1, precio_cop_kwh: 99999 });
  const before = structuredClone(p), read = mock(async () => p);
  const denyFetch = Object.assign(() => { throw Error('unexpected fetch'); }, { preconnect: globalThis.fetch.preconnect });
  const forbidden = spyOn(globalThis, 'fetch').mockImplementation(denyFetch);
  try {
    const result = await createPriceForecastService(read)(request);
    expect(result.predictions).toEqual(fixture().content.records.map(r => ({ periodo: r.periodo, precio_cop_kwh: r.precio_cop_kwh })));
    expect(read).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledWith(49);
    expect(forbidden).not.toHaveBeenCalled(); expect(p).toEqual(before);
  } finally { forbidden.mockRestore(); }
});
test('array request rejected', async () => { const r = await post([]); expect(r.status).toBe(400); });
test.each([{}, null, { ...request, extra: true }, { targetDate: request.targetDate },
  { ...request, preparedDatasetId: '49' }, { ...request, preparedDatasetId: 0 },
  { ...request, preparedDatasetId: 1.2 }, { ...request, preparedDatasetId: 2147483648 }])('invalid structure %j', async body => {
  const r = await post(body); expect(r.status).toBe(400); expect((await r.json() as { error: string }).error).toBe('INVALID_FORECAST_REQUEST');
});
test.each(['2024-02-30', '2023-02-29', '2024-9-29', '2024-09-29T00:00:00Z', '', null, 20240929])('invalid calendar %j is 422', async targetDate => {
  const r = await post({ ...request, targetDate }); expect(r.status).toBe(422); expect((await r.json() as { error: string }).error).toBe('INVALID_FORECAST_DATE');
});
test.each([['2024-03-01', '2024-02-29'], ['2025-01-01', '2024-12-31'], ['2023-08-02', '2023-08-01']])('calendar rollover and no training cutoff %s', async (targetDate, prior) => {
  expect((await createPriceForecastService(async () => fixture(prior))({ ...request, targetDate })).predictions).toHaveLength(24);
});
test('missing dataset safe 404', async () => { const r = await post({ ...request, preparedDatasetId: 2147483647 }); expect(r.status).toBe(404); expect((await r.json() as { error: string }).error).toBe('PREPARED_DATASET_NOT_FOUND'); });
test.each(['profileId', 'profileVersion', 'sourceRulesetId', 'sourceRulesetVersion'] as const)('incompatible %s', async key => {
  const p = fixture(); p[key] = 'other'; await expect(createPriceForecastService(async () => p)(request)).rejects.toMatchObject({ status: 422, code: 'FORECAST_PROFILE_NOT_APPLICABLE' });
});
test.each(['missing', 'incomplete'])('insufficient D-1 %s', async kind => {
  const p = fixture(); if (kind === 'missing') p.content.records = []; else p.content.records.pop();
  await expect(createPriceForecastService(async () => p)(request)).rejects.toMatchObject({ status: 422, code: 'FORECAST_DATA_INSUFFICIENT' });
});
test('HTTP unavailable envelope', async () => { const r = await post({ ...request, targetDate: '2024-10-01' }); expect(r.status).toBe(422); expect(await r.json()).toEqual({ status: 'unavailable', error: 'FORECAST_DATA_INSUFFICIENT', message: messages.FORECAST_DATA_INSUFFICIENT }); });
test('duplicate D-1 period is corrupt, no silent replacement', async () => { const p = fixture(); p.content.records.push({ ...p.content.records[0]! }); await expect(createPriceForecastService(async () => p)(request)).rejects.toMatchObject({ status: 409, code: 'PREPARED_DATASET_INCONSISTENT' }); });
test.each([NaN, Infinity, '934', null])('corrupt price %j', async value => {
  const p: any = fixture(); p.content.records[0].precio_cop_kwh = value;
  await expect(createPriceForecastService(async () => p)(request)).rejects.toMatchObject({ status: 409 });
});
test.each([0, 25, 1.5, '1'])('corrupt period %j', async value => {
  const p: any = fixture(); p.content.records[0].periodo = value;
  await expect(createPriceForecastService(async () => p)(request)).rejects.toMatchObject({ status: 409 });
});
test('incompatible variable unit', async () => { const p = fixture(); p.content.variables.minimum[2]!.unit = 'kWh'; await expect(createPriceForecastService(async () => p)(request)).rejects.toMatchObject({ status: 409 }); });
test('parser, query, content type and safe internal failure', async () => {
  expect((await fetch(base + '/forecasts/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status).toBe(400);
  expect((await post(request, '/forecasts/price?ruleVersion=2')).status).toBe(400);
  expect((await fetch(base + '/forecasts/price', { method: 'POST', body: '{}' })).status).toBe(415);
  const r = await post(request, '/failure/price'); expect(r.status).toBe(500); expect(await r.json()).toEqual({ error: 'FORECAST_FAILED', message: messages.FORECAST_FAILED });
  const bad = await post(request, '/bad-rule/price'); expect(bad.status).toBe(409); expect(await bad.json()).toEqual({ error: 'FORECAST_RULE_INCOMPATIBLE', message: messages.FORECAST_RULE_INCOMPATIBLE });
});
test('strict valid rule, cache, detached deep freeze', () => {
  const r = validateRule(artifact); expect(r).toEqual(artifact); expect(r).not.toBe(artifact);
  expect(Object.isFrozen(r.evaluation.externalHoldout.metrics)).toBe(true); expect(Object.isFrozen(r.factors.used)).toBe(true);
  const read = mock(() => JSON.stringify(artifact)), load = createRuleLoader(read); expect(load()).toBe(load()); expect(read).toHaveBeenCalledTimes(1); expect(loadRule()).toBe(loadRule());
});
test.each(['missing', 'invalid-json'])('loader caches safe failure %s', kind => {
  const read = mock(() => { if (kind === 'missing') throw Error('private path'); return '{'; }); const load = createRuleLoader(read);
  expect(load).toThrow(messages.FORECAST_RULE_INCOMPATIBLE); expect(load).toThrow(messages.FORECAST_RULE_INCOMPATIBLE); expect(read).toHaveBeenCalledTimes(1);
});
test.each(['ruleId', 'ruleVersion', 'type', 'formula', 'sourceProfileId', 'corpusSnapshotSha256', 'externalHoldoutSnapshotSha256', 'evaluation', 'promotionCriterion', 'passed', 'limitations'])('loader rejects changed or missing %s', key => {
  const a: any = structuredClone(artifact); a[key] = null; expect(() => validateRule(a)).toThrow(messages.FORECAST_RULE_INCOMPATIBLE); delete a[key]; expect(() => validateRule(a)).toThrow();
});
test('loader rejects extra fields, bad metric/range/hash, NaN and injected scaler', () => {
  for (const change of [(a: any) => a.extra = true, (a: any) => a.scaler = {}, (a: any) => a.evaluation.validation.metrics.MAE = NaN,
    (a: any) => a.evaluation.externalHoldout.metrics.WAPE++, (a: any) => a.evaluation.internalTest.range.end = '2024-07-29',
    (a: any) => a.evaluation.externalHoldout.snapshotSha256 = 'a'.repeat(64)]) {
    const a = structuredClone(artifact); change(a); expect(() => validateRule(a)).toThrow(messages.FORECAST_RULE_INCOMPATIBLE);
  }
});
test('versioned metrics/ranges/hashes and passed criterion exactly match evidence', () => {
  const base = JSON.parse(readFileSync(new URL('../../../docs/evidencias/hu-08-precio/baselines/metrics.json', import.meta.url), 'utf8'));
  const ext = JSON.parse(readFileSync(new URL('../../../docs/evidencias/hu-08-precio/external-holdout/metrics.json', import.meta.url), 'utf8'));
  expect(artifact.corpusSnapshotSha256).toBe(base.snapshot.sha256); expect(artifact.externalHoldoutSnapshotSha256).toBe(ext.snapshotSha256);
  for (const [name, actual] of Object.entries({ validation: base.validation.B1, internalTest: base.test.B1, externalHoldout: ext.metrics })) {
    const recorded = artifact.evaluation[name as keyof typeof artifact.evaluation];
    for (const [key, value] of Object.entries(recorded.metrics)) expect(value).toEqual(actual[key]);
    expect(recorded.snapshotSha256).toBe(name === 'externalHoldout' ? ext.snapshotSha256 : base.snapshot.sha256);
    const range = name === 'externalHoldout' ? ext.range : base.partitions[name === 'internalTest' ? 'test' : 'validation'];
    expect(recorded.range).toEqual({ startDate: range.startDate, endDate: range.endDate });
  }
  expect(artifact.promotionCriterion).toEqual(ext.predefinedStabilityRule); expect(artifact.passed).toBe(ext.decision.passed);
  expect(artifact.evaluation.externalHoldout.metrics.MAE).toBeLessThanOrEqual(artifact.promotionCriterion.maximumExternalMAE);
});
test('production dependency boundary: one read, no writes/fetch/training/HU04/HU06/preparation', () => {
  const source = readFileSync(new URL('../services/price-forecast.service.ts', import.meta.url), 'utf8');
  expect(source.match(/prisma\.\w+\.\w+/g)).toEqual(['prisma.preparedDataset.findUnique']);
  expect(source).not.toMatch(/fetch\s*\(|prepareDataset\s*\(|forecastSupply|forecastDemand|XmProvider|\bfit\s*\(|\.create\(|\.update\(|\.delete\(/);
  expect(source.match(/from ['"][^'"]+['"]/g)).toEqual(["from '@/lib/prisma'", "from '@/models/xm-preciobolsnaci-b1/rule-loader'", "from './forecast.contract'"]);
});

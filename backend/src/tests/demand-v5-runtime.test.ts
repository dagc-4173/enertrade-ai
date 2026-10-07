import { expect, test } from 'bun:test';
import express from 'express';
import { readFileSync } from 'node:fs';
import { addDays } from '@/experiments/hu06-multihorizon';
import { buildV5Features } from '@/experiments/hu06-demand-v5-preregistration';
import { createDirectDemandV5ModelLoader, loadDirectDemandV5Model, validateDirectDemandV5Model } from '@/models/xm-demandasin-ridge-direct-v5/model-loader';
import { demandCompatibility } from '@/services/demand-direct-forecast.service';
import { buildRuntimeDemandV5Features } from '@/services/demand-v5-features';
import { resolveDemandV5Origin } from '@/services/demand-v5-origin.service';
import { createDemandV5ForecastService } from '@/services/demand-v5-forecast.service';
import { coverageFromConsolidated } from '@/services/xm-coverage.service';
import { createXmDailySyncService, type XmDailySyncDependencies } from '@/services/xm-daily-sync.service';
import { createForecastRouter } from '@/controllers/forecast.controller';
import { createXmDailySyncRouter } from '@/controllers/xm-daily-sync.controller';

const records = Array.from({ length: 70 }, (_, index) => ({ fecha_xm: addDays('2026-10-04', index - 69), demanda_kwh: ['2026-09-16', '2026-09-28', '2026-09-29', '2026-10-04'].includes(addDays('2026-10-04', index - 69)) ? 1 : 220_000_000 + (index % 3) * 1_000_000 }));
const coverage = () => coverageFromConsolidated('DemaSIN', [{ energyDataset: { content: { records } } }])!;
const prepared = (id: number, rows = records) => ({ id, sourceDatasetId: id + 100, ...demandCompatibility,
  content: { variables: { minimum: [{ name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' }, { name: 'demanda_kwh', type: 'number', unit: 'kWh' }] }, records: rows } });
const now = () => new Date('2026-10-06T23:00:00.000Z');

test.each([1, 2, 3, 4, 5, 6])('V5 loader h%s exactly preserves frozen fields and deep freezes parameters', horizon => {
  const source = readFileSync(new URL(`../../../docs/evidencias/hu-06-demand-v5-frozen-models/h${horizon}.json`, import.meta.url), 'utf8');
  const frozen = JSON.parse(source), model = loadDirectDemandV5Model(horizon);
  for (const field of ['modelId', 'modelVersion', 'horizonDays', 'coefficients', 'intercept', 'scaler', 'selectedAlpha', 'baselineReference', 'corpusHash', 'preregistrationCommit', 'preregistrationTag', 'preregistrationCutoff', 'orderedFeatures', 'state', 'academicValidation'] as const) expect(model[field]).toEqual(frozen[field]);
  expect(model.modelStatus).toBe('experimental');
  expect(Object.isFrozen(model.scaler.means)).toBe(true);
});

test('V5 loader rejects identity, scaler, hash, feature order and pending-state tampering without fallback', () => {
  const source = readFileSync(new URL('../../../docs/evidencias/hu-06-demand-v5-frozen-models/h4.json', import.meta.url), 'utf8');
  const artifact = JSON.parse(readFileSync(new URL('../models/xm-demandasin-ridge-direct-h4-v5/1.0.0/model.json', import.meta.url), 'utf8'));
  for (const change of [(value: any) => { value.coefficients[0]++; }, (value: any) => { value.scaler.means.pop(); }, (value: any) => { value.scaler.standardDeviations[0] = 0; },
    (value: any) => { value.orderedFeatures.reverse(); }, (value: any) => { value.modelVersion = 'other'; }, (value: any) => { value.academicValidation = 'validated'; },
    (value: any) => { value.corpusHash = 'a'.repeat(64); }, (value: any) => { value.selectedAlpha = 999; }, (value: any) => { value.preregistrationCutoff = '2026-10-02T00:00:00.000Z'; }]) {
    const modified = structuredClone(artifact); change(modified);
    expect(() => validateDirectDemandV5Model(modified, 4, source)).toThrow();
  }
  const called: number[] = [];
  const loader = createDirectDemandV5ModelLoader(horizon => { called.push(horizon); throw new Error('missing'); }, () => source);
  expect(() => loader(4)).toThrow(); expect(called).toEqual([4]);
  expect(() => loadDirectDemandV5Model(7)).toThrow();
  expect(() => loadDirectDemandV5Model(1.5)).toThrow();
});

test('runtime facade is vector-identical to preregistered V5, skips only statistical excluded observations', () => {
  const built = buildRuntimeDemandV5Features(records, '2026-10-03', '2026-10-09', 6)!;
  expect(built).toEqual(buildV5Features(records, '2026-10-03', '2026-10-09', 6)!);
  expect(built.values).toHaveLength(16); expect(built.actualSourceDates).toHaveLength(28);
  expect(built.calendarSpanDays).toBeLessThanOrEqual(42);
  expect(built.featureDates.every(date => date <= '2026-10-03')).toBe(true);
  for (const date of ['2026-09-16', '2026-09-28', '2026-09-29', '2026-10-04']) expect(built.featureDates).not.toContain(date);
  expect(buildRuntimeDemandV5Features(records, '2026-10-04', '2026-10-05', 1)).toBeNull();
  expect(buildRuntimeDemandV5Features(records.filter(row => row.fecha_xm !== '2026-09-26'), '2026-10-03', '2026-10-09', 6)).toBeNull();
});

test('shared resolver finds latest closed V5 origin and traces multiple identical prepared datasets', () => {
  const result = resolveDemandV5Origin(coverage(), [prepared(2), prepared(1)], now())!;
  expect(result.forecastOriginDate).toBe('2026-10-03');
  expect(result.constructibility.count).toBe(28);
  expect(result.sourceArtifacts).toEqual([{ preparedDatasetId: 1, sourceDatasetId: 101 }, { preparedDatasetId: 2, sourceDatasetId: 102 }]);
  expect(resolveDemandV5Origin(coverage(), [prepared(1)], new Date('2026-10-04T02:00:00.000Z'))!.forecastOriginDate).toBe('2026-10-02');
});

test('prepared conflicts and disagreements with consolidated values fail closed', () => {
  const changed = prepared(2, records.map(row => row.fecha_xm === '2026-10-02' ? { ...row, demanda_kwh: row.demanda_kwh + 1 } : row));
  expect(() => resolveDemandV5Origin(coverage(), [prepared(1), changed], now())).toThrow();
  expect(() => resolveDemandV5Origin(coverage(), [changed], now())).toThrow();
  expect(resolveDemandV5Origin(coverage(), [], now())).toBeNull();
});

test.each([1, 2, 3, 4, 5, 6])('V5 forecast h%s is direct, source traced and experimental/pending', async horizon => {
  const origin = '2026-10-03', targetDate = addDays(origin, horizon);
  const usableCoverage = coverageFromConsolidated('DemaSIN', [{ energyDataset: { content: { records: records.filter(row => row.fecha_xm <= origin) } } }])!;
  const service = createDemandV5ForecastService(async () => [prepared(1)], async () => usableCoverage, loadDirectDemandV5Model, () => new Date('2026-10-04T12:00:00.000Z'));
  if (horizon === 1) {
    await expect(service({ targetDate })).rejects.toMatchObject({ code: 'FORECAST_DATE_NOT_SUPPORTED' });
    return;
  }
  const result = await service({ targetDate });
  expect(result).toMatchObject({ status: 'available', forecastOriginDate: origin, targetDate, horizonDays: horizon,
    modelId: `xm-demandasin-ridge-direct-h${horizon}-v5`, modelVersion: 'hu06-demand-v5-c-primary@1.0.0', modelStatus: 'experimental',
    modelState: 'pendingProspectiveValidation', academicValidation: 'pending', unit: 'kWh', confidence: null, confidenceStatus: 'not_defined' });
  expect(result.featureSourceDates.every(date => date <= origin)).toBe(true);
  expect(result.actualSourceDates).toHaveLength(28);
  expect(result.sourceArtifacts).toEqual([{ preparedDatasetId: 1, sourceDatasetId: 101 }]);
  expect(Number.isFinite(result.prediction.demanda_kwh)).toBe(true);
});

test('V5 rejects past/current/received targets and h7 without recursing or falling back', async () => {
  const service = createDemandV5ForecastService(async () => [prepared(1)], async () => coverage(), loadDirectDemandV5Model, now);
  for (const targetDate of ['2026-10-04', '2026-10-05', '2026-10-06']) await expect(service({ targetDate })).rejects.toMatchObject({ code: 'FORECAST_DATE_NOT_SUPPORTED' });
  await expect(service({ targetDate: '2026-10-10' })).rejects.toMatchObject({ status: 422, code: 'FORECAST_HORIZON_NOT_SUPPORTED' });
  await expect(service({ targetDate: '2026-10-07', preparedDatasetId: 1 })).rejects.toMatchObject({ status: 400, code: 'INVALID_FORECAST_REQUEST' });
  const called: number[] = [];
  const missing = createDemandV5ForecastService(async () => [prepared(1)], async () => coverage(), horizon => { called.push(horizon); throw new Error('missing h4'); }, now);
  await expect(missing({ targetDate: '2026-10-07' })).rejects.toThrow('missing h4');
  expect(called).toEqual([4]);
});

function availabilityDependencies(loadDemandModel = loadDirectDemandV5Model, rows = [prepared(1)]): XmDailySyncDependencies {
  const forbidden = async (): Promise<never> => { throw new Error('Synchronization forbidden in forecast test'); };
  return { readCoverage: async () => coverage(), readDemandPrepared: async () => rows, loadDemandModel, now,
    query: forbidden, ingest: forbidden, materialize: forbidden, validate: forbidden, prepare: forbidden };
}

test('every announced V5 target resolves HTTP POST with exactly the same origin, horizon and model', async () => {
  const sync = createXmDailySyncService(availabilityDependencies());
  const forecast = createDemandV5ForecastService(async () => [prepared(1)], async () => coverage(), loadDirectDemandV5Model, now);
  const app = express();
  app.use(createXmDailySyncRouter(sync, (_req, _res, next) => next()));
  app.use('/forecasts', createForecastRouter(undefined, undefined, forecast));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No listener');
    const url = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${url}/forecast-availability`);
    expect(response.status).toBe(200);
    const body = await response.json() as { availability: { series: string; eligibleFutureTargetDates: string[]; modelMinTargetDate: string; modelMaxTargetDate: string }[] };
    const demand = body.availability.find(item => item.series === 'DemaSIN')!;
    expect(demand.eligibleFutureTargetDates).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
    expect(demand.modelMinTargetDate).toBe('2026-10-04'); expect(demand.modelMaxTargetDate).toBe('2026-10-09');
    for (const targetDate of demand.eligibleFutureTargetDates) {
      const response = await fetch(`${url}/forecasts/demand`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDate }) });
      expect(response.status).toBe(200);
      const horizonDays = Number(targetDate.slice(-2)) - 3;
      expect(await response.json()).toMatchObject({ forecastOriginDate: '2026-10-03', horizonDays, modelId: `xm-demandasin-ridge-direct-h${horizonDays}-v5`, modelState: 'pendingProspectiveValidation', academicValidation: 'pending' });
    }
    for (const [targetDate, code] of [['2026-10-06', 'FORECAST_DATE_NOT_SUPPORTED'], ['2026-10-10', 'FORECAST_HORIZON_NOT_SUPPORTED']]) {
      const response = await fetch(`${url}/forecasts/demand`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDate }) });
      expect(response.status).toBe(422); expect(await response.json()).toMatchObject({ error: code });
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('availability never advertises a missing model and conflicts are also rejected by forecast', async () => {
  const load = (horizon: number) => { if (horizon === 5) throw new Error('missing h5'); return loadDirectDemandV5Model(horizon); };
  const sync = createXmDailySyncService(availabilityDependencies(load));
  expect((await sync.availability()).find(item => item.series === 'DemaSIN')!.eligibleFutureTargetDates).toEqual(['2026-10-07', '2026-10-09']);
  const forecast = createDemandV5ForecastService(async () => [prepared(1)], async () => coverage(), load, now);
  await expect(forecast({ targetDate: '2026-10-08' })).rejects.toThrow('missing h5');
  const changed = prepared(2, records.map(row => row.fecha_xm === '2026-10-02' ? { ...row, demanda_kwh: row.demanda_kwh + 1 } : row));
  const badSync = createXmDailySyncService(availabilityDependencies(loadDirectDemandV5Model, [prepared(1), changed]));
  await expect(badSync.availability()).rejects.toMatchObject({ code: 'PREPARED_DATASET_INCONSISTENT' });
  const badForecast = createDemandV5ForecastService(async () => [prepared(1), changed], async () => coverage(), loadDirectDemandV5Model, now);
  await expect(badForecast({ targetDate: '2026-10-07' })).rejects.toMatchObject({ code: 'PREPARED_DATASET_INCONSISTENT' });
});
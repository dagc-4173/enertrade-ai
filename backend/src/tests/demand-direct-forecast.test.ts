import { expect, test } from 'bun:test';
import express from 'express';
import { readFileSync } from 'node:fs';
import { parseCsv } from '@/experiments/hu06-multihorizon';
import { loadDirectDemandModel, createDirectDemandModelLoader } from '@/models/xm-demandasin-ridge-direct-v2/model-loader';
import { buildDemandDirectFeatures } from '@/services/demand-direct-features';
import { createDirectDemandForecastService, demandCompatibility } from '@/services/demand-direct-forecast.service';
import { getDirectDemandMetrics } from '@/services/demand-direct-metrics.service';
import { createForecastRouter } from '@/controllers/forecast.controller';

const corpus = parseCsv(readFileSync(new URL('../../../docs/evidencias/hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv', import.meta.url), 'utf8'));
const history = corpus.filter(row => row.fecha_xm >= '2026-05-01' && row.fecha_xm <= '2026-05-31');
const prepared = (id: number, records = history) => ({ id, sourceDatasetId: id + 100, ...demandCompatibility, content: { variables: { minimum: [{ name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' }, { name: 'demanda_kwh', type: 'number', unit: 'kWh' }] }, records } });
const coverage = { historicalFrom: '2026-05-01', persistedUntil: '2026-05-31', latestReceivedDate: '2026-05-31', latestIndividuallyUsableDate: '2026-05-31', semanticExcludedDates: [] };
const service = (rows = [prepared(1)], model = loadDirectDemandModel) => createDirectDemandForecastService(async () => rows, async () => coverage, model, () => new Date('2026-05-31T12:00:00'));

test.each([1, 2, 3, 4, 5, 6])('direct demand h%s uses only its own frozen model and observed origin', async horizonDays => {
  const targetDate = new Date(Date.UTC(2026, 4, 31 + horizonDays)).toISOString().slice(0, 10);
  const selected = loadDirectDemandModel(horizonDays), features = buildDemandDirectFeatures(new Map(history.map(row => [row.fecha_xm, row.demanda_kwh])), '2026-05-31', targetDate)!;
  const expected = selected.intercept + features.values.reduce((sum, value, index) => sum + selected.coefficients[index]! * ((value - selected.scaler.means[index]!) / selected.scaler.standardDeviations[index]!), 0);
  const result = await service()({ targetDate });
  expect(result).toMatchObject({ forecastOriginDate: '2026-05-31', horizonDays, modelId: `xm-demandasin-ridge-direct-h${horizonDays}-v2`, modelVersion: '1.0.0-experimental', modelStatus: 'experimental', academicValidation: 'pending', sourceArtifacts: [{ preparedDatasetId: 1, sourceDatasetId: 101 }], prediction: { demanda_kwh: expected } });
  expect(features.featureDates.every(date => date <= result.forecastOriginDate)).toBe(true);
});

test('h7 and unavailable model never recurse or fallback to h1', async () => {
  await expect(service()({ targetDate: '2026-06-07' })).rejects.toMatchObject({ status: 422, code: 'FORECAST_HORIZON_NOT_SUPPORTED' });
  const called: number[] = [];
  const load = (horizonDays: number) => { called.push(horizonDays); throw new Error('missing h4'); };
  await expect(service([prepared(1)], load)({ targetDate: '2026-06-04' })).rejects.toThrow('missing h4');
  expect(called).toEqual([4]);
  expect(() => loadDirectDemandModel(7)).toThrow();
});

test('equal overlapping prepared observations merge; conflicting values fail closed', async () => {
  const compatible = [prepared(1), prepared(2)];
  expect((await service(compatible)({ targetDate: '2026-06-01' })).sourceArtifacts).toEqual([{ preparedDatasetId: 1, sourceDatasetId: 101 }, { preparedDatasetId: 2, sourceDatasetId: 102 }]);
  const conflicting = prepared(2, history.map(row => row.fecha_xm === '2026-05-30' ? { ...row, demanda_kwh: row.demanda_kwh + 1 } : row));
  await expect(service([prepared(1), conflicting])({ targetDate: '2026-06-01' })).rejects.toMatchObject({ status: 409, code: 'PREPARED_DATASET_INCONSISTENT' });
});

test('excluded origin or rolling observation is never silently imputed', async () => {
  const excluded = prepared(1, history.map(row => row.fecha_xm === '2026-05-25' ? { ...row, demanda_kwh: 1 } : row));
  await expect(service([excluded])({ targetDate: '2026-06-01' })).rejects.toMatchObject({ status: 422, code: 'FORECAST_SEMANTIC_DATA_UNAVAILABLE' });
  const missing = prepared(1, history.filter(row => row.fecha_xm !== '2026-05-25'));
  await expect(service([missing])({ targetDate: '2026-06-01' })).rejects.toMatchObject({ status: 422, code: 'FORECAST_SEMANTIC_DATA_UNAVAILABLE' });
});

test('loader rejects tampered scalers, altered metadata and missing h4 without reading h1', () => {
  const evidence = readFileSync(new URL('../../../docs/evidencias/hu-06-multihorizon-v3-semantic/results.json', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../models/xm-demandasin-ridge-direct-h4-v2/1.0.0/model.json', import.meta.url), 'utf8');
  for (const change of [(value: any) => { value.coefficients[0]++; }, (value: any) => { value.scaler.means.pop(); }, (value: any) => { value.academicValidation = 'validated'; }]) {
    const modified = JSON.parse(model); change(modified);
    expect(() => createDirectDemandModelLoader(() => JSON.stringify(modified), () => evidence)(4)).toThrow();
  }
  const called: number[] = [];
  expect(() => createDirectDemandModelLoader(horizonDays => { called.push(horizonDays); throw new Error('missing'); }, () => evidence)(4)).toThrow();
  expect(called).toEqual([4]);
});

test.each([1, 6])('direct demand metrics h%s retain frozen retrospective evidence', horizonDays => {
  const result = getDirectDemandMetrics(horizonDays), model = loadDirectDemandModel(horizonDays);
  expect(result).toMatchObject({ modelId: model.modelId, modelVersion: model.modelVersion, modelStatus: 'experimental', academicValidation: 'pending', evaluationType: 'retrospective_technical', validationRange: model.validationRange, retrospectiveEvaluationRange: model.retrospectiveEvaluationRange,
    evaluation: { type: 'retrospective_technical', MAE: { value: model.metrics.retrospectiveEvaluation.MAE }, evaluable: model.metrics.retrospectiveEvaluation.evaluable } });
});
test('direct demand metrics h7 is unsupported', () => {
  expect(() => getDirectDemandMetrics(7)).toThrow();
});

test('HTTP demand request needs only targetDate; metrics select h1/h6 and reject h7', async () => {
  const app = express(); app.use('/forecasts', createForecastRouter(undefined, undefined, service(), getDirectDemandMetrics));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No HTTP listener');
    const url = `http://127.0.0.1:${address.port}/forecasts/demand`;
    for (const [targetDate, horizonDays] of [['2026-06-01', 1], ['2026-06-06', 6]] as const) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDate }) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ targetDate, forecastOriginDate: '2026-05-31', horizonDays, modelId: `xm-demandasin-ridge-direct-h${horizonDays}-v2` });
      const metrics = await fetch(`${url}/metrics?horizonDays=${horizonDays}`);
      expect(metrics.status).toBe(200); expect(await metrics.json()).toMatchObject({ horizonDays, evaluationType: 'retrospective_technical' });
    }
    const unsupported = await fetch(`${url}/metrics?horizonDays=7`);
    expect(unsupported.status).toBe(422); expect(await unsupported.json()).toMatchObject({ error: 'FORECAST_HORIZON_NOT_SUPPORTED' });
    const badRequest = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDate: '2026-06-01', preparedDatasetId: 1 }) });
    expect(badRequest.status).toBe(400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
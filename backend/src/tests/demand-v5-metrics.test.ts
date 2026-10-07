import { expect, test } from 'bun:test';
import express from 'express';
import { readFileSync } from 'node:fs';
import { getDemandV5Metrics } from '@/services/demand-v5-metrics.service';
import { loadDirectDemandV5Model, validateDirectDemandV5Model } from '@/models/xm-demandasin-ridge-direct-v5/model-loader';
import { createForecastRouter } from '@/controllers/forecast.controller';
import { createDemandV5ForecastService } from '@/services/demand-v5-forecast.service';
import { demandCompatibility } from '@/services/demand-direct-forecast.service';
import { coverageFromConsolidated } from '@/services/xm-coverage.service';
import { addDays } from '@/experiments/hu06-multihorizon';
import { ForecastError } from '@/services/forecast.contract';

test.each([1, 2, 3, 4, 5, 6])('metrics V5 h%s project only frozen VALIDATION values and identity', horizonDays => {
  const source = JSON.parse(readFileSync(new URL(`../../../docs/evidencias/hu-06-demand-v5-frozen-models/h${horizonDays}.json`, import.meta.url), 'utf8'));
  const result = getDemandV5Metrics(horizonDays), model = loadDirectDemandV5Model(horizonDays);
  expect(result).toMatchObject({ modelId: model.modelId, modelVersion: model.modelVersion, horizonDays, active: true,
    modelStatus: 'experimental', academicValidation: 'pending', modelState: 'pendingProspectiveValidation', evaluationType: 'validation_technical',
    unit: 'kWh', forecastType: 'aggregate_demand_proxy', target: 'demanda_kwh', validationRange: source.validationRange, baselineReference: source.baselineReference });
  expect(result.training.sourceRange).toEqual(source.trainingRange);
  expect(result.evaluation).toEqual({ type: 'validation_technical', range: source.validationRange, snapshotSha256: source.corpusHash,
    evaluable: source.validationMetrics.evaluable, unavailable: source.validationMetrics.unavailable,
    MAE: { value: source.validationMetrics.MAE, unit: 'kWh' }, RMSE: { value: source.validationMetrics.RMSE, unit: 'kWh' },
    bias: { value: source.validationMetrics.bias, unit: 'kWh' }, percentageError: { metric: 'WAPE', value: source.validationMetrics.WAPE, unit: 'percent' },
    maxAbsoluteError: { value: source.validationMetrics.maxAbsoluteErrorKwh, unit: 'kWh' } });
  expect(result).not.toHaveProperty('retrospectiveEvaluationRange');
  expect(result).not.toHaveProperty('replacementCandidate');
});

async function withRouter(action: (base: string) => Promise<void>, metrics?: (horizon: number) => unknown) {
  const records = Array.from({ length: 65 }, (_, index) => ({ fecha_xm: addDays('2026-10-03', index - 64), demanda_kwh: 220_000_000 + (index % 3) * 1_000_000 }));
  const prepared = { id: 1, sourceDatasetId: 10, ...demandCompatibility, content: { variables: { minimum: [{ name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' }, { name: 'demanda_kwh', type: 'number', unit: 'kWh' }] }, records } };
  const coverage = coverageFromConsolidated('DemaSIN', [{ energyDataset: { content: { records } } }])!;
  const forecast = createDemandV5ForecastService(async () => [prepared], async () => coverage, loadDirectDemandV5Model, () => new Date('2026-10-04T12:00:00.000Z'));
  const app = express(); app.use('/forecasts', createForecastRouter(undefined, undefined, forecast, metrics));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('NO_LISTENER');
    await action(`http://127.0.0.1:${address.port}/forecasts`);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('HTTP h1..h6 metrics use V5 and every future forecast has exactly the same identity', async () => {
  await withRouter(async base => {
    for (let horizon = 1; horizon <= 6; horizon++) {
      const response = await fetch(`${base}/demand/metrics?horizonDays=${horizon}`);
      expect(response.status).toBe(200);
      const metrics = await response.json() as { modelId: string; modelVersion: string; horizonDays: number; evaluationType: string };
      expect(metrics).toMatchObject({ modelId: `xm-demandasin-ridge-direct-h${horizon}-v5`, modelVersion: 'hu06-demand-v5-c-primary@1.0.0', horizonDays: horizon, evaluationType: 'validation_technical' });
      const forecastResponse = await fetch(`${base}/demand`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDate: addDays('2026-10-03', horizon) }) });
      if (horizon === 1) { expect(forecastResponse.status).toBe(422); continue; }
      expect(forecastResponse.status).toBe(200);
      const forecast = await forecastResponse.json() as { modelId: string; modelVersion: string; horizonDays: number };
      expect([metrics.modelId, metrics.modelVersion, metrics.horizonDays]).toEqual([forecast.modelId, forecast.modelVersion, forecast.horizonDays]);
    }
    const unsupported = await fetch(`${base}/demand/metrics?horizonDays=7`);
    expect(unsupported.status).toBe(422); expect(await unsupported.json()).toMatchObject({ error: 'FORECAST_HORIZON_NOT_SUPPORTED' });
    for (const query of ['', '?horizonDays=0', '?horizonDays=1.5', '?horizonDays=x', '?horizonDays=4&other=1']) expect((await fetch(`${base}/demand/metrics${query}`)).status).toBe(400);
  });
});

test('metrics preserve safe incompatible-model and unexpected-error envelopes', async () => {
  await withRouter(async base => {
    const response = await fetch(`${base}/demand/metrics?horizonDays=4`);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: 'unavailable', error: 'FORECAST_MODEL_INCOMPATIBLE', message: 'El modelo de pronóstico no está disponible o no es compatible.' });
  }, () => { throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); });
  await withRouter(async base => {
    const response = await fetch(`${base}/demand/metrics?horizonDays=4`);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
  }, () => { throw new Error('secret'); });
});

test('loader rejects invalid frozen-metric projection and service has no fit/scoring/data dependencies', () => {
  const source = readFileSync(new URL('../../../docs/evidencias/hu-06-demand-v5-frozen-models/h4.json', import.meta.url), 'utf8');
  const runtime = JSON.parse(readFileSync(new URL('../models/xm-demandasin-ridge-direct-h4-v5/1.0.0/model.json', import.meta.url), 'utf8'));
  runtime.validationMetrics.MAE++;
  expect(() => validateDirectDemandV5Model(runtime, 4, source)).toThrow();
  const service = readFileSync(new URL('../services/demand-v5-metrics.service.ts', import.meta.url), 'utf8');
  expect(service).not.toMatch(/prisma|readFile|\bfit\w*\s*\(|\bevaluate\s*\(|retrospective|reduce\s*\(/);
  expect(() => getDemandV5Metrics(7)).toThrow();
});
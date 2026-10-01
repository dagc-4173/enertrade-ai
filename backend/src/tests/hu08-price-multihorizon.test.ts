import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { addDays, baselines, experiment, fitRidge, orderedFeatures, parseCsv, partitions, predict, samples, sha256, verifyCorpus } from '@/experiments/hu08-price-multihorizon';

const root = new URL('../../../docs/evidencias/hu-08-price-multihorizon-v1/', import.meta.url);
const corpusText = readFileSync(new URL('corpus/xm-preciobolsnaci-2024-01-01_2026-09-28.csv', root), 'utf8'); const records = parseCsv(corpusText), corpus = verifyCorpus(records);
const manifest = JSON.parse(readFileSync(new URL('corpus/manifest.json', root), 'utf8')) as any; const stored = JSON.parse(readFileSync(new URL('results.json', root), 'utf8')) as any;

test('HU08-MH corpus is frozen, continuous, complete and traceable to latest consolidation', () => {
  expect(sha256(corpusText)).toBe('2aca8e5868eaff50909c8154a842bfbe8a8db873976a90145e73e02aa7c9b02e');
  expect(corpus).toMatchObject({ firstDate: '2024-01-01', lastDate: '2026-09-28', completeDays: 1002, observations: 24048, gaps: 0, duplicates: 0, missingValues: 0, incompleteDays: 0 });
  expect(manifest).toMatchObject({ source: { consolidatedDatasetId: 12, energyDatasetId: 208, validationStatus: 'aprobado' }, corpus: { unit: 'COP/kWh', periodsPerDay: 24 } });
});

test.each([1, 7])('HU08-MH h%s creates 24 direct period samples with exact origin and no leakage', horizonDays => {
  const rows = samples(records, { start: '2026-06-01', end: '2026-06-01' }, horizonDays); expect(rows).toHaveLength(24);
  const origin = addDays('2026-06-01', -horizonDays);
  for (const row of rows) { expect(row.forecastOriginDate).toBe(origin); expect(row.targetDate).toBe('2026-06-01'); expect(row.featureDates.every(date => date <= origin)).toBe(true); expect(row.target).toBe(corpus.values.get(`2026-06-01|${row.period}`)!); }
});

test('HU08-MH V1 feature levels, rolling statistics and B7 are calendar-exact', () => {
  const row = samples(records, { start: '2026-06-01', end: '2026-06-01' }, 4)[0]!, origin = addDays('2026-06-01', -4), at = (lag: number) => corpus.values.get(`${addDays(origin, -lag)}|1`)!;
  expect(row.features.slice(0, 7)).toEqual([at(0), at(1), at(2), at(6), at(7), at(13), at(14)]);
  const rolling7 = Array.from({ length: 7 }, (_, lag) => at(lag)), rolling14 = Array.from({ length: 14 }, (_, lag) => at(lag)); const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length, std = (values: number[]) => Math.sqrt(mean(values.map(value => (value - mean(values)) ** 2)));
  expect(row.features[7]).toBeCloseTo(mean(rolling7), 10); expect(row.features[8]).toBeCloseTo(mean(rolling14), 10); expect(row.features[9]).toBeCloseTo(std(rolling7), 10); expect(row.features[10]).toBeCloseTo(std(rolling14), 10);
  expect(row.baselineB7).toBe(corpus.values.get(`${addDays('2026-06-01', -7)}|1`)!);
});

test('HU08-MH scaler fits TRAIN only and alpha/baseline select using VALIDATION only', () => {
  const fresh = experiment(records, sha256(corpusText)); expect(fresh.results).toEqual(stored.results);
  for (const result of Object.values(fresh.results) as any[]) {
    const ridgeOrder = [...result.validation.ridge].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha); expect(result.validation.selectedAlpha).toBe(ridgeOrder[0].alpha);
    const baselineOrder = Object.entries(result.validation.baselines).sort(([leftId, left]: any, [rightId, right]: any) => left.MAE - right.MAE || left.RMSE - right.RMSE || leftId.localeCompare(rightId)); expect(result.validation.baselineReference).toBe(baselineOrder[0]![0]);
    const train = samples(records, partitions.train, result.horizonDays), trainOnly = fitRidge(train, result.validation.selectedAlpha); expect(result.fittedParameters.means).toEqual(trainOnly.means); expect(result.fittedParameters.standardDeviations).toEqual(trainOnly.standardDeviations);
    expect(result.ranges.train.end < result.ranges.validation.start).toBe(true); expect(result.ranges.validation.end < result.ranges.externalHoldout.start).toBe(true);
    const predictors = baselines(train), first = train[0]!; expect(predictors.B1_ORIGIN(first)).toBe(first.features[0]); expect(predictors.B7(first)).toBe(first.baselineB7);
  }
}, 20_000);

test('HU08-MH metrics are finite, separate by horizon and include 24-period diagnostics', () => {
  for (const result of Object.values(stored.results) as any[]) {
    const metrics = result.externalHoldout.ridge; expect(metrics.evaluable).toBe(120 * 24); expect(metrics.unavailable).toBe(0); expect(Object.keys(metrics.byPeriod)).toHaveLength(24);
    expect([metrics.MAE, metrics.RMSE, metrics.bias, metrics.WAPE, metrics.maxAbsoluteError, result.externalHoldout.catastrophicThreshold].every(Number.isFinite)).toBe(true);
    for (const period of Object.values(metrics.byPeriod) as any[]) { expect(period.evaluable).toBe(120); expect(period.unavailable).toBe(0); }
  }
});

test('HU08-MH artifacts exist only for technical candidates and reproduce offline prediction', () => {
  const candidates = Object.values(stored.results).filter((result: any) => result.technicalCandidate).map((result: any) => result.horizonDays); expect(candidates).toEqual([4, 5, 6]);
  for (const result of Object.values(stored.results) as any[]) {
    const artifactUrl = new URL(`../models/${result.modelId}/1.0.0/model.json`, import.meta.url); expect(existsSync(artifactUrl)).toBe(result.technicalCandidate); if (!result.technicalCandidate) continue;
    const artifact = JSON.parse(readFileSync(artifactUrl, 'utf8')) as any, row = samples(records, { start: '2026-06-01', end: '2026-06-01' }, result.horizonDays)[0]!;
    expect(artifact.orderedFeatures).toEqual(orderedFeatures); expect(artifact.horizonDays).toBe(result.horizonDays); expect(artifact.corpusHash).toBe(sha256(corpusText));
    const model = { alpha: artifact.hyperparameters.alpha, coefficients: artifact.coefficients, intercept: artifact.intercept, means: artifact.scaler.means, standardDeviations: artifact.scaler.standardDeviations };
    expect(predict(model, row.features)).toBeCloseTo(predict(result.fittedParameters, row.features), 10);
  }
});

test('HU08-MH script disconnects PostgreSQL before training and artifacts are not wired to runtime', () => {
  const script = readFileSync(new URL('../../scripts/hu08-price-multihorizon.ts', import.meta.url), 'utf8'), catalog = readFileSync(new URL('../services/model-catalog.service.ts', import.meta.url), 'utf8');
  expect(script.indexOf('await prisma.$disconnect()')).toBeLessThan(script.indexOf('experiment(frozenRecords'));
  expect(catalog).not.toContain('xm-preciobolsnaci-ridge-direct-');
});
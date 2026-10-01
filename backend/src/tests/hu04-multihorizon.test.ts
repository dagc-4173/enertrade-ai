import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { experiment, fitRidge, parseCsv, partitions, predict, samples, sha256, verifyCorpus } from '@/experiments/hu04-multihorizon';

const root = new URL('../../../docs/evidencias/hu-04-multihorizon/', import.meta.url);
const corpusText = readFileSync(new URL('corpus/xm-gene-2024-01-01_2026-09-20.csv', root), 'utf8');
const records = parseCsv(corpusText);
const results = JSON.parse(readFileSync(new URL('results.json', root), 'utf8')) as { results: Record<string, any> };

test('HU04-MH corpus is continuous, complete, finite and duplicate-free', () => {
  const corpus = verifyCorpus(records);
  expect(corpus).toMatchObject({ firstDate: '2024-01-01', lastDate: '2026-09-20', completeDays: 994, observations: 23856 });
  expect(sha256(corpusText)).toBe('e7ffe35f5091e7733b06d2acea3d62ef1fe79a7f7730102fbaac3b0ccf44cb8b');
});

test.each([1, 7])('HU04-MH direct samples h%s bind targetDate=origin+h with 24 periods and no future features', horizonDays => {
  const rows = samples(records, { start: '2026-06-01', end: '2026-06-01' }, horizonDays);
  expect(rows).toHaveLength(24);
  for (const row of rows) {
    expect(row.targetDate).toBe(horizonDays === 1 ? '2026-06-01' : '2026-06-01');
    expect(row.forecastOriginDate).toBe(horizonDays === 1 ? '2026-05-31' : '2026-05-25');
    expect(row.featureDates.every(featureDate => featureDate <= row.forecastOriginDate)).toBe(true);
    expect(row.featureDates).toEqual([row.forecastOriginDate, horizonDays === 1 ? '2026-05-25' : '2026-05-19', row.forecastOriginDate]);
  }
});

test('HU04-MH selection uses validation only, scalers derive from TRAIN and holdout metrics are finite', () => {
  const output = experiment(records, sha256(corpusText));
  for (const result of Object.values(output.results) as any[]) {
    const selected = result.validation.ridge.find((entry: any) => entry.alpha === result.validation.selectedAlpha);
    const trainRows = samples(records, partitions.train, result.horizonDays);
    const trainOnlyModel = fitRidge(trainRows, result.validation.selectedAlpha);
    expect(selected.metrics.MAE).toBe(Math.min(...result.validation.ridge.map((entry: any) => entry.metrics.MAE)));
    expect(result.samples.train).toBeGreaterThan(0);
    expect(result.samples.validation).toBeGreaterThan(0);
    expect(result.samples.externalHoldout).toBeGreaterThan(0);
    expect(result.artifact.means).toEqual(trainOnlyModel.means);
    expect(result.artifact.standardDeviations).toEqual(trainOnlyModel.standardDeviations);
    expect([...result.artifact.means, ...result.artifact.standardDeviations, ...result.artifact.coefficients, result.artifact.intercept, result.externalHoldout.ridge.MAE, result.externalHoldout.ridge.RMSE, result.externalHoldout.ridge.bias, result.externalHoldout.ridge.WAPE].every(Number.isFinite)).toBe(true);
    expect(result.externalHoldout.ridge.unavailable).toBe(0);
  }
});

test('HU04-MH experimental artifact h1 matches the offline calculation and horizon identity', () => {
  const artifact = JSON.parse(readFileSync(new URL('../models/xm-gene-ridge-h1/1.0.0/model.json', import.meta.url), 'utf8')) as any;
  const row = samples(records, { start: '2026-06-01', end: '2026-06-01' }, 1)[0]!;
  const value = predict({ alpha: artifact.hyperparameters.alpha, coefficients: artifact.coefficients, intercept: artifact.intercept, means: artifact.scaler.means, standardDeviations: artifact.scaler.standardDeviations }, row.features);
  expect(artifact.horizonDays).toBe(1);
  expect(artifact.modelId).toBe('xm-gene-ridge-h1');
  expect(value).toBeCloseTo(results.results['1'].artifact.intercept + row.features.reduce((total: number, feature: number, index: number) => total + artifact.coefficients[index] * ((feature - artifact.scaler.means[index]) / artifact.scaler.standardDeviations[index]), 0), 8);
  expect(results.results['1'].candidate).toBe(true);
  for (const horizonDays of [2, 3, 4, 5, 6, 7]) {
    expect(results.results[String(horizonDays)].candidate).toBe(false);
    expect(existsSync(new URL(`../models/xm-gene-ridge-h${horizonDays}/1.0.0/model.json`, import.meta.url))).toBe(false);
  }
});
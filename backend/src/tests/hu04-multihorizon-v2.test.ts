import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { addDays, parseCsv, partitions, sha256, verifyCorpus } from '@/experiments/hu04-multihorizon';
import { experimentV2, fitRidgeV2, orderedFeaturesV2, predictV2, samplesV2 } from '@/experiments/hu04-multihorizon-v2';

const v1Root = new URL('../../../docs/evidencias/hu-04-multihorizon/', import.meta.url);
const v2Root = new URL('../../../docs/evidencias/hu-04-multihorizon-v2/', import.meta.url);
const corpusText = readFileSync(new URL('corpus/xm-gene-2024-01-01_2026-09-20.csv', v1Root), 'utf8');
const records = parseCsv(corpusText);
const manifestV1 = JSON.parse(readFileSync(new URL('corpus/manifest.json', v1Root), 'utf8')) as any;
const resultsV1 = JSON.parse(readFileSync(new URL('results.json', v1Root), 'utf8')) as any;
const resultsV2 = JSON.parse(readFileSync(new URL('results.json', v2Root), 'utf8')) as any;
const values = verifyCorpus(records).values;

test('HU04-MH-V2 reuses the exact V1 corpus hash and partitions without changing V1', () => {
  expect(sha256(corpusText)).toBe(manifestV1.corpus.sha256);
  expect(manifestV1.corpus.sha256).toBe('e7ffe35f5091e7733b06d2acea3d62ef1fe79a7f7730102fbaac3b0ccf44cb8b');
  expect(resultsV2.corpus.sha256).toBe(manifestV1.corpus.sha256);
  expect(resultsV2.partitions).toEqual(resultsV1.results['1'].ranges);
  expect(resultsV1.results['1'].candidate).toBe(true);
  for (const horizon of [2, 3, 4, 5, 6, 7]) expect(resultsV1.results[String(horizon)].candidate).toBe(false);
});

test.each([1, 7])('HU04-MH-V2 h%s lags, rolling windows and target are calendar-exact and leakage-free', horizonDays => {
  const rows = samplesV2(records, { start: '2026-06-01', end: '2026-06-01' }, horizonDays);
  expect(rows).toHaveLength(24);
  const row = rows[0]!; const origin = addDays('2026-06-01', -horizonDays); const at = (lag: number) => values.get(`${addDays(origin, -lag)}|1`)!;
  expect(row.targetDate).toBe('2026-06-01'); expect(row.forecastOriginDate).toBe(origin); expect(row.target).toBe(values.get('2026-06-01|1')!);
  expect(row.features.slice(0, 10)).toEqual([at(0), at(6), values.get(`${origin}|24`)!, at(1), at(2), at(7), at(13), at(14), at(27), at(28)]);
  const rolling7 = Array.from({ length: 7 }, (_, lag) => at(lag)); const rolling14 = Array.from({ length: 14 }, (_, lag) => at(lag));
  const mean = (input: number[]) => input.reduce((sum, value) => sum + value, 0) / input.length; const std = (input: number[]) => Math.sqrt(mean(input.map(value => (value - mean(input)) ** 2)));
  expect(row.features[10]).toBeCloseTo(mean(rolling7), 10); expect(row.features[11]).toBeCloseTo(mean(rolling14), 10); expect(row.features[12]).toBeCloseTo(std(rolling7), 10);
  expect(Object.values(row.featureSources).flat().every(sourceDate => sourceDate <= origin)).toBe(true);
  expect(row.featureSources.energy_same_period_mean_7d_ending_at_origin!.at(-1)).toBe(addDays(origin, -6));
  expect(row.featureSources.energy_same_period_mean_14d_ending_at_origin!.at(-1)).toBe(addDays(origin, -13));
});

test('HU04-MH-V2 scaler is TRAIN-only and alpha/baseline selection use VALIDATION only', () => {
  const output = experimentV2(records, sha256(corpusText));
  for (const result of Object.values(output.results) as any[]) {
    const validationMae = result.validation.ridge.map((entry: any) => entry.metrics.MAE);
    const selected = result.validation.ridge.find((entry: any) => entry.alpha === result.validation.selectedAlpha);
    expect(selected.metrics.MAE).toBe(Math.min(...validationMae));
    const baselineEntries = Object.entries(result.validation.baselines) as [string, any][];
    expect(result.validation.baselineReference).toBe(baselineEntries.sort(([, left], [, right]) => left.MAE - right.MAE)[0]![0]);
    const train = samplesV2(records, partitions.train, result.horizonDays); const trainOnly = fitRidgeV2(train, result.validation.selectedAlpha);
    expect(result.artifact.means).toEqual(trainOnly.means); expect(result.artifact.standardDeviations).toEqual(trainOnly.standardDeviations);
    expect(result.ranges.externalHoldout.start > result.ranges.validation.end).toBe(true);
    expect(result.samples.train).toBe(13128); expect(result.samples.validation).toBe(1464); expect(result.samples.externalHoldout).toBe(2688);
  }
}, 15_000);

test('HU04-MH-V2 metrics are finite and every promoted artifact matches offline prediction and horizon', () => {
  for (const result of Object.values(resultsV2.results) as any[]) {
    const metrics = result.externalHoldout.ridge;
    expect([metrics.MAE, metrics.RMSE, metrics.bias, metrics.WAPE, metrics.maxAbsoluteErrorKwh].every(Number.isFinite)).toBe(true);
    expect(metrics.unavailable).toBe(0);
    const artifactUrl = new URL(`../models/${result.modelId}/1.0.0/model.json`, import.meta.url);
    expect(existsSync(artifactUrl)).toBe(result.candidate);
    if (!result.candidate) continue;
    const artifact = JSON.parse(readFileSync(artifactUrl, 'utf8')) as any; const row = samplesV2(records, { start: '2026-06-01', end: '2026-06-01' }, result.horizonDays)[0]!;
    expect(artifact.horizonDays).toBe(result.horizonDays); expect(artifact.modelId).toBe(result.modelId); expect(artifact.orderedFeatures).toEqual(orderedFeaturesV2);
    const prediction = predictV2({ alpha: artifact.hyperparameters.alpha, coefficients: artifact.coefficients, intercept: artifact.intercept, means: artifact.scaler.means, standardDeviations: artifact.scaler.standardDeviations }, row.features);
    expect(prediction).toBeCloseTo(predictV2(result.artifact, row.features), 8);
  }
});

test('HU04-MH-V2 coefficient importance is diagnostic only and preserves the frozen feature set', () => {
  for (const result of Object.values(resultsV2.results) as any[]) {
    expect(result.coefficientImportance).toHaveLength(orderedFeaturesV2.length);
    expect(new Set(result.coefficientImportance.map((item: any) => item.feature))).toEqual(new Set(orderedFeaturesV2));
    expect(result.coefficientImportance.every((item: any) => Number.isFinite(item.standardizedCoefficient))).toBe(true);
  }
});
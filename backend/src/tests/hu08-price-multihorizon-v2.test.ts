import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { parseCsv, partitions, sha256, verifyCorpus } from '@/experiments/hu08-price-multihorizon';
import { baseFeaturesV2, experimentV2, fitRidgeV2, omittedExactRedundanciesV2, orderedFeaturesV2, predictV2, samplesV2, targetRelativeFeatures } from '@/experiments/hu08-price-multihorizon-v2';

const root = new URL('../../../docs/evidencias/hu-08-price-multihorizon-v2/', import.meta.url), corpusText = readFileSync(new URL('../hu-08-price-multihorizon-v1/corpus/xm-preciobolsnaci-2024-01-01_2026-09-28.csv', root), 'utf8');
const records = parseCsv(corpusText), corpus = verifyCorpus(records), stored = JSON.parse(readFileSync(new URL('results.json', root), 'utf8')) as any;

test('HU08-MH-V2 reuses exact V1 corpus, partitions, grid, baselines and promotion criteria', () => {
  expect(sha256(corpusText)).toBe('2aca8e5868eaff50909c8154a842bfbe8a8db873976a90145e73e02aa7c9b02e'); expect(corpus).toMatchObject({ completeDays: 1002, observations: 24048 });
  expect(stored.partitions).toEqual(partitions); expect(stored.corpus.sha256).toBe(sha256(corpusText));
});

test.each([1, 7])('HU08-MH-V2 h%s has 24 direct samples and no future feature source', horizonDays => {
  const rows = samplesV2(records, { start: '2026-06-01', end: '2026-06-01' }, horizonDays); expect(rows).toHaveLength(24);
  for (const row of rows) { expect(row.featureDates.every(date => date <= row.forecastOriginDate)).toBe(true); expect(Object.values(row.featureSources).flat().every(date => date <= row.forecastOriginDate)).toBe(true); }
});

test('HU08-MH-V2 target-relative features are horizon-specific, known at origin and non-duplicated', () => {
  expect(targetRelativeFeatures(1)).toEqual([]); expect(targetRelativeFeatures(7)).toEqual([]);
  for (let horizonDays = 2; horizonDays <= 6; horizonDays++) {
    const relative = targetRelativeFeatures(horizonDays), row = samplesV2(records, { start: '2026-06-01', end: '2026-06-01' }, horizonDays)[0]!;
    expect(new Set(orderedFeaturesV2(horizonDays)).size).toBe(orderedFeaturesV2(horizonDays).length);
    for (const feature of relative) { expect(feature.targetLag).toBeGreaterThanOrEqual(horizonDays); expect(row.featureSources[feature.name]).toEqual([row.targetDate < '0000' ? '' : (() => { const date = new Date(`${row.targetDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - feature.targetLag); return date.toISOString().slice(0, 10); })()]); expect(row.featureSources[feature.name]![0]! <= row.forecastOriginDate).toBe(true); }
  }
});

test('HU08-MH-V2 removes exact linear redundancies and preserves requested non-linear statistics', () => {
  expect(Object.keys(omittedExactRedundanciesV2)).toEqual(['priceSamePeriodMean3d', 'priceTrend1d', 'priceTrend7d', 'rollingMeanDifference7d14d']);
  for (const forbidden of ['price_same_period_mean_3d_ending_at_origin','price_trend_1d','price_trend_7d','rolling_mean_difference_7d_14d']) expect(baseFeaturesV2).not.toContain(forbidden as never);
  for (const required of ['price_same_period_median_7d_ending_at_origin','price_same_period_median_14d_ending_at_origin','price_same_period_std_28d_ending_at_origin','price_same_period_min_7d_ending_at_origin','price_same_period_max_7d_ending_at_origin']) expect(baseFeaturesV2).toContain(required as never);
});

test('HU08-MH-V2 scaler is TRAIN-only and alpha/baseline selection use VALIDATION only', () => {
  const fresh = experimentV2(records, sha256(corpusText)); expect(fresh.results).toEqual(stored.results);
  for (const result of Object.values(fresh.results) as any[]) {
    const ordered = [...result.validation.ridge].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha); expect(result.validation.selectedAlpha).toBe(ordered[0].alpha);
    const baselines = Object.entries(result.validation.baselines).sort(([leftId, left]: any, [rightId, right]: any) => left.MAE - right.MAE || left.RMSE - right.RMSE || leftId.localeCompare(rightId)); expect(result.validation.baselineReference).toBe(baselines[0]![0]);
    const trainOnly = fitRidgeV2(samplesV2(records, partitions.train, result.horizonDays), result.validation.selectedAlpha); expect(result.fittedParameters.means).toEqual(trainOnly.means); expect(result.fittedParameters.standardDeviations).toEqual(trainOnly.standardDeviations);
    expect(result.ranges.validation.end < result.ranges.externalHoldout.start).toBe(true); expect(result.externalHoldout.ridge.unavailable).toBe(0); expect(Object.keys(result.externalHoldout.ridge.byPeriod)).toHaveLength(24); expect(Object.keys(result.externalHoldout.byWeekday)).toHaveLength(7);
  }
}, 30_000);

test('HU08-MH-V2 artifacts exist only for technical candidates and reproduce offline predictions', () => {
  expect(Object.values(stored.results).filter((result: any) => result.technicalCandidate).map((result: any) => result.horizonDays)).toEqual([5]);
  for (const result of Object.values(stored.results) as any[]) { const url = new URL(`../models/${result.modelId}/1.0.0/model.json`, import.meta.url); expect(existsSync(url)).toBe(result.technicalCandidate); if (!result.technicalCandidate) continue; const artifact = JSON.parse(readFileSync(url, 'utf8')), row = samplesV2(records, { start: '2026-06-01', end: '2026-06-01' }, result.horizonDays)[0]!, model = { alpha: artifact.hyperparameters.alpha, coefficients: artifact.coefficients, intercept: artifact.intercept, means: artifact.scaler.means, standardDeviations: artifact.scaler.standardDeviations }; expect(artifact.orderedFeatures).toEqual(orderedFeaturesV2(result.horizonDays)); expect(predictV2(model, row.features)).toBeCloseTo(predictV2(result.fittedParameters, row.features), 10); }
});

test('HU08-MH-V2 artifacts are not integrated into runtime catalog', () => {
  const catalog = readFileSync(new URL('../services/model-catalog.service.ts', import.meta.url), 'utf8'); expect(catalog).not.toContain('xm-preciobolsnaci-ridge-direct-');
});
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { addDays, experiment, fitRidge, parseCsv, partitions, predict, samples, sha256, verifyCorpus } from '@/experiments/hu06-multihorizon';
import { baselinesV2, experimentV2, fitRidgeV2, orderedFeaturesV2, predictV2, samplesV2 } from '@/experiments/hu06-multihorizon-v2';

const v1Root = new URL('../../../docs/evidencias/hu-06-multihorizon/', import.meta.url);
const v2Root = new URL('../../../docs/evidencias/hu-06-multihorizon-v2/', import.meta.url);
const corpusText = readFileSync(new URL('corpus/xm-demandasin-2024-01-01_2026-09-29.csv', v1Root), 'utf8');
const records = parseCsv(corpusText);
const corpus = verifyCorpus(records);
const manifest = JSON.parse(readFileSync(new URL('corpus/manifest.json', v1Root), 'utf8')) as any;
const resultsV1 = JSON.parse(readFileSync(new URL('results.json', v1Root), 'utf8')) as any;
const resultsV2 = JSON.parse(readFileSync(new URL('results.json', v2Root), 'utf8')) as any;

test('HU06-MH freezes the latest real consolidated DemaSIN corpus with exact continuity and provenance', () => {
  expect(corpus).toMatchObject({ firstDate: '2024-01-01', lastDate: '2026-09-29', observations: 1003, gaps: 0, duplicates: 0, missingValues: 0 });
  expect(sha256(corpusText)).toBe('18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735');
  expect(manifest).toMatchObject({ source: { consolidatedDatasetId: 9, energyDatasetId: 202, validationStatus: 'aprobado' }, corpus: { sha256: sha256(corpusText), observations: 1003 } });
});

test.each([1, 7])('HU06-MH V1 h%s maps target=origin+h and reproduces legacy D-1/D-7/D-14/D-28 at h1', horizonDays => {
  const row = samples(records, { start: '2026-06-01', end: '2026-06-01' }, horizonDays)[0]!;
  const origin = addDays('2026-06-01', -horizonDays);
  expect(row.forecastOriginDate).toBe(origin); expect(row.targetDate).toBe('2026-06-01'); expect(row.horizonDays).toBe(horizonDays);
  expect(row.featureDates).toEqual([origin, addDays(origin, -6), addDays(origin, -13), addDays(origin, -27)]);
  expect(row.featureDates.every(date => date <= origin)).toBe(true);
  if (horizonDays === 1) expect(row.featureDates).toEqual(['2026-05-31', '2026-05-25', '2026-05-18', '2026-05-04']);
});

test.each([1, 7])('HU06-MH V2 h%s builds calendar-exact levels and rolling windows without leakage', horizonDays => {
  const row = samplesV2(records, { start: '2026-06-01', end: '2026-06-01' }, horizonDays)[0]!;
  const origin = addDays('2026-06-01', -horizonDays); const at = (lag: number) => corpus.values.get(addDays(origin, -lag))!;
  expect(row.features.slice(0, 9)).toEqual([at(0), at(1), at(2), at(6), at(7), at(13), at(14), at(27), at(28)]);
  const rolling7 = Array.from({ length: 7 }, (_, lag) => at(lag)); const rolling14 = Array.from({ length: 14 }, (_, lag) => at(lag)); const rolling28 = Array.from({ length: 28 }, (_, lag) => at(lag));
  const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
  const std = (values: number[]) => Math.sqrt(mean(values.map(value => (value - mean(values)) ** 2)));
  expect(row.features[9]).toBeCloseTo(mean(rolling7), 8); expect(row.features[10]).toBeCloseTo(mean(rolling14), 8); expect(row.features[11]).toBeCloseTo(mean(rolling28), 8);
  expect(row.features[12]).toBeCloseTo(std(rolling7), 8); expect(row.features[13]).toBeCloseTo(std(rolling14), 8);
  expect(Object.values(row.featureSources).flat().every(date => date <= origin)).toBe(true);
});

test('HU06-MH V2 baselines preserve demand(t), demand(t-6) and TRAIN-only weekday mean semantics', () => {
  const train = samplesV2(records, partitions.train, 1); const row = train[0]!; const predictors = baselinesV2(train);
  expect(predictors.B_ORIGIN(row)).toBe(row.features[0]);
  expect(predictors.B_ORIGIN_MINUS_6(row)).toBe(row.features[3]);
  expect(predictors.B_ORIGIN_MINUS_6(row)).not.toBe(row.features[1]);
  expect(Number.isFinite(predictors.B_TRAIN_TARGET_WEEKDAY_MEAN(row)!)).toBe(true);
});

test('HU06-MH scaler uses TRAIN only, baseline/alpha use VALIDATION only, and holdout stays isolated', () => {
  const v1 = experiment(records, sha256(corpusText)); const v2 = experimentV2(records, sha256(corpusText));
  for (const [version, output] of [['v1', v1], ['v2', v2]] as const) for (const result of Object.values(output.results) as any[]) {
    const ridgeOrder = [...result.validation.ridge].sort((left: any, right: any) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha);
    expect(result.validation.selectedAlpha).toBe(ridgeOrder[0].alpha);
    const baselineOrder = Object.entries(result.validation.baselines).sort(([leftId, left]: any, [rightId, right]: any) => left.MAE - right.MAE || left.RMSE - right.RMSE || leftId.localeCompare(rightId));
    expect(result.validation.baselineReference).toBe(baselineOrder[0]![0]);
    const trainOnly = version === 'v1'
      ? fitRidge(samples(records, partitions.train, result.horizonDays), result.validation.selectedAlpha)
      : fitRidgeV2(samplesV2(records, partitions.train, result.horizonDays), result.validation.selectedAlpha);
    expect(result.artifact.means).toEqual(trainOnly.means); expect(result.artifact.standardDeviations).toEqual(trainOnly.standardDeviations);
    expect(result.ranges.train.end < result.ranges.validation.start).toBe(true); expect(result.ranges.validation.end < result.ranges.externalHoldout.start).toBe(true);
    expect(result.ranges.externalHoldout.start > '2024-09-28').toBe(true);
    expect(result.samples.validation).toBe(61); expect(result.samples.externalHoldout).toBe(121);
  }
}, 15_000);

test('HU06-MH original metrics remain finite; only semantic V2 later materializes h1..h6', () => {
  for (const stored of [resultsV1, resultsV2]) for (const result of Object.values(stored.results) as any[]) {
    const metrics = result.externalHoldout.ridge;
    expect([metrics.MAE, metrics.RMSE, metrics.bias, metrics.WAPE, metrics.maxAbsoluteErrorKwh].every(Number.isFinite)).toBe(true);
    expect(metrics.evaluable).toBe(121); expect(metrics.unavailable).toBe(0);
    const artifactUrl = new URL(`../models/${result.modelId}/1.0.0/model.json`, import.meta.url);
    if (!result.candidate && existsSync(artifactUrl)) {
      expect(stored.experimentId).toBe('hu-06-multihorizon-v2');
      expect(result.horizonDays).toBeLessThanOrEqual(6);
      const semantic = JSON.parse(readFileSync(new URL('../../../docs/evidencias/hu-06-multihorizon-v3-semantic/results.json', import.meta.url), 'utf8')) as any;
      expect(semantic.v2.results[String(result.horizonDays)].technicalCandidate).toBe(true);
      expect(JSON.parse(readFileSync(artifactUrl, 'utf8')).modelFamily).toBe('ridge_direct_demand_v2_semantic');
    } else expect(existsSync(artifactUrl)).toBe(result.candidate);
    if (!result.candidate) continue;
    const artifact = JSON.parse(readFileSync(artifactUrl, 'utf8')) as any;
    const row = stored.experimentId.endsWith('v1') ? samples(records, { start: '2026-06-01', end: '2026-06-01' }, result.horizonDays)[0]! : samplesV2(records, { start: '2026-06-01', end: '2026-06-01' }, result.horizonDays)[0]!;
    const model = { alpha: artifact.hyperparameters.alpha, coefficients: artifact.coefficients, intercept: artifact.intercept, means: artifact.scaler.means, standardDeviations: artifact.scaler.standardDeviations };
    const prediction = stored.experimentId.endsWith('v1') ? predict(model, row.features) : predictV2(model, row.features);
    const offline = stored.experimentId.endsWith('v1') ? predict(result.artifact, row.features) : predictV2(result.artifact, row.features);
    expect(prediction).toBeCloseTo(offline, 8);
  }
  expect(Object.values(resultsV1.results).filter((result: any) => result.candidate)).toHaveLength(0);
  expect(Object.values(resultsV2.results).filter((result: any) => result.candidate)).toHaveLength(0);
});

test('HU06-MH V2 removes only exact linear redundancies and preserves its frozen feature set', () => {
  expect(resultsV2.omittedCandidates).toEqual({ demandMean3d: expect.stringContaining('Exact linear combination'), recentTrend: expect.stringContaining('Exact linear combination') });
  expect(resultsV2.orderedFeatures).toEqual(orderedFeaturesV2);
  expect(orderedFeaturesV2).not.toContain('demand_mean_3d_ending_at_origin'); expect(orderedFeaturesV2).not.toContain('recent_trend');
});
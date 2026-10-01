import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fitRidge, parseCsv, type DemandRecord } from '@/experiments/hu06-multihorizon';
import { evaluate, predict } from '@/experiments/hu06-multihorizon';
import { fitRidgeV2, samplesV2 } from '@/experiments/hu06-multihorizon-v2';
import { fitV4Ablation, v4Baselines, v4Samples } from '@/experiments/hu06-demand-v4-experiment';
import { demandEligibilityIndex } from '@/services/demand-semantic-eligibility';
import { loadDirectDemandModel } from '@/models/xm-demandasin-ridge-direct-v2/model-loader';

const preregistration = new URL('../../../docs/evidencias/hu-06-demand-v4-preregistration/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', preregistration), 'utf8'));
const records = parseCsv(readFileSync(new URL('../../../docs/evidencias/hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv', import.meta.url), 'utf8'));
const train = manifest.partitions.train;

test('Ridge dimensional equals existing 16-feature Ridge on identical TRAIN rows', () => {
  for (const horizon of [1, 6]) {
    const rows = samplesV2(records, train, horizon);
    const inputs = rows.map(row => ({ ...row, usedObservationDates: row.featureDates }));
    for (const alpha of manifest.selection.alphaGrid) expect(fitV4Ablation(inputs, alpha)).toEqual(fitRidgeV2(rows, alpha));
  }
});

test('A uses six frozen features and existing TRAIN-only Ridge, with no target inside input vector', () => {
  const rows = v4Samples(records, train, 1, 'A');
  expect(rows.every(row => row.features.length === 6 && row.featureDates.every(date => date <= row.forecastOriginDate))).toBe(true);
  expect(fitRidge(rows, 0.01).means).toHaveLength(6);
  const original = v4Samples(records, { start: '2026-05-20', end: '2026-05-20' }, 6, 'A')[0]!;
  const modified: DemandRecord[] = records.map(row => row.fecha_xm === original.targetDate ? { ...row, demanda_kwh: row.demanda_kwh + 10 } : row);
  const changed = v4Samples(modified, { start: original.targetDate, end: original.targetDate }, 6, 'A')[0]!;
  expect(changed.features).toEqual(original.features);
  expect(changed.target).not.toBe(original.target);
});

test('frozen baseline definitions use t-6 index 1 for A and index 3 for C', () => {
  for (const variant of ['A', 'C'] as const) {
    const rows = v4Samples(records, train, 1, variant);
    const baselines = v4Baselines(rows, variant, manifest.selection.baselines);
    expect(Object.keys(baselines)).toEqual(manifest.selection.baselines);
    expect(baselines.B_ORIGIN(rows[0]!)).toBe(rows[0]!.features[0]);
    expect(baselines.B_ORIGIN_MINUS_6(rows[0]!)).toBe(rows[0]!.features[variant === 'A' ? 1 : 3]);
  }
});

test('semantic review target is excluded from historical samples, not needed by future feature construction', () => {
  const rows = v4Samples(records, { start: '2026-09-28', end: '2026-09-29' }, 1, 'A');
  expect(rows).toEqual([]);
  const future = v4Samples(records, { start: '2026-10-02', end: '2026-10-02' }, 5, 'A');
  expect(future).toEqual([]);
});

const results = JSON.parse(readFileSync(new URL('../../../docs/evidencias/hu-06-demand-v4-experiment/results.json', import.meta.url), 'utf8'));
const evaluation = results.predictiveQualityAndOperationalCoverage;

test('tagged preregistration and exact corpus remain unchanged after experiment', () => {
  const root = new URL('../../../', import.meta.url);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  expect(results.preregistrationCommit).toBe(git('rev-parse', 'hu06-v4-preregistered^{commit}'));
  for (const name of ['manifest.json', 'protocol.md', 'README.md']) {
    const path = `docs/evidencias/hu-06-demand-v4-preregistration/${name}`;
    expect(readFileSync(new URL(name, preregistration), 'utf8').replace(/\r\n/g, '\n').trimEnd()).toBe(git('show', `hu06-v4-preregistered:${path}`).replace(/\r\n/g, '\n').trimEnd());
  }
  const hash = createHash('sha256').update(readFileSync(new URL('../../../docs/evidencias/hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv', import.meta.url))).digest('hex');
  expect(hash).toBe(manifest.corpus.sha256);
  expect(results.partitions).toEqual(manifest.partitions);
  expect(results.corpus.sha256).toBe(hash);
});

test.each([1, 2, 3, 4, 5, 6])('h%s freezes feature order and TRAIN-only scaler with alpha selected on VALIDATION', horizonDays => {
  for (const variant of ['A', 'B', 'C'] as const) {
    const result = evaluation.variants[variant][String(horizonDays)];
    const selection = result.selection;
    expect(selection.alphaGrid).toEqual(manifest.selection.alphaGrid);
    expect(selection.baselineReference).toBe(manifest.selection.baselines.find((id: string) => id === selection.baselineReference));
    expect(result.sampleCounts.train).toBe(787); expect(result.sampleCounts.validation).toBe(61);
    expect(result.sampleCounts.retrospectiveEvaluation).toBe(result.predictiveQuality.retrospectiveEvaluation.evaluable);
    expect(result.predictiveQuality.retrospectiveEvaluation.unavailable).toBe(0);
    if (variant === 'B') {
      expect(selection.frozenComparator).toBe(true);
      expect(selection.selectedAlpha).toBe(loadDirectDemandModel(horizonDays).alpha);
    } else {
      const ordered = [...selection.validationAlphaGrid].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha);
      expect(selection.selectedAlpha).toBe(ordered[0].alpha);
      const trainRows = v4Samples(records, train, horizonDays, variant);
      const means = result.fittedParameters.means;
      expect(means).toEqual(means.map((_: number, index: number) => trainRows.reduce((total, row) => total + row.features[index]!, 0) / trainRows.length));
      expect(result.fittedParameters.coefficients).toHaveLength(variant === 'A' ? 6 : 16);
    }
  }
  expect(evaluation.independentAblation[String(horizonDays)].fittedParameters.coefficients).toHaveLength(10);
  expect(evaluation.variants.A[String(horizonDays)].modelVersion).toBe('1.0.0-experimental-offline');
});

test('paired retrospective quality uses the same origin/target identities and exact 1.05 gate', () => {
  const range = manifest.partitions.retrospectiveEvaluation;
  for (let horizonDays = 1; horizonDays <= 6; horizonDays++) {
    const key = String(horizonDays), paired = evaluation.paired[key], primary = evaluation.variants.A[key];
    const aRows = v4Samples(records, range, horizonDays, 'A');
    const bRows = new Map(v4Samples(records, range, horizonDays, 'B').map(row => [`${row.forecastOriginDate}|${row.targetDate}`, row]));
    const commonA = aRows.filter(row => bRows.has(`${row.forecastOriginDate}|${row.targetDate}`));
    const commonB = commonA.map(row => bRows.get(`${row.forecastOriginDate}|${row.targetDate}`)!);
    const aMetrics = evaluate(commonA, row => predict(primary.fittedParameters, row.features));
    const frozen = loadDirectDemandModel(horizonDays);
    const bModel = { alpha: frozen.alpha, coefficients: frozen.coefficients, intercept: frozen.intercept, means: frozen.scaler.means, standardDeviations: frozen.scaler.standardDeviations };
    const bMetrics = evaluate(commonB, row => predict(bModel, row.features));
    expect(paired.pairedTargetDays).toBe(commonA.length);
    expect([paired.MAE_A_paired, paired.WAPE_A_paired, paired.MAE_V2_paired, paired.WAPE_V2_paired]).toEqual([aMetrics.MAE, aMetrics.WAPE, bMetrics.MAE, bMetrics.WAPE]);
    const passes = commonA.length >= manifest.promotionCriteria.minimumPairedEligibleTargetDaysPerHorizonForV2Comparison && aMetrics.MAE <= 1.05 * bMetrics.MAE && aMetrics.WAPE <= 1.05 * bMetrics.WAPE;
    expect(paired.pairedQuality).toBe(passes);
    expect(paired.replacementCandidate).toBe(false);
    expect(paired.prospectiveCompleteTargetDays).toBe(0);
    expect(paired.coverage_A).toEqual(primary.operationalCoverage);
  }
  expect(manifest.promotionCriteria.maximumPairedMaeMultiplierOfV2).toBe(1.05);
  expect(manifest.promotionCriteria.maximumPairedWapeMultiplierOfV2).toBe(1.05);
});

test('C retains the real 28 USABLE source dates and calendar span for every sample', () => {
  const eligibility = demandEligibilityIndex(records.map(row => ({ date: row.fecha_xm, value: row.demanda_kwh })));
  for (let horizonDays = 1; horizonDays <= 6; horizonDays++) {
    const result = evaluation.variants.C[String(horizonDays)];
    for (const partition of ['train', 'validation', 'retrospectiveEvaluation']) {
      expect(result.usableStatisticProvenance[partition]).toHaveLength(result.sampleCounts[partition]);
      for (const row of result.usableStatisticProvenance[partition]) {
        expect(row.actualSourceDates).toHaveLength(28);
        expect(row.actualSourceDates.every((date: string) => date <= row.origin && eligibility.get(date)?.semanticStatus === 'USABLE')).toBe(true);
        expect(row.calendarSpanDays).toBeLessThanOrEqual(42);
      }
    }
  }
});

test('offline examples are target-blind, reproduce saved A coefficients and are not runtime artifacts', () => {
  const origin = '2026-09-27', expected = { 5: '2026-10-02', 6: '2026-10-03' } as const;
  for (const entry of results.offlinePredictions) {
    expect([5, 6]).toContain(entry.horizonDays);
    expect(entry).toMatchObject({ origin, targetDate: expected[entry.horizonDays as 5 | 6], status: 'offline_experimental_only', unit: 'kWh' });
    expect(entry.sourceDates.every((date: string) => date <= origin)).toBe(true);
    expect(entry.orderedFeatures).toEqual(manifest.variants.A.orderedFeatures);
    const fitted = evaluation.variants.A[String(entry.horizonDays)].fittedParameters;
    expect(entry.prediction.demanda_kwh).toBe(predict(fitted, entry.features));
  }
  for (let horizonDays = 1; horizonDays <= 7; horizonDays++) expect(existsSync(new URL(`../models/xm-demandasin-ridge-direct-h${horizonDays}-v4/1.0.0/model.json`, import.meta.url))).toBe(false);
  expect(evaluation.variants.A['7']).toBeUndefined();
  expect(evaluation.independentAblation['7']).toBeUndefined();
});
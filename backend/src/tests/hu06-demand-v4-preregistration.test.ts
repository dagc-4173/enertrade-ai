import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { addDays, parseCsv } from '@/experiments/hu06-multihorizon';
import { orderedFeaturesV2 } from '@/experiments/hu06-multihorizon-v2';
import { demandEligibilityIndex, demandSemanticRule } from '@/services/demand-semantic-eligibility';
import { buildV4ContinuousComparator, buildV4Primary, buildV4TargetRelativeAblation, buildV4UsableStatisticsComparator, v4PrimaryFeatures, v4TargetRelativeFeatures, v4UsableStatisticsFeatures, v4UsableStatisticsWindow } from '@/experiments/hu06-demand-v4-preregistration';

const evidence = new URL('../../../docs/evidencias/hu-06-demand-v4-preregistration/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', evidence), 'utf8'));
const corpus = readFileSync(new URL('../../../docs/evidencias/hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv', import.meta.url));
const records = parseCsv(corpus.toString('utf8'));
const origin = '2026-09-27';
const target = '2026-10-02';

test('preregistration freezes exact corpus, semantic policy, partitions and pendingExperiment', () => {
  expect(manifest.state).toBe('pendingExperiment');
  expect(manifest.scope).toMatchObject({ horizonDays: [1, 2, 3, 4, 5, 6], excludedHorizonDays: [7], trained: false, evaluationPerformed: false, runtimeIntegration: false });
  expect(createHash('sha256').update(corpus).digest('hex')).toBe(manifest.corpus.sha256);
  expect(manifest.corpus.retainedExcludedDates).toEqual(['2026-09-16', '2026-09-28', '2026-09-29']);
  expect(manifest.semanticPolicy).toMatchObject(demandSemanticRule);
  expect(manifest.partitions).toMatchObject({ train: { end: '2026-03-31' }, validation: { end: '2026-05-31' }, retrospectiveEvaluation: { start: '2026-06-01', virginHoldout: false } });
  expect(manifest.selection).toMatchObject({ alphaGrid: [0.01, 0.1, 1, 10, 100], primaryVariant: 'A', retrospectiveEvaluationCannotSelectVariantAlphaOrBaseline: true });
});

test('A has only four punctual levels plus two calendar values, never requires rolling or future observations', () => {
  expect(v4PrimaryFeatures).toEqual(manifest.variants.A.orderedFeatures);
  expect(v4PrimaryFeatures).toHaveLength(6);
  for (let horizonDays = 1; horizonDays <= 6; horizonDays++) {
    const targetDate = addDays(origin, horizonDays);
    const built = buildV4Primary(records, origin, targetDate, horizonDays)!;
    expect(built.featureDates).toEqual([0, 6, 13, 27].map(lag => addDays(origin, -lag)));
    expect(built.featureDates.every(date => date <= origin)).toBe(true);
    expect(built.values).toHaveLength(6);
    const modifiedTarget = records.map(row => row.fecha_xm === targetDate ? { ...row, demanda_kwh: Number.MAX_VALUE } : row);
    expect(buildV4Primary(modifiedTarget, origin, targetDate, horizonDays)).toEqual(built);
  }
  expect(() => buildV4Primary(records, origin, '2026-10-04', 7)).toThrow();
});

test('A rejects an excluded required lag but accepts an isolated gap outside its four source dates', () => {
  expect(buildV4Primary(records, '2026-09-22', '2026-09-28', 6)).toBeNull();
  expect(buildV4Primary(records, '2026-09-17', '2026-09-18', 1)).not.toBeNull();
  expect(buildV4Primary(records, origin, target, 5)).not.toBeNull();
});

test('B keeps V2 continuous; origin 27/09 is blocked by excluded 16/09 in its rolling', () => {
  expect(manifest.variants.B.orderedFeatures).toEqual(orderedFeaturesV2);
  expect(buildV4ContinuousComparator(records, origin, target, 5)).toBeNull();
});

test('C uses exactly 28 individually USABLE observations inside 42 calendar days with real dates and span', () => {
  expect(v4UsableStatisticsFeatures).toEqual(manifest.variants.C.orderedFeatures);
  expect(v4UsableStatisticsWindow).toEqual({ count: 28, maxCalendarDays: 42 });
  const built = buildV4UsableStatisticsComparator(records, origin, target, 5)!;
  const eligibility = demandEligibilityIndex(records.filter(row => row.fecha_xm <= origin).map(row => ({ date: row.fecha_xm, value: row.demanda_kwh })));
  expect(built.usableStatisticDates).toHaveLength(28);
  expect(built.usableStatisticDates.every(date => date <= origin && date >= addDays(origin, -41) && eligibility.get(date)?.semanticStatus === 'USABLE')).toBe(true);
  expect(built.featureDates.every(date => date <= origin && eligibility.get(date)?.semanticStatus === 'USABLE')).toBe(true);
  expect(built.usableStatisticDates).not.toContain('2026-09-16');
  expect(built.calendarSpanDays).toBe(29);
  expect(built.calendarSpanDays).toBeLessThanOrEqual(42);
  expect(built.values).toHaveLength(16);
});

test('C does not borrow older observations outside 42 days or replace a mandatory excluded punctual lag', () => {
  const fixedDates = new Set([0, 1, 2, 6, 7, 13, 14, 27, 28].map(lag => addDays(origin, -lag)));
  const dropped = new Set(records.filter(row => row.fecha_xm >= addDays(origin, -41) && row.fecha_xm <= origin && !fixedDates.has(row.fecha_xm) && row.fecha_xm !== '2026-09-16').slice(0, 14).map(row => row.fecha_xm));
  expect(dropped.size).toBe(14);
  expect(buildV4UsableStatisticsComparator(records.filter(row => !dropped.has(row.fecha_xm)), origin, target, 5)).toBeNull();
  expect(buildV4UsableStatisticsComparator(records, '2026-09-23', '2026-09-24', 1)).toBeNull();
});

test('target-relative ablation stays independent and rejects excluded target-relative sources', () => {
  expect(manifest.independentAblation.orderedAddedFeatures).toEqual(v4TargetRelativeFeatures);
  const valid = buildV4TargetRelativeAblation(records, origin, '2026-10-03', 6)!;
  expect(valid.values).toHaveLength(10);
  expect(valid.targetRelativeDates.every(date => date <= origin)).toBe(true);
  expect(buildV4Primary(records, origin, '2026-09-30', 3)).not.toBeNull();
  expect(buildV4TargetRelativeAblation(records, origin, '2026-09-30', 3)).toBeNull();
  expect(manifest.independentAblation.mayNotReplaceOrMixWithAAfterResults).toBe(true);
});

test('operational case is feature capacity only; no training call or V4 runtime artifacts', () => {
  expect(manifest.operationalCase.targetsByHorizon).toEqual({ '1': '2026-09-28', '2': '2026-09-29', '3': '2026-09-30', '4': '2026-10-01', '5': '2026-10-02', '6': '2026-10-03' });
  expect(manifest.operationalCase).toMatchObject({ futureHorizonsAsOfDate: [5, 6], sourceConstruction: { A: true, B: false, C: true }, predictionGenerated: false });
  const source = readFileSync(new URL('../experiments/hu06-demand-v4-preregistration.ts', import.meta.url), 'utf8');
  expect(source).not.toMatch(/\bfitRidge(?:V2)?\s*\(|\bpreregisterModels\s*\(|\bforecastDirectDemand\s*\(/);
  for (let horizonDays = 1; horizonDays <= 7; horizonDays++) {
    expect(existsSync(new URL(`../models/xm-demandasin-ridge-direct-h${horizonDays}-v4/1.0.0/model.json`, import.meta.url))).toBe(false);
  }
  expect(existsSync(new URL('../models/xm-demandasin-ridge-direct-h6-v2/1.0.0/model.json', import.meta.url))).toBe(true);
});

test('recorded 17..27 September capacity is reproducible without target observations', () => {
  for (const [variant, build] of Object.entries({ A: buildV4Primary, B: buildV4ContinuousComparator, C: buildV4UsableStatisticsComparator })) {
    const origins = Array.from({ length: 11 }, (_, index) => `2026-09-${String(index + 17).padStart(2, '0')}`);
    const buildable = origins.filter(date => build(records, date, addDays(date, 6), 6) !== null);
    expect(buildable).toEqual(manifest.observedSourceCapacity.constructibleOrigins[variant]);
  }
  expect(manifest.observedSourceCapacity.notPredictiveResults).toBe(true);
});
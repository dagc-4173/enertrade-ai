import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { demandEligibilityIndex, isDemandForecastSampleEligible } from '@/services/demand-semantic-eligibility';
import { parseCsv, partitions, samples, sha256 } from '@/experiments/hu06-multihorizon';
import { samplesV2 } from '@/experiments/hu06-multihorizon-v2';
import { eligibleDemandSamples, semanticExperimentV1, semanticExperimentV2 } from '@/experiments/hu06-multihorizon-semantic';
import { buildDemandDirectFeatures } from '@/services/demand-direct-features';

const root = new URL('../../../docs/evidencias/hu-06-multihorizon-v3-semantic/', import.meta.url);
const corpusText = readFileSync(new URL('../hu-06-multihorizon/corpus/xm-demandasin-2024-01-01_2026-09-29.csv', root), 'utf8');
const records = parseCsv(corpusText); const eligibility = demandEligibilityIndex(records.map(record => ({ date: record.fecha_xm, value: record.demanda_kwh })));
const stored = JSON.parse(readFileSync(new URL('results.json', root), 'utf8')) as any;
const excluded = new Set(['2026-09-16', '2026-09-28', '2026-09-29']);

test('V3 semantic preserves exact frozen corpus and labels evaluation retrospective', () => {
  expect(sha256(corpusText)).toBe('18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735');
  expect(records).toHaveLength(1003); expect(records.at(-3)).toEqual({ fecha_xm: '2026-09-27', demanda_kwh: 217211045.44 });
  expect(records.at(-2)).toEqual({ fecha_xm: '2026-09-28', demanda_kwh: 138000 }); expect(records.at(-1)).toEqual({ fecha_xm: '2026-09-29', demanda_kwh: 11310 });
  expect(stored.evaluationType).toBe('retrospective_technical_reevaluation'); expect(JSON.stringify(stored)).not.toContain('externalHoldout');
});

test.each(['v1', 'v2'] as const)('%s samples never use excluded observations as input or target', family => {
  const generator = family === 'v1' ? samples : samplesV2;
  for (let horizonDays = 1; horizonDays <= 7; horizonDays++) for (const range of [partitions.train, partitions.validation, partitions.externalHoldout]) {
    const rows = eligibleDemandSamples(generator(records, range, horizonDays) as any[], eligibility);
    for (const row of rows) {
      expect(excluded.has(row.targetDate)).toBe(false); expect(excluded.has(row.forecastOriginDate)).toBe(false);
      expect(row.featureDates.some((date: string) => excluded.has(date))).toBe(false);
      expect(isDemandForecastSampleEligible({ eligibility, forecastOriginDate: row.forecastOriginDate, featureDates: row.featureDates, targetDate: row.targetDate, requireTarget: true })).toBe(true);
    }
  }
});

test('normal dates 17..27 are available when their concrete V1 inputs are eligible', () => {
  const rows = eligibleDemandSamples(samples(records, { start: '2026-09-17', end: '2026-09-27' }, 1), eligibility);
  expect(rows.some(row => row.targetDate === '2026-09-27')).toBe(true);
  expect(rows.every(row => !excluded.has(row.targetDate) && row.featureDates.every(date => !excluded.has(date)))).toBe(true);
});

test('V2 rolling windows containing an excluded date are removed as complete samples', () => {
  const raw = samplesV2(records, { start: '2026-09-17', end: '2026-09-27' }, 1); const eligible = eligibleDemandSamples(raw, eligibility);
  expect(raw.some(row => row.featureDates.includes('2026-09-16'))).toBe(true); expect(eligible.every(row => !row.featureDates.includes('2026-09-16'))).toBe(true);
  expect(eligible.length).toBeLessThan(raw.length);
});

test('stored V3 results equal a fresh semantic reevaluation and select only on validation', () => {
  const v1 = semanticExperimentV1(records, sha256(corpusText)); const v2 = semanticExperimentV2(records, sha256(corpusText));
  expect(v1.results).toEqual(stored.v1.results); expect(v2.results).toEqual(stored.v2.results);
  for (const family of [v1, v2]) for (const result of Object.values(family.results) as any[]) {
    const ordered = [...result.validation.ridge].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha);
    expect(result.validation.selectedAlpha).toBe(ordered[0].alpha); expect(result.retrospectiveEvaluation.ridge.unavailable).toBe(0);
    expect(Number.isFinite(result.retrospectiveEvaluation.catastrophicThresholdKwh)).toBe(true);
  }
}, 15_000);

test('V3 script has no Prisma boundary and creates no runtime model artifact', () => {
  const script = readFileSync(new URL('../../scripts/hu06-multihorizon-semantic.ts', import.meta.url), 'utf8');
  expect(script).not.toMatch(/prisma|src\/models|backend\/src\/models|model\.json/);
  for (let horizonDays = 1; horizonDays <= 7; horizonDays++) expect(existsSync(new URL(`../models/xm-demandasin-ridge-direct-h${horizonDays}-v3-semantic/1.0.0/model.json`, import.meta.url))).toBe(false);
});

test('runtime V2 feature vector matches frozen sample without reading its target', () => {
  const sample = samplesV2(records, { start: '2026-05-20', end: '2026-05-20' }, 6)[0]!;
  const values = new Map(records.filter(row => row.fecha_xm <= sample.forecastOriginDate).map(row => [row.fecha_xm, row.demanda_kwh]));
  const built = buildDemandDirectFeatures(values, sample.forecastOriginDate, sample.targetDate);
  expect(built?.values).toEqual(sample.features);
  expect(built?.featureDates.every(date => date <= sample.forecastOriginDate)).toBe(true);
  expect(values.has(sample.targetDate)).toBe(false);
  const all = new Map(records.map(row => [row.fecha_xm, row.demanda_kwh]));
  expect(buildDemandDirectFeatures(all, '2026-09-27', '2026-10-03')).toBeNull();
});
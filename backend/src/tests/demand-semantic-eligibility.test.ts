import { expect, test } from 'bun:test';
import { demandEligibilityIndex, evaluateDemandObservationEligibility, isDemandForecastSampleEligible } from '@/services/demand-semantic-eligibility';

const addDays = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const observations = Array.from({ length: 75 }, (_, index) => {
  const date = addDays('2026-08-01', index);
  const value = date === '2026-09-16' ? 433_980 : date === '2026-09-28' ? 138_000 : date === '2026-09-29' ? 11_310 : 220_000_000 + (index % 3) * 2_000_000;
  return { date, value };
});
const evaluated = evaluateDemandObservationEligibility(observations); const index = demandEligibilityIndex(observations);

test.each([
  ['2026-09-15', 'USABLE'], ['2026-09-16', 'SEMANTIC_REVIEW_REQUIRED'], ['2026-09-17', 'USABLE'],
  ['2026-09-27', 'USABLE'], ['2026-09-28', 'SEMANTIC_REVIEW_REQUIRED'], ['2026-09-29', 'SEMANTIC_REVIEW_REQUIRED'],
] as const)('%s has per-observation semantic status %s', (date, semanticStatus) => {
  expect(evaluated.find(item => item.date === date)).toMatchObject({ date, semanticStatus, issueCode: semanticStatus === 'USABLE' ? null : 'WARNING_SEMANTIC_ANOMALY' });
});

test('sample with no excluded inputs is eligible', () => {
  expect(isDemandForecastSampleEligible({ eligibility: index, forecastOriginDate: '2026-09-27', featureDates: ['2026-09-27', '2026-09-21', '2026-09-14', '2026-08-31'] })).toBe(true);
});

test('sample whose lag is September 16 is not eligible', () => {
  expect(isDemandForecastSampleEligible({ eligibility: index, forecastOriginDate: '2026-09-23', featureDates: ['2026-09-22', '2026-09-16', '2026-09-09', '2026-08-26'] })).toBe(false);
});

test('rolling window containing September 16 is not eligible', () => {
  const rolling = Array.from({ length: 14 }, (_, lag) => addDays('2026-09-20', -lag));
  expect(isDemandForecastSampleEligible({ eligibility: index, forecastOriginDate: '2026-09-20', featureDates: rolling })).toBe(false);
});

test('rolling window after excluded dates is eligible again', () => {
  const rolling = Array.from({ length: 14 }, (_, lag) => addDays('2026-10-14', -lag));
  expect(isDemandForecastSampleEligible({ eligibility: index, forecastOriginDate: '2026-10-14', featureDates: rolling })).toBe(true);
});

test('training/evaluation requires an eligible target while runtime does not', () => {
  const input = { eligibility: index, forecastOriginDate: '2026-09-27', featureDates: ['2026-09-27'], targetDate: '2026-09-28' };
  expect(isDemandForecastSampleEligible(input)).toBe(true);
  expect(isDemandForecastSampleEligible({ ...input, requireTarget: true })).toBe(false);
});
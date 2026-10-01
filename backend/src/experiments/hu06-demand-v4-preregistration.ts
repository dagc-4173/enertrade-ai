import { addDays, type DemandRecord } from './hu06-multihorizon';
import { orderedFeaturesV2 } from './hu06-multihorizon-v2';
import { demandEligibilityIndex, isDemandForecastSampleEligible } from '@/services/demand-semantic-eligibility';
import { buildDemandDirectFeatures } from '@/services/demand-direct-features';
import { calendarDate } from '@/services/forecast.contract';

export const v4PrimaryFeatures = [
  'demand_at_origin', 'demand_6_days_before_origin', 'demand_13_days_before_origin', 'demand_27_days_before_origin',
  'sin_2pi_target_weekday_over7', 'cos_2pi_target_weekday_over7',
] as const;
export const v4UsableStatisticsFeatures = [
  ...orderedFeaturesV2.slice(0, 9),
  'demand_mean_last_7_usable', 'demand_mean_last_14_usable', 'demand_mean_last_28_usable',
  'demand_std_last_7_usable', 'demand_std_last_14_usable',
  'sin_2pi_target_weekday_over7', 'cos_2pi_target_weekday_over7',
] as const;
export const v4TargetRelativeFeatures = ['demand_target_minus_7', 'demand_target_minus_14', 'demand_target_minus_21', 'demand_target_minus_28'] as const;
export const v4UsableStatisticsWindow = { count: 28, maxCalendarDays: 42 } as const;

function context(records: DemandRecord[], origin: string, targetDate: string, horizonDays: number) {
  if (!calendarDate(origin) || !calendarDate(targetDate) || !Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6 || addDays(origin, horizonDays) !== targetDate) throw new Error('Invalid V4 direct origin/target/horizon.');
  const values = new Map<string, number>();
  for (const row of records) {
    if (!calendarDate(row.fecha_xm) || !Number.isFinite(row.demanda_kwh)) throw new Error('Invalid V4 observation.');
    if (row.fecha_xm > origin) continue;
    if (values.has(row.fecha_xm)) throw new Error('Duplicate V4 observation.');
    values.set(row.fecha_xm, row.demanda_kwh);
  }
  const eligibility = demandEligibilityIndex([...values].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({ date, value })));
  return { values, eligibility, origin, targetDate, horizonDays };
}

function calendarValues(targetDate: string) {
  const weekday = (new Date(`${targetDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  return [Math.sin(2 * Math.PI * weekday / 7), Math.cos(2 * Math.PI * weekday / 7)];
}

function points(input: ReturnType<typeof context>, dates: string[]) {
  if (dates.some(date => date > input.origin) || !isDemandForecastSampleEligible({ eligibility: input.eligibility, forecastOriginDate: input.origin, featureDates: dates })) return null;
  const values = dates.map(date => input.values.get(date));
  return values.some(value => value === undefined) ? null : values as number[];
}

export function buildV4Primary(records: DemandRecord[], origin: string, targetDate: string, horizonDays: number) {
  const input = context(records, origin, targetDate, horizonDays);
  const dates = [0, 6, 13, 27].map(lag => addDays(origin, -lag));
  const levels = points(input, dates);
  return levels ? { forecastOriginDate: origin, targetDate, horizonDays, orderedFeatures: v4PrimaryFeatures, values: [...levels, ...calendarValues(targetDate)], featureDates: dates } : null;
}

export function buildV4ContinuousComparator(records: DemandRecord[], origin: string, targetDate: string, horizonDays: number) {
  const input = context(records, origin, targetDate, horizonDays);
  const built = buildDemandDirectFeatures(input.values, origin, targetDate);
  return built && built.featureDates.every(date => date <= origin) ? built : null;
}

export function buildV4UsableStatisticsComparator(records: DemandRecord[], origin: string, targetDate: string, horizonDays: number) {
  const input = context(records, origin, targetDate, horizonDays);
  const lagDates = [0, 1, 2, 6, 7, 13, 14, 27, 28].map(lag => addDays(origin, -lag));
  const levels = points(input, lagDates);
  if (!levels) return null;
  const firstAllowed = addDays(origin, 1 - v4UsableStatisticsWindow.maxCalendarDays);
  const usableDates = [...input.values.keys()].filter(date => date >= firstAllowed && date <= origin && input.eligibility.get(date)?.semanticStatus === 'USABLE').sort().slice(-v4UsableStatisticsWindow.count);
  if (usableDates.length !== v4UsableStatisticsWindow.count) return null;
  const usable = usableDates.map(date => input.values.get(date)!);
  const recent = (count: number) => usable.slice(-count);
  const mean = (numbers: number[]) => numbers.reduce((total, value) => total + value, 0) / numbers.length;
  const std = (numbers: number[]) => { const center = mean(numbers); return Math.sqrt(mean(numbers.map(value => (value - center) ** 2))); };
  const usedObservationDates = [...new Set([...lagDates, ...usableDates])].sort();
  const calendarSpanDays = (Date.parse(`${origin}T00:00:00Z`) - Date.parse(`${usableDates[0]}T00:00:00Z`)) / 86_400_000 + 1;
  return {
    forecastOriginDate: origin, targetDate, horizonDays, orderedFeatures: v4UsableStatisticsFeatures,
    values: [...levels, mean(recent(7)), mean(recent(14)), mean(usable), std(recent(7)), std(recent(14)), ...calendarValues(targetDate)],
    featureDates: usedObservationDates, usableStatisticDates: usableDates, calendarSpanDays,
  };
}

export function buildV4TargetRelativeAblation(records: DemandRecord[], origin: string, targetDate: string, horizonDays: number) {
  const primary = buildV4Primary(records, origin, targetDate, horizonDays);
  if (!primary) return null;
  const input = context(records, origin, targetDate, horizonDays);
  const dates = [7, 14, 21, 28].map(lag => addDays(targetDate, -lag));
  const relative = points(input, dates);
  return relative ? { ...primary, orderedFeatures: [...v4PrimaryFeatures, ...v4TargetRelativeFeatures], values: [...primary.values, ...relative], featureDates: [...new Set([...primary.featureDates, ...dates])].sort(), targetRelativeDates: dates } : null;
}
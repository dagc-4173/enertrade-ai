import { addDays, type DemandRecord } from './hu06-multihorizon';
import { buildV4UsableStatisticsComparator, v4UsableStatisticsFeatures, v4UsableStatisticsWindow } from './hu06-demand-v4-preregistration';

export const v5OrderedFeatures = v4UsableStatisticsFeatures;
export const v5UsableStatisticsWindow = v4UsableStatisticsWindow;

export function buildV5Features(records: DemandRecord[], origin: string, targetDate: string, horizonDays: number) {
  const built = buildV4UsableStatisticsComparator(records, origin, targetDate, horizonDays);
  if (!built) return null;
  const dates = built.usableStatisticDates;
  const oldestDate = dates[0]!, newestDate = dates.at(-1)!;
  if (dates.length !== 28 || oldestDate < addDays(origin, -41) || newestDate > origin || built.calendarSpanDays > 42 ||
      built.featureDates.some(date => date > origin)) throw new Error('Invalid V5 source provenance.');
  return { ...built, count: 28 as const, oldestDate, newestDate, actualSourceDates: dates };
}
import { addDays } from '@/experiments/hu06-multihorizon';
import { orderedFeaturesV2 } from '@/experiments/hu06-multihorizon-v2';
import { demandEligibilityIndex, isDemandForecastSampleEligible } from './demand-semantic-eligibility';

export { orderedFeaturesV2 };
export function buildDemandDirectFeatures(values: ReadonlyMap<string, number>, origin: string, targetDate: string) {
  const lagDates = [0, 1, 2, 6, 7, 13, 14, 27, 28].map(lag => addDays(origin, -lag));
  const days28 = Array.from({ length: 28 }, (_, lag) => addDays(origin, -lag));
  const featureDates = [...new Set([...lagDates, ...days28])];
  const observations = [...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({ date, value }));
  const eligibility = demandEligibilityIndex(observations);
  if (!isDemandForecastSampleEligible({ eligibility, forecastOriginDate: origin, featureDates })) return null;
  const levels = lagDates.map(date => values.get(date));
  const rolling = days28.map(date => values.get(date));
  if ([...levels, ...rolling].some(value => value === undefined)) return null;
  const mean = (numbers: number[]) => numbers.reduce((total, value) => total + value, 0) / numbers.length;
  const deviation = (numbers: number[]) => Math.sqrt(mean(numbers.map(value => (value - mean(numbers)) ** 2)));
  const recent = rolling as number[];
  const weekday = (new Date(`${targetDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  return { forecastOriginDate: origin, featureDates, values: [
    ...levels as number[], mean(recent.slice(0, 7)), mean(recent.slice(0, 14)), mean(recent),
    deviation(recent.slice(0, 7)), deviation(recent.slice(0, 14)),
    Math.sin(2 * Math.PI * weekday / 7), Math.cos(2 * Math.PI * weekday / 7),
  ] };
}
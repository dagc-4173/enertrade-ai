export const directSupplyFeatures = [
  'energy_same_period_at_origin', 'energy_same_period_6_days_before_origin', 'energy_period24_at_origin',
  'energy_same_period_1_day_before_origin', 'energy_same_period_2_days_before_origin', 'energy_same_period_7_days_before_origin',
  'energy_same_period_13_days_before_origin', 'energy_same_period_14_days_before_origin', 'energy_same_period_27_days_before_origin', 'energy_same_period_28_days_before_origin',
  'energy_same_period_mean_7d_ending_at_origin', 'energy_same_period_mean_14d_ending_at_origin', 'energy_same_period_std_7d_ending_at_origin',
  'sin_2pi_hour_minus1_over24', 'cos_2pi_hour_minus1_over24', 'sin_2pi_target_weekday_over7', 'cos_2pi_target_weekday_over7',
] as const;

const date = (value: Date) => value.toISOString().slice(0, 10);
export function offsetDate(value: string, offset: number) { const current = new Date(`${value}T00:00:00Z`); current.setUTCDate(current.getUTCDate() + offset); return date(current); }
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;

export function buildDirectSupplyFeatures(read: (date: string, period: number) => number | undefined, origin: string, targetDate: string, period: number) {
  const day = (lag: number) => offsetDate(origin, -lag);
  const individualLags = [0, 6, 1, 2, 7, 13, 14, 27, 28];
  const individual = individualLags.map(lag => read(day(lag), period));
  const period24 = read(origin, 24);
  const rolling7Dates = Array.from({ length: 7 }, (_, lag) => day(lag));
  const rolling14Dates = Array.from({ length: 14 }, (_, lag) => day(lag));
  const rolling7 = rolling7Dates.map(sourceDate => read(sourceDate, period));
  const rolling14 = rolling14Dates.map(sourceDate => read(sourceDate, period));
  if ([...individual, period24, ...rolling7, ...rolling14].some(value => value === undefined)) return null;
  const rolling7Values = rolling7 as number[], rolling14Values = rolling14 as number[];
  const rolling7Mean = mean(rolling7Values), weekday = (new Date(`${targetDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  const values = [individual[0]!, individual[1]!, period24!, ...individual.slice(2) as number[], rolling7Mean, mean(rolling14Values), Math.sqrt(mean(rolling7Values.map(value => (value - rolling7Mean) ** 2))), Math.sin(2 * Math.PI * (period - 1) / 24), Math.cos(2 * Math.PI * (period - 1) / 24), Math.sin(2 * Math.PI * weekday / 7), Math.cos(2 * Math.PI * weekday / 7)];
  const featureSources: Record<string, string[]> = {
    energy_same_period_at_origin: [origin], energy_same_period_6_days_before_origin: [day(6)], energy_period24_at_origin: [origin],
    energy_same_period_1_day_before_origin: [day(1)], energy_same_period_2_days_before_origin: [day(2)], energy_same_period_7_days_before_origin: [day(7)],
    energy_same_period_13_days_before_origin: [day(13)], energy_same_period_14_days_before_origin: [day(14)], energy_same_period_27_days_before_origin: [day(27)], energy_same_period_28_days_before_origin: [day(28)],
    energy_same_period_mean_7d_ending_at_origin: rolling7Dates, energy_same_period_mean_14d_ending_at_origin: rolling14Dates, energy_same_period_std_7d_ending_at_origin: rolling7Dates,
    sin_2pi_hour_minus1_over24: [], cos_2pi_hour_minus1_over24: [], sin_2pi_target_weekday_over7: [], cos_2pi_target_weekday_over7: [],
  };
  const sourceDates = Object.values(featureSources).flat();
  const sourceObservations = [
    { date: origin, period }, { date: day(6), period }, { date: origin, period: 24 }, { date: day(1), period }, { date: day(2), period }, { date: day(7), period },
    { date: day(13), period }, { date: day(14), period }, { date: day(27), period }, { date: day(28), period },
    ...rolling7Dates.map(date => ({ date, period })), ...rolling14Dates.map(date => ({ date, period })), ...rolling7Dates.map(date => ({ date, period })),
  ];
  if (values.length !== directSupplyFeatures.length || values.some(value => !Number.isFinite(value)) || sourceDates.some(sourceDate => sourceDate > origin)) throw new Error('Invalid direct supply feature vector.');
  return { values, sourceDates, sourceObservations, featureSources };
}
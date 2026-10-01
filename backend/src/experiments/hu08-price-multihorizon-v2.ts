import { addDays, alphas, baselines, evaluate, horizons, partitions, promotionCriteria, verifyCorpus, type Metrics, type PriceRecord, type Ridge, type Sample } from './hu08-price-multihorizon';

export const baseFeaturesV2 = [
  'price_same_period_at_origin', 'price_same_period_1_day_before_origin', 'price_same_period_2_days_before_origin', 'price_same_period_3_days_before_origin',
  'price_same_period_6_days_before_origin', 'price_same_period_7_days_before_origin', 'price_same_period_13_days_before_origin', 'price_same_period_14_days_before_origin',
  'price_same_period_20_days_before_origin', 'price_same_period_21_days_before_origin', 'price_same_period_27_days_before_origin', 'price_same_period_28_days_before_origin',
  'price_same_period_mean_7d_ending_at_origin', 'price_same_period_mean_14d_ending_at_origin', 'price_same_period_mean_28d_ending_at_origin',
  'price_same_period_median_7d_ending_at_origin', 'price_same_period_median_14d_ending_at_origin',
  'price_same_period_std_7d_ending_at_origin', 'price_same_period_std_14d_ending_at_origin', 'price_same_period_std_28d_ending_at_origin',
  'price_same_period_min_7d_ending_at_origin', 'price_same_period_max_7d_ending_at_origin',
  'sin_2pi_period_minus1_over24', 'cos_2pi_period_minus1_over24', 'sin_2pi_target_weekday_over7', 'cos_2pi_target_weekday_over7', 'sin_2pi_target_month_minus1_over12', 'cos_2pi_target_month_minus1_over12',
] as const;

export const omittedExactRedundanciesV2 = {
  priceSamePeriodMean3d: 'Exact linear combination of price(t,p), price(t-1,p) and price(t-2,p).',
  priceTrend1d: 'Exact linear combination price(t,p)-price(t-1,p).',
  priceTrend7d: 'Exact linear combination price(t,p)-price(t-7,p).',
  rollingMeanDifference7d14d: 'Exact linear combination mean_7d-mean_14d.',
} as const;

const originOffsets = new Set([0, 1, 2, 3, 6, 7, 13, 14, 20, 21, 27, 28]);
export function targetRelativeFeatures(horizonDays: number) {
  return [7, 14, 21, 28].map(targetLag => ({ name: `price_target_minus_${targetLag}_same_period`, targetLag, originOffset: targetLag - horizonDays })).filter(item => item.originOffset >= 0 && !originOffsets.has(item.originOffset));
}
export function orderedFeaturesV2(horizonDays: number) { return [...baseFeaturesV2, ...targetRelativeFeatures(horizonDays).map(item => item.name)]; }

export type SampleV2 = Sample & { featureSources: Record<string, string[]> };
const finite = (value: number) => Number.isFinite(value); const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const median = (values: number[]) => { const ordered = [...values].sort((left, right) => left - right), middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2; };
const populationStandardDeviation = (values: number[]) => { const center = mean(values); return Math.sqrt(mean(values.map(value => (value - center) ** 2))); };
const sampleStandardDeviation = (values: number[]) => { const center = mean(values); return Math.sqrt(values.reduce((total, value) => total + (value - center) ** 2, 0) / (values.length - 1)); };
const weekday = (value: string) => (new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7;

export function samplesV2(records: PriceRecord[], targetRange: { start: string; end: string }, horizonDays: number): SampleV2[] {
  const { values } = verifyCorpus(records), output: SampleV2[] = [], relative = targetRelativeFeatures(horizonDays), at = (date: string, period: number) => values.get(`${date}|${period}`);
  for (let targetDate = targetRange.start; targetDate <= targetRange.end; targetDate = addDays(targetDate, 1)) {
    const origin = addDays(targetDate, -horizonDays), targetWeekday = weekday(targetDate), targetMonth = Number(targetDate.slice(5, 7)) - 1, b7Date = addDays(targetDate, -7);
    for (let period = 1; period <= 24; period++) {
      const lagOffsets = [0, 1, 2, 3, 6, 7, 13, 14, 20, 21, 27, 28], lagDates = lagOffsets.map(lag => addDays(origin, -lag)), levels = lagDates.map(date => at(date, period));
      const dates7 = Array.from({ length: 7 }, (_, lag) => addDays(origin, -lag)), dates14 = Array.from({ length: 14 }, (_, lag) => addDays(origin, -lag)), dates28 = Array.from({ length: 28 }, (_, lag) => addDays(origin, -lag));
      const values7 = dates7.map(date => at(date, period)), values14 = dates14.map(date => at(date, period)), values28 = dates28.map(date => at(date, period)); const target = at(targetDate, period), baselineB7 = at(b7Date, period);
      const relativeDates = relative.map(item => addDays(targetDate, -item.targetLag)), relativeValues = relativeDates.map(date => at(date, period));
      if ([...levels, ...values7, ...values14, ...values28, ...relativeValues, target, baselineB7].some(value => value === undefined)) continue;
      const featureSources: Record<string, string[]> = {};
      lagOffsets.forEach((lag, index) => { featureSources[baseFeaturesV2[index]!] = [lagDates[index]!]; });
      Object.assign(featureSources, {
        price_same_period_mean_7d_ending_at_origin: dates7, price_same_period_mean_14d_ending_at_origin: dates14, price_same_period_mean_28d_ending_at_origin: dates28,
        price_same_period_median_7d_ending_at_origin: dates7, price_same_period_median_14d_ending_at_origin: dates14,
        price_same_period_std_7d_ending_at_origin: dates7, price_same_period_std_14d_ending_at_origin: dates14, price_same_period_std_28d_ending_at_origin: dates28,
        price_same_period_min_7d_ending_at_origin: dates7, price_same_period_max_7d_ending_at_origin: dates7,
        sin_2pi_period_minus1_over24: [], cos_2pi_period_minus1_over24: [], sin_2pi_target_weekday_over7: [], cos_2pi_target_weekday_over7: [], sin_2pi_target_month_minus1_over12: [], cos_2pi_target_month_minus1_over12: [],
      });
      relative.forEach((item, index) => { featureSources[item.name] = [relativeDates[index]!]; });
      const featureDates = [...new Set(Object.values(featureSources).flat())]; if (featureDates.some(date => date > origin) || relativeDates.some(date => date > origin)) throw new Error('Price V2 feature leakage beyond forecast origin.');
      output.push({ forecastOriginDate: origin, targetDate, horizonDays, period, target: target!, baselineB7: baselineB7!, featureDates, featureSources, features: [
        ...levels as number[], mean(values7 as number[]), mean(values14 as number[]), mean(values28 as number[]), median(values7 as number[]), median(values14 as number[]), populationStandardDeviation(values7 as number[]), populationStandardDeviation(values14 as number[]), populationStandardDeviation(values28 as number[]), Math.min(...values7 as number[]), Math.max(...values7 as number[]),
        Math.sin(2 * Math.PI * (period - 1) / 24), Math.cos(2 * Math.PI * (period - 1) / 24), Math.sin(2 * Math.PI * targetWeekday / 7), Math.cos(2 * Math.PI * targetWeekday / 7), Math.sin(2 * Math.PI * targetMonth / 12), Math.cos(2 * Math.PI * targetMonth / 12), ...relativeValues as number[],
      ] });
    }
  }
  return output;
}

export function fitRidgeV2(rows: SampleV2[], alpha: number): Ridge {
  if (rows.length === 0) throw new Error('No price V2 training samples.'); const dimension = rows[0]!.features.length;
  const means = Array.from({ length: dimension }, (_, index) => mean(rows.map(row => row.features[index]!))), standardDeviations = Array.from({ length: dimension }, (_, index) => Math.sqrt(mean(rows.map(row => (row.features[index]! - means[index]!) ** 2)))); if (standardDeviations.some(value => !finite(value) || value <= 0)) throw new Error('Invalid price V2 scaler.');
  const targetMean = mean(rows.map(row => row.target)), matrix = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0)), vector = Array<number>(dimension).fill(0);
  for (const row of rows) { const features = row.features.map((value, index) => (value - means[index]!) / standardDeviations[index]!), centeredTarget = row.target - targetMean; for (let left = 0; left < dimension; left++) { vector[left]! += features[left]! * centeredTarget; for (let right = 0; right < dimension; right++) matrix[left]![right]! += features[left]! * features[right]!; } }
  for (let index = 0; index < dimension; index++) matrix[index]![index]! += alpha;
  const lower = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0)); for (let row = 0; row < dimension; row++) for (let column = 0; column <= row; column++) { let value = matrix[row]![column]!; for (let index = 0; index < column; index++) value -= lower[row]![index]! * lower[column]![index]!; if (row === column) { if (value <= 0 || !finite(value)) throw new Error('Price V2 Ridge matrix is not positive definite.'); lower[row]![column] = Math.sqrt(value); } else lower[row]![column] = value / lower[column]![column]!; }
  const forward = Array<number>(dimension).fill(0); for (let row = 0; row < dimension; row++) forward[row] = (vector[row]! - Array.from({ length: row }, (_, index) => lower[row]![index]! * forward[index]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  const coefficients = Array<number>(dimension).fill(0); for (let row = dimension - 1; row >= 0; row--) coefficients[row] = (forward[row]! - Array.from({ length: dimension - row - 1 }, (_, offset) => lower[row + offset + 1]![row]! * coefficients[row + offset + 1]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  if (![...means, ...standardDeviations, ...coefficients, targetMean].every(finite)) throw new Error('Non-finite price V2 artifact.'); return { alpha, coefficients, intercept: targetMean, means, standardDeviations };
}
export function predictV2(model: Ridge, features: number[]) { return model.intercept + features.reduce((total, value, index) => total + model.coefficients[index]! * ((value - model.means[index]!) / model.standardDeviations[index]!), 0); }

function weekdayDiagnostics(rows: SampleV2[], model: Ridge) { const buckets = new Map<number, { errors: number[] }>(); for (const row of rows) { const key = weekday(row.targetDate), bucket = buckets.get(key) ?? { errors: [] }; bucket.errors.push(predictV2(model, row.features) - row.target); buckets.set(key, bucket); } return Object.fromEntries([...buckets].map(([key, bucket]) => [String(key), { evaluable: bucket.errors.length, MAE: mean(bucket.errors.map(Math.abs)), bias: mean(bucket.errors) }])); }

export function experimentV2(records: PriceRecord[], corpusHash: string) {
  const corpus = verifyCorpus(records), results: Record<string, unknown> = {};
  for (const horizonDays of horizons) {
    const train = samplesV2(records, partitions.train, horizonDays), validation = samplesV2(records, partitions.validation, horizonDays), holdout = samplesV2(records, partitions.externalHoldout, horizonDays), baselinePredictors = baselines(train);
    const validationBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(validation, calculation)])) as Record<string, Metrics>, baselineReference = Object.entries(validationBaselines).sort(([leftId, left], [rightId, right]) => left.MAE - right.MAE || left.RMSE - right.RMSE || leftId.localeCompare(rightId))[0]![0];
    const validationRidge = alphas.map(alpha => { const model = fitRidgeV2(train, alpha); return { alpha, model, metrics: evaluate(validation, row => predictV2(model, row.features)) }; }), selected = validationRidge.sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha)[0]!;
    const holdoutBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(holdout, calculation)])) as Record<string, Metrics>, holdoutMetrics = evaluate(holdout, row => predictV2(selected.model, row.features)), reference = holdoutBaselines[baselineReference]!;
    const catastrophicThreshold = promotionCriteria.catastrophicErrorMultiplierOfTrainTargetStandardDeviation * sampleStandardDeviation(train.map(row => row.target)), maeImprovementPercent = 100 * (reference.MAE - holdoutMetrics.MAE) / reference.MAE;
    const technicalCandidate = holdoutMetrics.unavailable === promotionCriteria.unavailableRequired && [...selected.model.coefficients, selected.model.intercept, ...selected.model.means, ...selected.model.standardDeviations, holdoutMetrics.MAE, holdoutMetrics.RMSE, holdoutMetrics.bias, holdoutMetrics.WAPE, holdoutMetrics.maxAbsoluteError].every(finite) && maeImprovementPercent >= promotionCriteria.minimumMaeImprovementPercent && holdoutMetrics.WAPE <= promotionCriteria.maximumWapeMultiplier * reference.WAPE && holdoutMetrics.maxAbsoluteError <= catastrophicThreshold;
    results[String(horizonDays)] = { modelId: `xm-preciobolsnaci-ridge-direct-h${horizonDays}-v2`, modelVersion: '1.0.0-experimental', horizonDays, corpusHash, samples: { train: train.length, validation: validation.length, externalHoldout: holdout.length }, validation: { baselines: validationBaselines, ridge: validationRidge.map(value => ({ alpha: value.alpha, metrics: value.metrics })), selectedAlpha: selected.alpha, baselineReference }, externalHoldout: { baselines: holdoutBaselines, ridge: holdoutMetrics, baselineReference, maeImprovementPercent, catastrophicThreshold, byWeekday: weekdayDiagnostics(holdout, selected.model) }, technicalCandidate, fittedParameters: selected.model, ranges: partitions, promotionCriteria, orderedFeatures: orderedFeaturesV2(horizonDays), targetRelativeFeatures: targetRelativeFeatures(horizonDays), omittedExactRedundancies: omittedExactRedundanciesV2, originDefinition: 'end-of-calendar-day t; all historical and target-relative price sources are dated t or earlier', targetDefinition: `precio_cop_kwh(targetDate=t+${horizonDays}, periodo=1..24)` };
  }
  return { experimentId: 'hu-08-price-multihorizon-v2', corpus: { firstDate: corpus.firstDate, lastDate: corpus.lastDate, completeDays: corpus.completeDays, observations: corpus.observations }, partitions, baseFeatures: baseFeaturesV2, omittedExactRedundancies: omittedExactRedundanciesV2, promotionCriteria, results };
}
import { addDays, alphas, evaluate, horizons, partitions, promotionCriteria, verifyCorpus, type DemandRecord, type Metrics, type Ridge, type Sample } from './hu06-multihorizon';

export const orderedFeaturesV2 = [
  'demand_at_origin',
  'demand_1_day_before_origin',
  'demand_2_days_before_origin',
  'demand_6_days_before_origin',
  'demand_7_days_before_origin',
  'demand_13_days_before_origin',
  'demand_14_days_before_origin',
  'demand_27_days_before_origin',
  'demand_28_days_before_origin',
  'demand_mean_7d_ending_at_origin',
  'demand_mean_14d_ending_at_origin',
  'demand_mean_28d_ending_at_origin',
  'demand_std_7d_ending_at_origin',
  'demand_std_14d_ending_at_origin',
  'sin_2pi_target_weekday_over7',
  'cos_2pi_target_weekday_over7',
] as const;

export const omittedCandidatesV2 = {
  demandMean3d: 'Exact linear combination of demand(t), demand(t-1) and demand(t-2) already present in Ridge.',
  recentTrend: 'Exact linear combination demand(t)-demand(t-1).',
} as const;

export type SampleV2 = Sample & { featureSources: Record<string, string[]> };
const finite = (value: number) => Number.isFinite(value);
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const populationStandardDeviation = (values: number[]) => { const center = mean(values); return Math.sqrt(mean(values.map(value => (value - center) ** 2))); };
const sampleStandardDeviation = (values: number[]) => { const center = mean(values); return Math.sqrt(values.reduce((total, value) => total + (value - center) ** 2, 0) / (values.length - 1)); };
const weekday = (value: string) => (new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7;

export function samplesV2(records: DemandRecord[], targetRange: { start: string; end: string }, horizonDays: number): SampleV2[] {
  const { values } = verifyCorpus(records); const output: SampleV2[] = [];
  for (let targetDate = targetRange.start; targetDate <= targetRange.end; targetDate = addDays(targetDate, 1)) {
    const origin = addDays(targetDate, -horizonDays);
    const sourceDates = (days: number) => Array.from({ length: days }, (_, lag) => addDays(origin, -lag));
    const dates7 = sourceDates(7), dates14 = sourceDates(14), dates28 = sourceDates(28);
    const values7 = dates7.map(date => values.get(date)), values14 = dates14.map(date => values.get(date)), values28 = dates28.map(date => values.get(date));
    const lagDates = [0, 1, 2, 6, 7, 13, 14, 27, 28].map(lag => addDays(origin, -lag));
    const levels = lagDates.map(date => values.get(date)); const target = values.get(targetDate);
    if ([...levels, ...values7, ...values14, ...values28, target].some(value => value === undefined)) continue;
    const featureSources = {
      demand_at_origin: [lagDates[0]!], demand_1_day_before_origin: [lagDates[1]!], demand_2_days_before_origin: [lagDates[2]!],
      demand_6_days_before_origin: [lagDates[3]!], demand_7_days_before_origin: [lagDates[4]!], demand_13_days_before_origin: [lagDates[5]!],
      demand_14_days_before_origin: [lagDates[6]!], demand_27_days_before_origin: [lagDates[7]!], demand_28_days_before_origin: [lagDates[8]!],
      demand_mean_7d_ending_at_origin: dates7, demand_mean_14d_ending_at_origin: dates14, demand_mean_28d_ending_at_origin: dates28,
      demand_std_7d_ending_at_origin: dates7, demand_std_14d_ending_at_origin: dates14,
      sin_2pi_target_weekday_over7: [], cos_2pi_target_weekday_over7: [],
    };
    if (Object.values(featureSources).flat().some(date => date > origin)) throw new Error('V2 feature leakage beyond forecast origin.');
    const targetWeekday = weekday(targetDate);
    output.push({ forecastOriginDate: origin, targetDate, horizonDays, target: target!, featureDates: Object.values(featureSources).flat(), featureSources, features: [
      ...levels as number[], mean(values7 as number[]), mean(values14 as number[]), mean(values28 as number[]), populationStandardDeviation(values7 as number[]), populationStandardDeviation(values14 as number[]),
      Math.sin(2 * Math.PI * targetWeekday / 7), Math.cos(2 * Math.PI * targetWeekday / 7),
    ] });
  }
  return output;
}

export function fitRidgeV2(rows: SampleV2[], alpha: number): Ridge {
  const dimension = orderedFeaturesV2.length;
  if (rows.length === 0) throw new Error('No V2 training samples.');
  const means = Array.from({ length: dimension }, (_, index) => mean(rows.map(row => row.features[index]!)));
  const standardDeviations = Array.from({ length: dimension }, (_, index) => Math.sqrt(mean(rows.map(row => (row.features[index]! - means[index]!) ** 2))));
  if (standardDeviations.some(value => !finite(value) || value <= 0)) throw new Error('Invalid V2 training scaler.');
  const targetMean = mean(rows.map(row => row.target));
  const matrix = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0)); const vector = Array<number>(dimension).fill(0);
  for (const row of rows) {
    const features = row.features.map((value, index) => (value - means[index]!) / standardDeviations[index]!); const centeredTarget = row.target - targetMean;
    for (let left = 0; left < dimension; left++) { vector[left]! += features[left]! * centeredTarget; for (let right = 0; right < dimension; right++) matrix[left]![right]! += features[left]! * features[right]!; }
  }
  for (let index = 0; index < dimension; index++) matrix[index]![index]! += alpha;
  const lower = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
  for (let row = 0; row < dimension; row++) for (let column = 0; column <= row; column++) {
    let value = matrix[row]![column]!; for (let index = 0; index < column; index++) value -= lower[row]![index]! * lower[column]![index]!;
    if (row === column) { if (value <= 0 || !finite(value)) throw new Error('V2 Ridge matrix is not positive definite.'); lower[row]![column] = Math.sqrt(value); } else lower[row]![column] = value / lower[column]![column]!;
  }
  const forward = Array<number>(dimension).fill(0); for (let row = 0; row < dimension; row++) forward[row] = (vector[row]! - Array.from({ length: row }, (_, index) => lower[row]![index]! * forward[index]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  const coefficients = Array<number>(dimension).fill(0); for (let row = dimension - 1; row >= 0; row--) coefficients[row] = (forward[row]! - Array.from({ length: dimension - row - 1 }, (_, offset) => lower[row + offset + 1]![row]! * coefficients[row + offset + 1]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  if (![...means, ...standardDeviations, ...coefficients, targetMean].every(finite)) throw new Error('Non-finite V2 Ridge artifact.');
  return { alpha, coefficients, intercept: targetMean, means, standardDeviations };
}

export function predictV2(model: Ridge, features: number[]) { return model.intercept + features.reduce((total, value, index) => total + model.coefficients[index]! * ((value - model.means[index]!) / model.standardDeviations[index]!), 0); }

export function baselinesV2(train: SampleV2[]) {
  const weekdayMeans = new Map<number, number>();
  for (let targetWeekday = 0; targetWeekday < 7; targetWeekday++) weekdayMeans.set(targetWeekday, mean(train.filter(row => weekday(row.targetDate) === targetWeekday).map(row => row.target)));
  return {
    B_ORIGIN: (row: Sample) => row.features[0],
    B_ORIGIN_MINUS_6: (row: Sample) => row.features[3],
    B_TRAIN_TARGET_WEEKDAY_MEAN: (row: Sample) => weekdayMeans.get(weekday(row.targetDate)),
  };
}

export function experimentV2(records: DemandRecord[], corpusHash: string) {
  const corpus = verifyCorpus(records); const results: Record<string, unknown> = {};
  for (const horizonDays of horizons) {
    const train = samplesV2(records, partitions.train, horizonDays), validation = samplesV2(records, partitions.validation, horizonDays), holdout = samplesV2(records, partitions.externalHoldout, horizonDays);
    const baselinePredictors = baselinesV2(train);
    const validationBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(validation, calculation)])) as Record<string, Metrics>;
    const baselineReference = Object.entries(validationBaselines).sort(([leftId, left], [rightId, right]) => left.MAE - right.MAE || left.RMSE - right.RMSE || leftId.localeCompare(rightId))[0]![0];
    const validationRidge = alphas.map(alpha => { const model = fitRidgeV2(train, alpha); return { alpha, model, metrics: evaluate(validation, row => predictV2(model, row.features)) }; });
    const selected = validationRidge.sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha)[0]!;
    const holdoutBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(holdout, calculation)])) as Record<string, Metrics>;
    const holdoutMetrics = evaluate(holdout, row => predictV2(selected.model, row.features)); const reference = holdoutBaselines[baselineReference]!;
    const maeImprovementPercent = 100 * (reference.MAE - holdoutMetrics.MAE) / reference.MAE;
    const catastrophicThresholdKwh = promotionCriteria.catastrophicErrorMultiplierOfTrainTargetStandardDeviation * sampleStandardDeviation(train.map(row => row.target));
    const finiteValues = [holdoutMetrics.MAE, holdoutMetrics.RMSE, holdoutMetrics.bias, holdoutMetrics.WAPE, holdoutMetrics.maxAbsoluteErrorKwh, ...selected.model.coefficients, selected.model.intercept, ...selected.model.means, ...selected.model.standardDeviations].every(finite);
    const candidate = holdoutMetrics.unavailable === promotionCriteria.unavailableRequired && finiteValues && maeImprovementPercent >= promotionCriteria.minimumMaeImprovementPercent && holdoutMetrics.WAPE <= promotionCriteria.maximumWapeMultiplier * reference.WAPE && holdoutMetrics.maxAbsoluteErrorKwh <= catastrophicThresholdKwh;
    const coefficientImportance = orderedFeaturesV2.map((feature, index) => ({ feature, standardizedCoefficient: selected.model.coefficients[index]!, absoluteStandardizedCoefficient: Math.abs(selected.model.coefficients[index]!) })).sort((left, right) => right.absoluteStandardizedCoefficient - left.absoluteStandardizedCoefficient);
    results[String(horizonDays)] = {
      modelId: `xm-demandasin-ridge-direct-h${horizonDays}-v2`, modelVersion: '1.0.0-experimental', horizonDays, corpusHash,
      samples: { train: train.length, validation: validation.length, externalHoldout: holdout.length },
      validation: { baselines: validationBaselines, ridge: validationRidge.map(value => ({ alpha: value.alpha, metrics: value.metrics })), selectedAlpha: selected.alpha, baselineReference },
      externalHoldout: { baselines: holdoutBaselines, ridge: holdoutMetrics, baselineReference, maeImprovementPercent, catastrophicThresholdKwh },
      candidate, artifact: selected.model, coefficientImportance, ranges: partitions, orderedFeatures: orderedFeaturesV2, omittedCandidates: omittedCandidatesV2, promotionCriteria,
      originDefinition: 'end-of-calendar-day t; every observed demand source date is <= t', targetDefinition: `demanda_kwh(targetDate=t+${horizonDays})`,
    };
  }
  return { experimentId: 'hu-06-multihorizon-v2', corpus: { firstDate: corpus.firstDate, lastDate: corpus.lastDate, observations: corpus.observations }, partitions, orderedFeatures: orderedFeaturesV2, omittedCandidates: omittedCandidatesV2, promotionCriteria, results };
}
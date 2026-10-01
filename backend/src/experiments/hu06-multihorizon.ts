import { createHash } from 'node:crypto';

export const horizons = [1, 2, 3, 4, 5, 6, 7] as const;
export const alphas = [0.01, 0.1, 1, 10, 100] as const;
export const orderedFeatures = [
  'demand_at_origin',
  'demand_6_days_before_origin',
  'demand_13_days_before_origin',
  'demand_27_days_before_origin',
  'sin_2pi_target_weekday_over7',
  'cos_2pi_target_weekday_over7',
] as const;
export const partitions = {
  train: { start: '2024-02-04', end: '2026-03-31' },
  validation: { start: '2026-04-01', end: '2026-05-31' },
  externalHoldout: { start: '2026-06-01', end: '2026-09-29' },
} as const;
export const promotionCriteria = {
  unavailableRequired: 0,
  minimumMaeImprovementPercent: 1,
  maximumWapeMultiplier: 1,
  catastrophicErrorMultiplierOfTrainTargetStandardDeviation: 10,
} as const;

export type DemandRecord = { fecha_xm: string; demanda_kwh: number };
export type Sample = {
  forecastOriginDate: string;
  targetDate: string;
  horizonDays: number;
  features: number[];
  target: number;
  featureDates: string[];
};
export type Metrics = {
  evaluable: number;
  unavailable: number;
  MAE: number;
  RMSE: number;
  bias: number;
  WAPE: number;
  numeratorAbsoluteErrorKwh: number;
  denominatorAbsoluteActualKwh: number;
  maxAbsoluteErrorKwh: number;
};
export type Ridge = {
  alpha: number;
  coefficients: number[];
  intercept: number;
  means: number[];
  standardDeviations: number[];
};

const finite = (value: number) => Number.isFinite(value);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
export function addDays(value: string, days: number) {
  const current = new Date(`${value}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + days);
  return isoDate(current);
}
function targetWeekday(value: string) { return (new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7; }
function mean(values: number[]) { return values.reduce((total, value) => total + value, 0) / values.length; }
function sampleStandardDeviation(values: number[]) {
  const center = mean(values);
  return Math.sqrt(values.reduce((total, value) => total + (value - center) ** 2, 0) / (values.length - 1));
}

export function csv(records: DemandRecord[]) {
  return `fecha_xm,demanda_kwh\n${records.map(record => `${record.fecha_xm},${record.demanda_kwh}`).join('\n')}\n`;
}

export function parseCsv(value: string): DemandRecord[] {
  const lines = value.trim().split('\n');
  if (lines.shift() !== 'fecha_xm,demanda_kwh') throw new Error('Unexpected DemaSIN corpus header.');
  return lines.map(line => {
    const [fecha_xm, demand] = line.split(',');
    if (!fecha_xm || !demand) throw new Error('Malformed DemaSIN corpus row.');
    return { fecha_xm, demanda_kwh: Number(demand) };
  });
}

export function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }

export function verifyCorpus(records: DemandRecord[]) {
  const values = new Map<string, number>();
  for (const record of records) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.fecha_xm) || isoDate(new Date(`${record.fecha_xm}T00:00:00Z`)) !== record.fecha_xm || !finite(record.demanda_kwh)) throw new Error('Invalid DemaSIN corpus value.');
    if (values.has(record.fecha_xm)) throw new Error('Duplicate DemaSIN date.');
    values.set(record.fecha_xm, record.demanda_kwh);
  }
  const dates = [...values.keys()].sort();
  if (dates.length === 0) throw new Error('Empty DemaSIN corpus.');
  for (let index = 1; index < dates.length; index++) if (addDays(dates[index - 1]!, 1) !== dates[index]) throw new Error('DemaSIN corpus has a missing date.');
  return { values, firstDate: dates[0]!, lastDate: dates.at(-1)!, observations: dates.length, gaps: 0, duplicates: 0, missingValues: 0 };
}

export function samples(records: DemandRecord[], targetRange: { start: string; end: string }, horizonDays: number): Sample[] {
  const { values } = verifyCorpus(records); const result: Sample[] = [];
  for (let targetDate = targetRange.start; targetDate <= targetRange.end; targetDate = addDays(targetDate, 1)) {
    const origin = addDays(targetDate, -horizonDays);
    const featureDates = [origin, addDays(origin, -6), addDays(origin, -13), addDays(origin, -27)];
    const levels = featureDates.map(featureDate => values.get(featureDate));
    const target = values.get(targetDate);
    if (levels.some(value => value === undefined) || target === undefined) continue;
    if (featureDates.some(featureDate => featureDate > origin)) throw new Error('Feature leakage beyond forecast origin.');
    const weekday = targetWeekday(targetDate);
    result.push({ forecastOriginDate: origin, targetDate, horizonDays, features: [...levels as number[], Math.sin(2 * Math.PI * weekday / 7), Math.cos(2 * Math.PI * weekday / 7)], target, featureDates });
  }
  return result;
}

export function fitRidge(rows: Sample[], alpha: number): Ridge {
  const dimension = orderedFeatures.length;
  if (rows.length === 0) throw new Error('No training samples.');
  const means = Array.from({ length: dimension }, (_, index) => mean(rows.map(row => row.features[index]!)));
  const standardDeviations = Array.from({ length: dimension }, (_, index) => Math.sqrt(mean(rows.map(row => (row.features[index]! - means[index]!) ** 2))));
  if (standardDeviations.some(value => !finite(value) || value <= 0)) throw new Error('Invalid training scaler.');
  const targetMean = mean(rows.map(row => row.target));
  const matrix = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
  const vector = Array<number>(dimension).fill(0);
  for (const row of rows) {
    const features = row.features.map((value, index) => (value - means[index]!) / standardDeviations[index]!);
    const centeredTarget = row.target - targetMean;
    for (let left = 0; left < dimension; left++) {
      vector[left]! += features[left]! * centeredTarget;
      for (let right = 0; right < dimension; right++) matrix[left]![right]! += features[left]! * features[right]!;
    }
  }
  for (let index = 0; index < dimension; index++) matrix[index]![index]! += alpha;
  const lower = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
  for (let row = 0; row < dimension; row++) for (let column = 0; column <= row; column++) {
    let value = matrix[row]![column]!;
    for (let index = 0; index < column; index++) value -= lower[row]![index]! * lower[column]![index]!;
    if (row === column) {
      if (value <= 0 || !finite(value)) throw new Error('Ridge matrix is not positive definite.');
      lower[row]![column] = Math.sqrt(value);
    } else lower[row]![column] = value / lower[column]![column]!;
  }
  const forward = Array<number>(dimension).fill(0);
  for (let row = 0; row < dimension; row++) forward[row] = (vector[row]! - Array.from({ length: row }, (_, index) => lower[row]![index]! * forward[index]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  const coefficients = Array<number>(dimension).fill(0);
  for (let row = dimension - 1; row >= 0; row--) coefficients[row] = (forward[row]! - Array.from({ length: dimension - row - 1 }, (_, offset) => lower[row + offset + 1]![row]! * coefficients[row + offset + 1]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  if (![...means, ...standardDeviations, ...coefficients, targetMean].every(finite)) throw new Error('Non-finite Ridge artifact.');
  return { alpha, coefficients, intercept: targetMean, means, standardDeviations };
}

export function predict(model: Ridge, features: number[]) {
  return model.intercept + features.reduce((total, value, index) => total + model.coefficients[index]! * ((value - model.means[index]!) / model.standardDeviations[index]!), 0);
}

export function evaluate(rows: Sample[], calculate: (row: Sample) => number | undefined): Metrics {
  const errors: number[] = []; const actuals: number[] = []; let unavailable = 0;
  for (const row of rows) {
    const prediction = calculate(row);
    if (prediction === undefined || !finite(prediction)) { unavailable++; continue; }
    errors.push(prediction - row.target); actuals.push(row.target);
  }
  const evaluable = errors.length;
  const numeratorAbsoluteErrorKwh = errors.reduce((total, error) => total + Math.abs(error), 0);
  const denominatorAbsoluteActualKwh = actuals.reduce((total, actual) => total + Math.abs(actual), 0);
  return { evaluable, unavailable, MAE: numeratorAbsoluteErrorKwh / evaluable, RMSE: Math.sqrt(errors.reduce((total, error) => total + error ** 2, 0) / evaluable), bias: mean(errors), WAPE: 100 * numeratorAbsoluteErrorKwh / denominatorAbsoluteActualKwh, numeratorAbsoluteErrorKwh, denominatorAbsoluteActualKwh, maxAbsoluteErrorKwh: Math.max(...errors.map(Math.abs)) };
}

export function baselines(train: Sample[]) {
  const weekdayMeans = new Map<number, number>();
  for (let weekday = 0; weekday < 7; weekday++) {
    const values = train.filter(row => targetWeekday(row.targetDate) === weekday).map(row => row.target);
    weekdayMeans.set(weekday, mean(values));
  }
  return {
    B_ORIGIN: (row: Sample) => row.features[0],
    B_ORIGIN_MINUS_6: (row: Sample) => row.features[1],
    B_TRAIN_TARGET_WEEKDAY_MEAN: (row: Sample) => weekdayMeans.get(targetWeekday(row.targetDate)),
  };
}

export function experiment(records: DemandRecord[], corpusHash: string) {
  const corpus = verifyCorpus(records); const results: Record<string, unknown> = {};
  for (const horizonDays of horizons) {
    const train = samples(records, partitions.train, horizonDays);
    const validation = samples(records, partitions.validation, horizonDays);
    const holdout = samples(records, partitions.externalHoldout, horizonDays);
    const baselinePredictors = baselines(train);
    const validationBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(validation, calculation)])) as Record<string, Metrics>;
    const baselineReference = Object.entries(validationBaselines).sort(([leftId, left], [rightId, right]) => left.MAE - right.MAE || left.RMSE - right.RMSE || leftId.localeCompare(rightId))[0]![0];
    const validationRidge = alphas.map(alpha => { const model = fitRidge(train, alpha); return { alpha, model, metrics: evaluate(validation, row => predict(model, row.features)) }; });
    const selected = validationRidge.sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha)[0]!;
    const holdoutBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(holdout, calculation)])) as Record<string, Metrics>;
    const holdoutMetrics = evaluate(holdout, row => predict(selected.model, row.features));
    const reference = holdoutBaselines[baselineReference]!;
    const maeImprovementPercent = 100 * (reference.MAE - holdoutMetrics.MAE) / reference.MAE;
    const catastrophicThresholdKwh = promotionCriteria.catastrophicErrorMultiplierOfTrainTargetStandardDeviation * sampleStandardDeviation(train.map(row => row.target));
    const finiteValues = [holdoutMetrics.MAE, holdoutMetrics.RMSE, holdoutMetrics.bias, holdoutMetrics.WAPE, holdoutMetrics.maxAbsoluteErrorKwh, ...selected.model.coefficients, selected.model.intercept, ...selected.model.means, ...selected.model.standardDeviations].every(finite);
    const candidate = holdoutMetrics.unavailable === promotionCriteria.unavailableRequired && finiteValues && maeImprovementPercent >= promotionCriteria.minimumMaeImprovementPercent && holdoutMetrics.WAPE <= promotionCriteria.maximumWapeMultiplier * reference.WAPE && holdoutMetrics.maxAbsoluteErrorKwh <= catastrophicThresholdKwh;
    results[String(horizonDays)] = {
      modelId: `xm-demandasin-ridge-direct-h${horizonDays}-v1`, modelVersion: '1.0.0-experimental', horizonDays, corpusHash,
      samples: { train: train.length, validation: validation.length, externalHoldout: holdout.length },
      validation: { baselines: validationBaselines, ridge: validationRidge.map(value => ({ alpha: value.alpha, metrics: value.metrics })), selectedAlpha: selected.alpha, baselineReference },
      externalHoldout: { baselines: holdoutBaselines, ridge: holdoutMetrics, baselineReference, maeImprovementPercent, catastrophicThresholdKwh },
      candidate, artifact: selected.model, ranges: partitions, promotionCriteria,
      originDefinition: 'end-of-calendar-day t; all observed demand features are dated t or earlier',
      targetDefinition: `demanda_kwh(targetDate=t+${horizonDays})`, orderedFeatures,
    };
  }
  return { experimentId: 'hu-06-multihorizon-v1', corpus: { firstDate: corpus.firstDate, lastDate: corpus.lastDate, observations: corpus.observations }, partitions, orderedFeatures, promotionCriteria, results };
}
import { createHash } from 'node:crypto';

export const horizons = [1, 2, 3, 4, 5, 6, 7] as const;
export const alphas = [0.01, 0.1, 1, 10, 100] as const;
export const orderedFeatures = [
  'price_same_period_at_origin', 'price_same_period_1_day_before_origin', 'price_same_period_2_days_before_origin',
  'price_same_period_6_days_before_origin', 'price_same_period_7_days_before_origin', 'price_same_period_13_days_before_origin', 'price_same_period_14_days_before_origin',
  'price_same_period_mean_7d_ending_at_origin', 'price_same_period_mean_14d_ending_at_origin',
  'price_same_period_std_7d_ending_at_origin', 'price_same_period_std_14d_ending_at_origin',
  'sin_2pi_period_minus1_over24', 'cos_2pi_period_minus1_over24', 'sin_2pi_target_weekday_over7', 'cos_2pi_target_weekday_over7',
] as const;
export const omittedExactRedundancies = { priceSamePeriodMean3d: 'Exact linear combination of price(t,p), price(t-1,p) and price(t-2,p) already present in Ridge.' } as const;
export const partitions = {
  train: { start: '2024-02-01', end: '2026-03-31' }, validation: { start: '2026-04-01', end: '2026-05-31' }, externalHoldout: { start: '2026-06-01', end: '2026-09-28' },
} as const;
export const promotionCriteria = { unavailableRequired: 0, minimumMaeImprovementPercent: 1, maximumWapeMultiplier: 1, catastrophicErrorMultiplierOfTrainTargetStandardDeviation: 10 } as const;

export type PriceRecord = { fecha_xm: string; periodo: number; precio_cop_kwh: number };
export type Sample = { forecastOriginDate: string; targetDate: string; horizonDays: number; period: number; features: number[]; target: number; baselineB7: number; featureDates: string[] };
export type Metrics = { evaluable: number; unavailable: number; MAE: number; RMSE: number; bias: number; WAPE: number; numeratorAbsoluteError: number; denominatorAbsoluteActual: number; maxAbsoluteError: number; byPeriod: Record<string, Omit<Metrics, 'byPeriod'>> };
export type Ridge = { alpha: number; coefficients: number[]; intercept: number; means: number[]; standardDeviations: number[] };

const finite = (value: number) => Number.isFinite(value); const iso = (value: Date) => value.toISOString().slice(0, 10);
export function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return iso(date); }
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const populationStandardDeviation = (values: number[]) => { const center = mean(values); return Math.sqrt(mean(values.map(value => (value - center) ** 2))); };
const sampleStandardDeviation = (values: number[]) => { const center = mean(values); return Math.sqrt(values.reduce((total, value) => total + (value - center) ** 2, 0) / (values.length - 1)); };
const weekday = (value: string) => (new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7;

export function csv(records: PriceRecord[]) { return `fecha_xm,periodo,precio_cop_kwh\n${records.map(record => `${record.fecha_xm},${record.periodo},${record.precio_cop_kwh}`).join('\n')}\n`; }
export function parseCsv(value: string): PriceRecord[] { const lines = value.trim().split('\n'); if (lines.shift() !== 'fecha_xm,periodo,precio_cop_kwh') throw new Error('Unexpected PrecBolsNaci corpus header.'); return lines.map(line => { const [fecha_xm, period, price] = line.split(','); if (!fecha_xm || !period || !price) throw new Error('Malformed PrecBolsNaci corpus row.'); return { fecha_xm, periodo: Number(period), precio_cop_kwh: Number(price) }; }); }
export function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }

export function verifyCorpus(records: PriceRecord[]) {
  const values = new Map<string, number>(); const days = new Map<string, Set<number>>();
  for (const record of records) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.fecha_xm) || iso(new Date(`${record.fecha_xm}T00:00:00Z`)) !== record.fecha_xm || !Number.isInteger(record.periodo) || record.periodo < 1 || record.periodo > 24 || !finite(record.precio_cop_kwh)) throw new Error('Invalid PrecBolsNaci corpus value.');
    const key = `${record.fecha_xm}|${record.periodo}`; if (values.has(key)) throw new Error('Duplicate PrecBolsNaci temporal identity.'); values.set(key, record.precio_cop_kwh);
    const periods = days.get(record.fecha_xm) ?? new Set<number>(); periods.add(record.periodo); days.set(record.fecha_xm, periods);
  }
  const dates = [...days.keys()].sort(); if (dates.length === 0) throw new Error('Empty PrecBolsNaci corpus.');
  for (let index = 1; index < dates.length; index++) if (addDays(dates[index - 1]!, 1) !== dates[index]) throw new Error('PrecBolsNaci corpus has a missing date.');
  for (const periods of days.values()) if (periods.size !== 24 || Array.from({ length: 24 }, (_, index) => !periods.has(index + 1)).some(Boolean)) throw new Error('PrecBolsNaci corpus has an incomplete date.');
  return { values, firstDate: dates[0]!, lastDate: dates.at(-1)!, completeDays: dates.length, observations: records.length, gaps: 0, duplicates: 0, missingValues: 0, incompleteDays: 0 };
}

export function samples(records: PriceRecord[], targetRange: { start: string; end: string }, horizonDays: number): Sample[] {
  const { values } = verifyCorpus(records); const output: Sample[] = []; const at = (date: string, period: number) => values.get(`${date}|${period}`);
  for (let targetDate = targetRange.start; targetDate <= targetRange.end; targetDate = addDays(targetDate, 1)) {
    const origin = addDays(targetDate, -horizonDays); const targetWeekday = weekday(targetDate); const b7Date = addDays(targetDate, -7);
    if (b7Date > origin) throw new Error('B7 leaks beyond forecast origin.');
    for (let period = 1; period <= 24; period++) {
      const lagDates = [0, 1, 2, 6, 7, 13, 14].map(lag => addDays(origin, -lag)); const levels = lagDates.map(date => at(date, period));
      const rolling7 = Array.from({ length: 7 }, (_, lag) => at(addDays(origin, -lag), period)); const rolling14 = Array.from({ length: 14 }, (_, lag) => at(addDays(origin, -lag), period));
      const target = at(targetDate, period), baselineB7 = at(b7Date, period); if ([...levels, ...rolling7, ...rolling14, target, baselineB7].some(value => value === undefined)) continue;
      const featureDates = Array.from({ length: 15 }, (_, lag) => addDays(origin, -lag)); if (featureDates.some(date => date > origin)) throw new Error('Price feature leakage beyond forecast origin.');
      output.push({ forecastOriginDate: origin, targetDate, horizonDays, period, target: target!, baselineB7: baselineB7!, featureDates, features: [
        ...levels as number[], mean(rolling7 as number[]), mean(rolling14 as number[]), populationStandardDeviation(rolling7 as number[]), populationStandardDeviation(rolling14 as number[]),
        Math.sin(2 * Math.PI * (period - 1) / 24), Math.cos(2 * Math.PI * (period - 1) / 24), Math.sin(2 * Math.PI * targetWeekday / 7), Math.cos(2 * Math.PI * targetWeekday / 7),
      ] });
    }
  }
  return output;
}

export function fitRidge(rows: Sample[], alpha: number): Ridge {
  const dimension = orderedFeatures.length; if (rows.length === 0) throw new Error('No price training samples.');
  const means = Array.from({ length: dimension }, (_, index) => mean(rows.map(row => row.features[index]!))); const standardDeviations = Array.from({ length: dimension }, (_, index) => Math.sqrt(mean(rows.map(row => (row.features[index]! - means[index]!) ** 2))));
  if (standardDeviations.some(value => !finite(value) || value <= 0)) throw new Error('Invalid price training scaler.');
  const targetMean = mean(rows.map(row => row.target)); const matrix = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0)); const vector = Array<number>(dimension).fill(0);
  for (const row of rows) { const features = row.features.map((value, index) => (value - means[index]!) / standardDeviations[index]!); const centeredTarget = row.target - targetMean; for (let left = 0; left < dimension; left++) { vector[left]! += features[left]! * centeredTarget; for (let right = 0; right < dimension; right++) matrix[left]![right]! += features[left]! * features[right]!; } }
  for (let index = 0; index < dimension; index++) matrix[index]![index]! += alpha;
  const lower = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
  for (let row = 0; row < dimension; row++) for (let column = 0; column <= row; column++) { let value = matrix[row]![column]!; for (let index = 0; index < column; index++) value -= lower[row]![index]! * lower[column]![index]!; if (row === column) { if (value <= 0 || !finite(value)) throw new Error('Price Ridge matrix is not positive definite.'); lower[row]![column] = Math.sqrt(value); } else lower[row]![column] = value / lower[column]![column]!; }
  const forward = Array<number>(dimension).fill(0); for (let row = 0; row < dimension; row++) forward[row] = (vector[row]! - Array.from({ length: row }, (_, index) => lower[row]![index]! * forward[index]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  const coefficients = Array<number>(dimension).fill(0); for (let row = dimension - 1; row >= 0; row--) coefficients[row] = (forward[row]! - Array.from({ length: dimension - row - 1 }, (_, offset) => lower[row + offset + 1]![row]! * coefficients[row + offset + 1]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  if (![...means, ...standardDeviations, ...coefficients, targetMean].every(finite)) throw new Error('Non-finite price Ridge artifact.'); return { alpha, coefficients, intercept: targetMean, means, standardDeviations };
}
export function predict(model: Ridge, features: number[]) { return model.intercept + features.reduce((total, value, index) => total + model.coefficients[index]! * ((value - model.means[index]!) / model.standardDeviations[index]!), 0); }

const empty = () => ({ errors: [] as number[], actuals: [] as number[], unavailable: 0 });
function summarize(bucket: ReturnType<typeof empty>, byPeriod: Record<string, Omit<Metrics, 'byPeriod'>>): Metrics { const evaluable = bucket.errors.length, numeratorAbsoluteError = bucket.errors.reduce((total, error) => total + Math.abs(error), 0), denominatorAbsoluteActual = bucket.actuals.reduce((total, actual) => total + Math.abs(actual), 0); return { evaluable, unavailable: bucket.unavailable, MAE: numeratorAbsoluteError / evaluable, RMSE: Math.sqrt(bucket.errors.reduce((total, error) => total + error ** 2, 0) / evaluable), bias: mean(bucket.errors), WAPE: 100 * numeratorAbsoluteError / denominatorAbsoluteActual, numeratorAbsoluteError, denominatorAbsoluteActual, maxAbsoluteError: Math.max(...bucket.errors.map(Math.abs)), byPeriod }; }
export function evaluate(rows: Sample[], calculate: (row: Sample) => number | undefined): Metrics { const overall = empty(), periods = new Map<number, ReturnType<typeof empty>>(); for (const row of rows) { const prediction = calculate(row), bucket = periods.get(row.period) ?? empty(); periods.set(row.period, bucket); if (prediction === undefined || !finite(prediction)) { overall.unavailable++; bucket.unavailable++; continue; } const error = prediction - row.target; overall.errors.push(error); overall.actuals.push(row.target); bucket.errors.push(error); bucket.actuals.push(row.target); } const byPeriod = Object.fromEntries([...periods.entries()].map(([period, bucket]) => [String(period), summarize(bucket, {})])); return summarize(overall, byPeriod); }

export function baselines(train: Sample[]) { const historicalMean = new Map<number, number>(); for (let period = 1; period <= 24; period++) historicalMean.set(period, mean(train.filter(row => row.period === period).map(row => row.target))); return { B1_ORIGIN: (row: Sample) => row.features[0], B7: (row: Sample) => row.baselineB7, HISTORICAL_MEAN: (row: Sample) => historicalMean.get(row.period) }; }

export function experiment(records: PriceRecord[], corpusHash: string) {
  const corpus = verifyCorpus(records), results: Record<string, unknown> = {};
  for (const horizonDays of horizons) {
    const train = samples(records, partitions.train, horizonDays), validation = samples(records, partitions.validation, horizonDays), holdout = samples(records, partitions.externalHoldout, horizonDays); const baselinePredictors = baselines(train);
    const validationBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(validation, calculation)])) as Record<string, Metrics>; const baselineReference = Object.entries(validationBaselines).sort(([leftId, left], [rightId, right]) => left.MAE - right.MAE || left.RMSE - right.RMSE || leftId.localeCompare(rightId))[0]![0];
    const validationRidge = alphas.map(alpha => { const model = fitRidge(train, alpha); return { alpha, model, metrics: evaluate(validation, row => predict(model, row.features)) }; }); const selected = validationRidge.sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha)[0]!;
    const holdoutBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(holdout, calculation)])) as Record<string, Metrics>; const holdoutMetrics = evaluate(holdout, row => predict(selected.model, row.features)); const reference = holdoutBaselines[baselineReference]!;
    const catastrophicThreshold = promotionCriteria.catastrophicErrorMultiplierOfTrainTargetStandardDeviation * sampleStandardDeviation(train.map(row => row.target)); const maeImprovementPercent = 100 * (reference.MAE - holdoutMetrics.MAE) / reference.MAE;
    const technicalCandidate = holdoutMetrics.unavailable === promotionCriteria.unavailableRequired && [...selected.model.coefficients, selected.model.intercept, ...selected.model.means, ...selected.model.standardDeviations, holdoutMetrics.MAE, holdoutMetrics.RMSE, holdoutMetrics.bias, holdoutMetrics.WAPE, holdoutMetrics.maxAbsoluteError].every(finite) && maeImprovementPercent >= promotionCriteria.minimumMaeImprovementPercent && holdoutMetrics.WAPE <= promotionCriteria.maximumWapeMultiplier * reference.WAPE && holdoutMetrics.maxAbsoluteError <= catastrophicThreshold;
    results[String(horizonDays)] = { modelId: `xm-preciobolsnaci-ridge-direct-h${horizonDays}-v1`, modelVersion: '1.0.0-experimental', horizonDays, corpusHash, samples: { train: train.length, validation: validation.length, externalHoldout: holdout.length }, validation: { baselines: validationBaselines, ridge: validationRidge.map(value => ({ alpha: value.alpha, metrics: value.metrics })), selectedAlpha: selected.alpha, baselineReference }, externalHoldout: { baselines: holdoutBaselines, ridge: holdoutMetrics, baselineReference, maeImprovementPercent, catastrophicThreshold }, technicalCandidate, fittedParameters: selected.model, ranges: partitions, promotionCriteria, orderedFeatures, omittedExactRedundancies, originDefinition: 'end-of-calendar-day t; every historical price feature is dated t or earlier', targetDefinition: `precio_cop_kwh(targetDate=t+${horizonDays}, periodo=1..24)` };
  }
  return { experimentId: 'hu-08-price-multihorizon-v1', corpus: { firstDate: corpus.firstDate, lastDate: corpus.lastDate, completeDays: corpus.completeDays, observations: corpus.observations }, partitions, orderedFeatures, omittedExactRedundancies, promotionCriteria, results };
}
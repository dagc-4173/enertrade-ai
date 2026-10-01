import { createHash } from 'node:crypto';

export const horizons = [1, 2, 3, 4, 5, 6, 7] as const;
export const alphas = [0.01, 0.1, 1, 10, 100] as const;
export const orderedFeatures = ['energy_same_period_at_origin', 'energy_same_period_6_days_before_origin', 'energy_period24_at_origin', 'sin_2pi_hour_minus1_over24', 'cos_2pi_hour_minus1_over24'] as const;
export const partitions = {
  train: { start: '2024-10-01', end: '2026-03-31' },
  validation: { start: '2026-04-01', end: '2026-05-31' },
  externalHoldout: { start: '2026-06-01', end: '2026-09-20' },
} as const;

export type GeneRecord = { fecha_xm: string; hora_xm: number; energia_kwh: number };
export type Sample = { forecastOriginDate: string; targetDate: string; horizonDays: number; hour: number; features: number[]; target: number; featureDates: string[] };
export type Metrics = { evaluable: number; unavailable: number; MAE: number; RMSE: number; bias: number; WAPE: number; numeratorAbsoluteErrorKwh: number; denominatorAbsoluteActualKwh: number; maxAbsoluteErrorKwh: number; byPeriod: Record<string, Omit<Metrics, 'byPeriod'>> };
export type Ridge = { alpha: number; coefficients: number[]; intercept: number; means: number[]; standardDeviations: number[] };

const date = (value: Date) => value.toISOString().slice(0, 10);
export function addDays(value: string, days: number) { const current = new Date(`${value}T00:00:00Z`); current.setUTCDate(current.getUTCDate() + days); return date(current); }
const finite = (value: number) => Number.isFinite(value);

export function csv(records: GeneRecord[]) {
  return `fecha_xm,hora_xm,energia_kwh\n${records.map(record => `${record.fecha_xm},${record.hora_xm},${record.energia_kwh}`).join('\n')}\n`;
}

export function parseCsv(value: string): GeneRecord[] {
  const lines = value.trim().split('\n');
  if (lines.shift() !== 'fecha_xm,hora_xm,energia_kwh') throw new Error('Unexpected corpus header.');
  return lines.map(line => {
    const [fecha_xm, hour, energy] = line.split(',');
    if (!fecha_xm || !hour || !energy) throw new Error('Malformed corpus row.');
    return { fecha_xm, hora_xm: Number(hour), energia_kwh: Number(energy) };
  });
}

export function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }

export function verifyCorpus(records: GeneRecord[]) {
  const values = new Map<string, number>(); const days = new Map<string, Set<number>>();
  for (const record of records) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.fecha_xm) || !Number.isInteger(record.hora_xm) || record.hora_xm < 1 || record.hora_xm > 24 || !finite(record.energia_kwh)) throw new Error('Invalid Gene corpus value.');
    const key = `${record.fecha_xm}|${record.hora_xm}`; if (values.has(key)) throw new Error('Duplicate Gene temporal identity.');
    values.set(key, record.energia_kwh); const periods = days.get(record.fecha_xm) ?? new Set<number>(); periods.add(record.hora_xm); days.set(record.fecha_xm, periods);
  }
  const dates = [...days.keys()].sort();
  if (dates.length === 0) throw new Error('Empty Gene corpus.');
  for (let index = 1; index < dates.length; index++) if (addDays(dates[index - 1]!, 1) !== dates[index]) throw new Error('Gene corpus has a missing date.');
  for (const periods of days.values()) if (periods.size !== 24 || Array.from({ length: 24 }, (_, index) => periods.has(index + 1)).some(value => !value)) throw new Error('Gene corpus has an incomplete date.');
  return { values, firstDate: dates[0]!, lastDate: dates.at(-1)!, completeDays: dates.length, observations: records.length };
}

function recordsForRange(records: GeneRecord[], range: { start: string; end: string }) { return records.filter(record => record.fecha_xm >= range.start && record.fecha_xm <= range.end); }

export function samples(records: GeneRecord[], targetRange: { start: string; end: string }, horizonDays: number): Sample[] {
  const { values } = verifyCorpus(records); const result: Sample[] = [];
  for (let targetDate = targetRange.start; targetDate <= targetRange.end; targetDate = addDays(targetDate, 1)) {
    const origin = addDays(targetDate, -horizonDays); const weekly = addDays(origin, -6);
    for (let hour = 1; hour <= 24; hour++) {
      const featureKeys = [`${origin}|${hour}`, `${weekly}|${hour}`, `${origin}|24`]; const targetKey = `${targetDate}|${hour}`;
      const features = featureKeys.map(key => values.get(key)); const target = values.get(targetKey);
      if (features.some(value => value === undefined) || target === undefined) continue;
      const featureDates = [origin, weekly, origin]; if (featureDates.some(featureDate => featureDate > origin)) throw new Error('Feature leakage beyond forecast origin.');
      result.push({ forecastOriginDate: origin, targetDate, horizonDays, hour, features: [...features as number[], Math.sin(2 * Math.PI * (hour - 1) / 24), Math.cos(2 * Math.PI * (hour - 1) / 24)], target, featureDates });
    }
  }
  return result;
}

function mean(values: number[]) { return values.reduce((total, value) => total + value, 0) / values.length; }
function sampleStandardDeviation(values: number[]) { const center = mean(values); return Math.sqrt(values.reduce((total, value) => total + (value - center) ** 2, 0) / (values.length - 1)); }

export function fitRidge(rows: Sample[], alpha: number): Ridge {
  const count = rows.length; const dimension = orderedFeatures.length; if (count === 0) throw new Error('No training samples.');
  const means = Array.from({ length: dimension }, (_, index) => mean(rows.map(row => row.features[index]!)));
  const standardDeviations = Array.from({ length: dimension }, (_, index) => Math.sqrt(mean(rows.map(row => (row.features[index]! - means[index]!) ** 2))));
  if (standardDeviations.some(value => !finite(value) || value <= 0)) throw new Error('Invalid training scaler.');
  const targetMean = mean(rows.map(row => row.target)); const matrix = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0)); const vector = Array<number>(dimension).fill(0);
  for (const row of rows) {
    const x = row.features.map((value, index) => (value - means[index]!) / standardDeviations[index]!); const y = row.target - targetMean;
    for (let left = 0; left < dimension; left++) { vector[left]! += x[left]! * y; for (let right = 0; right < dimension; right++) matrix[left]![right]! += x[left]! * x[right]!; }
  }
  for (let index = 0; index < dimension; index++) matrix[index]![index]! += alpha;
  const lower = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
  for (let row = 0; row < dimension; row++) for (let column = 0; column <= row; column++) {
    let value = matrix[row]![column]!; for (let index = 0; index < column; index++) value -= lower[row]![index]! * lower[column]![index]!;
    if (row === column) { if (value <= 0 || !finite(value)) throw new Error('Ridge matrix is not positive definite.'); lower[row]![column] = Math.sqrt(value); } else lower[row]![column] = value / lower[column]![column]!;
  }
  const forward = Array<number>(dimension).fill(0); for (let row = 0; row < dimension; row++) forward[row] = (vector[row]! - Array.from({ length: row }, (_, index) => lower[row]![index]! * forward[index]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  const coefficients = Array<number>(dimension).fill(0); for (let row = dimension - 1; row >= 0; row--) coefficients[row] = (forward[row]! - Array.from({ length: dimension - row - 1 }, (_, offset) => lower[row + offset + 1]![row]! * coefficients[row + offset + 1]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  const intercept = targetMean - means.reduce((total, value, index) => total + coefficients[index]! * 0, 0);
  if (![...means, ...standardDeviations, ...coefficients, intercept].every(finite)) throw new Error('Non-finite Ridge artifact.');
  return { alpha, coefficients, intercept, means, standardDeviations };
}

export function predict(model: Ridge, features: number[]) { return model.intercept + features.reduce((total, value, index) => total + model.coefficients[index]! * ((value - model.means[index]!) / model.standardDeviations[index]!), 0); }

function emptyMetric() { return { errors: [] as number[], actuals: [] as number[], unavailable: 0 }; }
function summarize(bucket: ReturnType<typeof emptyMetric>, byPeriod: Record<string, Omit<Metrics, 'byPeriod'>>): Metrics {
  const evaluable = bucket.errors.length; const numeratorAbsoluteErrorKwh = bucket.errors.reduce((total, value) => total + Math.abs(value), 0); const denominatorAbsoluteActualKwh = bucket.actuals.reduce((total, value) => total + Math.abs(value), 0);
  return { evaluable, unavailable: bucket.unavailable, MAE: numeratorAbsoluteErrorKwh / evaluable, RMSE: Math.sqrt(bucket.errors.reduce((total, value) => total + value ** 2, 0) / evaluable), bias: mean(bucket.errors), WAPE: 100 * numeratorAbsoluteErrorKwh / denominatorAbsoluteActualKwh, numeratorAbsoluteErrorKwh, denominatorAbsoluteActualKwh, maxAbsoluteErrorKwh: Math.max(...bucket.errors.map(Math.abs)), byPeriod };
}

export function evaluate(rows: Sample[], calculate: (row: Sample) => number | undefined): Metrics {
  const overall = emptyMetric(); const periods = new Map<number, ReturnType<typeof emptyMetric>>();
  for (const row of rows) { const prediction = calculate(row); const bucket = periods.get(row.hour) ?? emptyMetric(); periods.set(row.hour, bucket); if (prediction === undefined || !finite(prediction)) { overall.unavailable++; bucket.unavailable++; continue; } const error = prediction - row.target; overall.errors.push(error); overall.actuals.push(row.target); bucket.errors.push(error); bucket.actuals.push(row.target); }
  const byPeriod = Object.fromEntries([...periods.entries()].map(([period, bucket]) => [String(period), summarize(bucket, {})])); return summarize(overall, byPeriod);
}

export function baselines(train: Sample[]) {
  const frozenMeanByHour = new Map<number, number>(); for (let hour = 1; hour <= 24; hour++) frozenMeanByHour.set(hour, mean(train.filter(row => row.hour === hour).map(row => row.target)));
  return {
    B_ORIGIN_0: (row: Sample) => row.features[0],
    B_ORIGIN_6: (row: Sample) => row.features[1],
    B_HISTORICAL_MEAN: (row: Sample) => frozenMeanByHour.get(row.hour),
  };
}

export function experiment(records: GeneRecord[], corpusHash: string) {
  const corpus = verifyCorpus(records); const all: Record<string, unknown> = {};
  for (const horizonDays of horizons) {
    const train = samples(records, partitions.train, horizonDays), validation = samples(records, partitions.validation, horizonDays), holdoutRows = samples(records, partitions.externalHoldout, horizonDays);
    const baselinePredictors = baselines(train); const validationBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(validation, calculation)])) as Record<string, Metrics>;
    const baselineReference = Object.entries(validationBaselines).sort(([, left], [, right]) => left.MAE - right.MAE)[0]![0];
    const validationRidge = alphas.map(alpha => { const model = fitRidge(train, alpha); return { alpha, model, metrics: evaluate(validation, row => predict(model, row.features)) }; }); const selected = validationRidge.sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.alpha - right.alpha)[0]!;
    const holdoutBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(holdoutRows, calculation)])) as Record<string, Metrics>; const holdoutMetrics = evaluate(holdoutRows, row => predict(selected.model, row.features)); const reference = holdoutBaselines[baselineReference]!;
    const catastrophicThresholdKwh = 10 * sampleStandardDeviation(train.map(row => row.target)); const candidate = holdoutMetrics.unavailable === 0 && [holdoutMetrics.MAE, holdoutMetrics.RMSE, holdoutMetrics.bias, holdoutMetrics.WAPE, holdoutMetrics.maxAbsoluteErrorKwh, ...selected.model.coefficients, selected.model.intercept, ...selected.model.means, ...selected.model.standardDeviations].every(finite) && holdoutMetrics.MAE <= 1.05 * reference.MAE && (holdoutMetrics.MAE < reference.MAE || holdoutMetrics.RMSE < reference.RMSE) && holdoutMetrics.WAPE <= 1.25 * reference.WAPE && holdoutMetrics.maxAbsoluteErrorKwh <= catastrophicThresholdKwh;
    all[String(horizonDays)] = { modelId: `xm-gene-ridge-h${horizonDays}`, horizonDays, corpusHash, samples: { train: train.length, validation: validation.length, externalHoldout: holdoutRows.length }, validation: { baselines: validationBaselines, ridge: validationRidge.map(value => ({ alpha: value.alpha, metrics: value.metrics })), selectedAlpha: selected.alpha, baselineReference }, externalHoldout: { baselines: holdoutBaselines, ridge: holdoutMetrics, catastrophicThresholdKwh }, candidate, artifact: selected.model, ranges: partitions, originDefinition: 'end-of-calendar-day t; features dated t or earlier', targetDefinition: `energia_kwh(targetDate=t+${horizonDays}, hora_xm=1..24)`, orderedFeatures };
  }
  return { corpus: { firstDate: corpus.firstDate, lastDate: corpus.lastDate, completeDays: corpus.completeDays, observations: corpus.observations }, results: all };
}
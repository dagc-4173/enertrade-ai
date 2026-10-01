import { addDays, alphas, evaluate, horizons, partitions, type GeneRecord, type Metrics, type Ridge, type Sample, verifyCorpus } from './hu04-multihorizon';
import { buildDirectSupplyFeatures, directSupplyFeatures } from '@/models/xm-gene-ridge-direct-v2/features';

export const orderedFeaturesV2 = directSupplyFeatures;

export const omittedCandidatesV2 = {
  energySamePeriodMean3d: 'Exact linear combination of origin, origin-1 and origin-2 already present in Ridge.',
  trend1d: 'Exact linear combination energy(t,p)-energy(t-1,p).',
  trend7d: 'Exact linear combination energy(t,p)-energy(t-7,p).',
} as const;

export type SampleV2 = Sample & { featureSources: Record<string, string[]> };
type RidgeV2 = Ridge;

const finite = (value: number) => Number.isFinite(value);
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;

export function samplesV2(records: GeneRecord[], targetRange: { start: string; end: string }, horizonDays: number): SampleV2[] {
  const { values } = verifyCorpus(records); const output: SampleV2[] = [];
  const at = (day: string, hour: number) => values.get(`${day}|${hour}`);
  for (let targetDate = targetRange.start; targetDate <= targetRange.end; targetDate = addDays(targetDate, 1)) {
    const origin = addDays(targetDate, -horizonDays);
    for (let hour = 1; hour <= 24; hour++) {
      const target = at(targetDate, hour), built = buildDirectSupplyFeatures(at, origin, targetDate, hour);
      if (!built || target === undefined) continue;
      output.push({ forecastOriginDate: origin, targetDate, horizonDays, hour, features: built.values, target, featureDates: built.sourceDates, featureSources: built.featureSources });
    }
  }
  return output;
}

export function fitRidgeV2(rows: SampleV2[], alpha: number): RidgeV2 {
  const dimension = orderedFeaturesV2.length; if (rows.length === 0) throw new Error('No V2 training samples.');
  const means = Array.from({ length: dimension }, (_, index) => mean(rows.map(row => row.features[index]!)));
  const standardDeviations = Array.from({ length: dimension }, (_, index) => Math.sqrt(mean(rows.map(row => (row.features[index]! - means[index]!) ** 2))));
  if (standardDeviations.some(value => !finite(value) || value <= 0)) throw new Error('Invalid V2 scaler.');
  const targetMean = mean(rows.map(row => row.target)); const matrix = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0)); const vector = Array<number>(dimension).fill(0);
  for (const row of rows) { const x = row.features.map((value, index) => (value - means[index]!) / standardDeviations[index]!); const y = row.target - targetMean; for (let left = 0; left < dimension; left++) { vector[left]! += x[left]! * y; for (let right = 0; right < dimension; right++) matrix[left]![right]! += x[left]! * x[right]!; } }
  for (let index = 0; index < dimension; index++) matrix[index]![index]! += alpha;
  const lower = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
  for (let row = 0; row < dimension; row++) for (let column = 0; column <= row; column++) { let value = matrix[row]![column]!; for (let index = 0; index < column; index++) value -= lower[row]![index]! * lower[column]![index]!; if (row === column) { if (value <= 0 || !finite(value)) throw new Error('V2 Ridge matrix is not positive definite.'); lower[row]![column] = Math.sqrt(value); } else lower[row]![column] = value / lower[column]![column]!; }
  const forward = Array<number>(dimension).fill(0); for (let row = 0; row < dimension; row++) forward[row] = (vector[row]! - Array.from({ length: row }, (_, index) => lower[row]![index]! * forward[index]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  const coefficients = Array<number>(dimension).fill(0); for (let row = dimension - 1; row >= 0; row--) coefficients[row] = (forward[row]! - Array.from({ length: dimension - row - 1 }, (_, offset) => lower[row + offset + 1]![row]! * coefficients[row + offset + 1]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  if (![...means, ...standardDeviations, ...coefficients, targetMean].every(finite)) throw new Error('Non-finite V2 artifact.');
  return { alpha, coefficients, intercept: targetMean, means, standardDeviations };
}

export function predictV2(model: RidgeV2, features: number[]) { return model.intercept + features.reduce((total, value, index) => total + model.coefficients[index]! * ((value - model.means[index]!) / model.standardDeviations[index]!), 0); }

function baselinesV2(train: SampleV2[]) {
  const historicalMean = new Map<number, number>(); for (let hour = 1; hour <= 24; hour++) historicalMean.set(hour, mean(train.filter(row => row.hour === hour).map(row => row.target)));
  return { B_ORIGIN_0: (row: Sample) => row.features[0], B_ORIGIN_6: (row: Sample) => row.features[1], B_HISTORICAL_MEAN: (row: Sample) => historicalMean.get(row.hour) };
}

const sampleStd = (values: number[]) => { const center = mean(values); return Math.sqrt(values.reduce((total, value) => total + (value - center) ** 2, 0) / (values.length - 1)); };

export function experimentV2(records: GeneRecord[], corpusHash: string) {
  const corpus = verifyCorpus(records); const results: Record<string, unknown> = {};
  for (const horizonDays of horizons) {
    const train = samplesV2(records, partitions.train, horizonDays), validation = samplesV2(records, partitions.validation, horizonDays), holdoutRows = samplesV2(records, partitions.externalHoldout, horizonDays);
    const baselinePredictors = baselinesV2(train); const validationBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(validation, calculation)])) as Record<string, Metrics>;
    const baselineReference = Object.entries(validationBaselines).sort(([, left], [, right]) => left.MAE - right.MAE)[0]![0];
    const validationRidge = alphas.map(alpha => { const model = fitRidgeV2(train, alpha); return { alpha, model, metrics: evaluate(validation, row => predictV2(model, row.features)) }; }); const selected = validationRidge.sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.alpha - right.alpha)[0]!;
    const holdoutBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(holdoutRows, calculation)])) as Record<string, Metrics>; const holdoutMetrics = evaluate(holdoutRows, row => predictV2(selected.model, row.features)); const reference = holdoutBaselines[baselineReference]!;
    const catastrophicThresholdKwh = 10 * sampleStd(train.map(row => row.target)); const finiteValues = [holdoutMetrics.MAE, holdoutMetrics.RMSE, holdoutMetrics.bias, holdoutMetrics.WAPE, holdoutMetrics.maxAbsoluteErrorKwh, ...selected.model.coefficients, selected.model.intercept, ...selected.model.means, ...selected.model.standardDeviations];
    const candidate = holdoutMetrics.unavailable === 0 && finiteValues.every(finite) && holdoutMetrics.MAE <= 1.05 * reference.MAE && (holdoutMetrics.MAE < reference.MAE || holdoutMetrics.RMSE < reference.RMSE) && holdoutMetrics.WAPE <= 1.25 * reference.WAPE && holdoutMetrics.maxAbsoluteErrorKwh <= catastrophicThresholdKwh;
    const coefficientImportance = orderedFeaturesV2.map((feature, index) => ({ feature, standardizedCoefficient: selected.model.coefficients[index]!, absoluteStandardizedCoefficient: Math.abs(selected.model.coefficients[index]!) })).sort((left, right) => right.absoluteStandardizedCoefficient - left.absoluteStandardizedCoefficient);
    results[String(horizonDays)] = { modelId: `xm-gene-ridge-direct-h${horizonDays}-v2`, horizonDays, corpusHash, samples: { train: train.length, validation: validation.length, externalHoldout: holdoutRows.length }, validation: { baselines: validationBaselines, ridge: validationRidge.map(value => ({ alpha: value.alpha, metrics: value.metrics })), selectedAlpha: selected.alpha, baselineReference }, externalHoldout: { baselines: holdoutBaselines, ridge: holdoutMetrics, catastrophicThresholdKwh }, candidate, artifact: selected.model, coefficientImportance, ranges: partitions, orderedFeatures: orderedFeaturesV2, omittedCandidates: omittedCandidatesV2, originDefinition: 'end-of-calendar-day t; every historical source date <= t', targetDefinition: `energia_kwh(targetDate=t+${horizonDays}, hora_xm=1..24)` };
  }
  return { corpus: { firstDate: corpus.firstDate, lastDate: corpus.lastDate, completeDays: corpus.completeDays, observations: corpus.observations }, results };
}
import { addDays, evaluate, fitRidge, predict, type DemandRecord, type Metrics, type Ridge, type Sample } from './hu06-multihorizon';
import { buildV4ContinuousComparator, buildV4Primary, buildV4TargetRelativeAblation, buildV4UsableStatisticsComparator } from './hu06-demand-v4-preregistration';
import { demandEligibilityIndex, isDemandForecastSampleEligible } from '@/services/demand-semantic-eligibility';
import { loadDirectDemandModel } from '@/models/xm-demandasin-ridge-direct-v2/model-loader';

export const v4Builders = {
  A: buildV4Primary,
  B: buildV4ContinuousComparator,
  C: buildV4UsableStatisticsComparator,
  targetRelativeAblation: buildV4TargetRelativeAblation,
} as const;
export type V4Variant = keyof typeof v4Builders;
export type V4Sample = Sample & { usedObservationDates: string[]; usableStatisticDates?: string[]; calendarSpanDays?: number };

export function v4Samples(records: DemandRecord[], range: { start: string; end: string }, horizonDays: number, variant: V4Variant): V4Sample[] {
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6) throw new Error('Unsupported V4 horizon.');
  const eligibility = demandEligibilityIndex(records.map(row => ({ date: row.fecha_xm, value: row.demanda_kwh })));
  const output: V4Sample[] = [];
  for (let targetDate = range.start; targetDate <= range.end; targetDate = addDays(targetDate, 1)) {
    const origin = addDays(targetDate, -horizonDays);
    const built = v4Builders[variant](records, origin, targetDate, horizonDays);
    if (!built || !isDemandForecastSampleEligible({ eligibility, forecastOriginDate: origin, featureDates: built.featureDates, targetDate, requireTarget: true })) continue;
    const target = eligibility.get(targetDate)?.value;
    if (target === undefined || built.featureDates.some(date => date > origin)) throw new Error('V4 sample leakage or missing target.');
    const statistics = 'usableStatisticDates' in built && 'calendarSpanDays' in built && Array.isArray(built.usableStatisticDates) && typeof built.calendarSpanDays === 'number'
      ? { usableStatisticDates: built.usableStatisticDates as string[], calendarSpanDays: built.calendarSpanDays } : {};
    output.push({ forecastOriginDate: origin, targetDate, horizonDays, target, features: built.values, featureDates: built.featureDates,
      usedObservationDates: built.featureDates, ...statistics });
  }
  return output;
}

type Range = { start: string; end: string };
export type V4ExperimentManifest = {
  corpus: { sha256: string; range: Range; observations: number };
  partitions: { train: Range; validation: Range; retrospectiveEvaluation: Range & { virginHoldout: false } };
  selection: { alphaGrid: number[]; baselines: string[]; primaryVariant: 'A' };
  promotionCriteria: { minimumMaeImprovementPercentAgainstSelectedBaseline: number; maximumWapeMultiplierAgainstSelectedBaseline: number; unavailableAttributableToModel: number; requireFiniteMetricsAndParameters: boolean; maxAbsoluteErrorMultiplierOfEligibleTrainTargetSampleStdDev: number; requireNoLeakage: boolean; requireGreaterOperationalCoverageThanV2: boolean; minimumAdditionalConstructibleOriginsAndFutureTargets: number; minimumPairedEligibleTargetDaysPerHorizonForV2Comparison: number; maximumPairedMaeMultiplierOfV2: number; maximumPairedWapeMultiplierOfV2: number; minimumProspectiveCompleteTargetDaysPerHorizonBeforeRuntimeReplacement: number; allConditionsRequired: boolean };
  observedSourceCapacity: { originRange: Range; asOf: string; constructibleOrigins: Record<'A' | 'B' | 'C', string[]> };
  operationalCase: { candidateOrigin: string; targetsByHorizon: Record<string, string>; futureHorizonsAsOfDate: number[] };
};
const finite = (value: number) => Number.isFinite(value);
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const sampleStd = (values: number[]) => { const center = mean(values); return Math.sqrt(values.reduce((total, value) => total + (value - center) ** 2, 0) / (values.length - 1)); };
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

export function v4Baselines(train: V4Sample[], variant: V4Variant, names: string[]) {
  if (JSON.stringify(names) !== JSON.stringify(['B_ORIGIN', 'B_ORIGIN_MINUS_6', 'B_TRAIN_TARGET_WEEKDAY_MEAN'])) throw new Error('Frozen V4 baselines differ.');
  const lagIndex = variant === 'A' || variant === 'targetRelativeAblation' ? 1 : 3;
  const weekdayMeans = new Map(Array.from({ length: 7 }, (_, day) => [day, mean(train.filter(row => weekday(row.targetDate) === day).map(row => row.target))]));
  return {
    B_ORIGIN: (row: Sample) => row.features[0],
    B_ORIGIN_MINUS_6: (row: Sample) => row.features[lagIndex],
    B_TRAIN_TARGET_WEEKDAY_MEAN: (row: Sample) => weekdayMeans.get(weekday(row.targetDate)),
  };
}

export function fitV4Ablation(train: V4Sample[], alpha: number): Ridge {
  const dimension = train[0]?.features.length;
  if (!dimension || train.some(row => row.features.length !== dimension)) throw new Error('Invalid ablation TRAIN features.');
  const means = Array.from({ length: dimension }, (_, index) => mean(train.map(row => row.features[index]!)));
  const standardDeviations = Array.from({ length: dimension }, (_, index) => Math.sqrt(mean(train.map(row => (row.features[index]! - means[index]!) ** 2))));
  if (standardDeviations.some(value => !finite(value) || value <= 0)) throw new Error('Invalid ablation TRAIN scaler.');
  const intercept = mean(train.map(row => row.target));
  const matrix = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
  const vector = Array<number>(dimension).fill(0);
  for (const row of train) {
    const scaled = row.features.map((value, index) => (value - means[index]!) / standardDeviations[index]!);
    for (let left = 0; left < dimension; left++) {
      vector[left]! += scaled[left]! * (row.target - intercept);
      for (let right = 0; right < dimension; right++) matrix[left]![right]! += scaled[left]! * scaled[right]!;
    }
  }
  for (let index = 0; index < dimension; index++) matrix[index]![index]! += alpha;
  const lower = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
  for (let row = 0; row < dimension; row++) for (let column = 0; column <= row; column++) {
    let value = matrix[row]![column]!;
    for (let index = 0; index < column; index++) value -= lower[row]![index]! * lower[column]![index]!;
    lower[row]![column] = row === column ? Math.sqrt(value) : value / lower[column]![column]!;
    if (!finite(lower[row]![column]!) || (row === column && lower[row]![column]! <= 0)) throw new Error('Invalid ablation Ridge matrix.');
  }
  const forward = Array<number>(dimension).fill(0);
  for (let row = 0; row < dimension; row++) forward[row] = (vector[row]! - Array.from({ length: row }, (_, index) => lower[row]![index]! * forward[index]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  const coefficients = Array<number>(dimension).fill(0);
  for (let row = dimension - 1; row >= 0; row--) coefficients[row] = (forward[row]! - Array.from({ length: dimension - row - 1 }, (_, index) => lower[row + index + 1]![row]! * coefficients[row + index + 1]!).reduce((a, b) => a + b, 0)) / lower[row]![row]!;
  if (![...coefficients, intercept].every(finite)) throw new Error('Nonfinite ablation model.');
  return { alpha, coefficients, intercept, means, standardDeviations };
}

export function v4ConstructibleCoverage(records: DemandRecord[], variant: V4Variant, horizonDays: number, range: Range, asOf: string) {
  const origins = [], futureTargets = [] as string[];
  for (let origin = range.start; origin <= range.end; origin = addDays(origin, 1)) {
    const target = addDays(origin, horizonDays);
    if (!v4Builders[variant](records, origin, target, horizonDays)) continue;
    origins.push(origin);
    if (target > asOf) futureTargets.push(target);
  }
  return { constructibleOrigins: origins, constructibleFutureTargets: [...new Set(futureTargets)] };
}

function frozenV2Ridge(horizonDays: number): Ridge {
  const model = loadDirectDemandModel(horizonDays);
  return { alpha: model.alpha, coefficients: model.coefficients, intercept: model.intercept, means: model.scaler.means, standardDeviations: model.scaler.standardDeviations };
}

function fitVariant(train: V4Sample[], alpha: number, variant: V4Variant) {
  if (variant === 'A') return fitRidge(train, alpha);
  return fitV4Ablation(train, alpha);
}

export function experimentDemandV4(records: DemandRecord[], manifest: V4ExperimentManifest) {
  const variants = {} as Record<V4Variant, Record<string, ReturnType<typeof evaluateHorizon>>>;
  for (const variant of Object.keys(v4Builders) as V4Variant[]) {
    const results: Record<string, ReturnType<typeof evaluateHorizon>> = {};
    for (let horizonDays = 1; horizonDays <= 6; horizonDays++) results[String(horizonDays)] = evaluateHorizon(records, manifest, variant, horizonDays);
    variants[variant] = results;
  }
  const paired: Record<string, ReturnType<typeof pairedHorizon>> = {};
  for (let horizonDays = 1; horizonDays <= 6; horizonDays++) paired[String(horizonDays)] = pairedHorizon(records, manifest, horizonDays, variants.A[String(horizonDays)]!, variants.B[String(horizonDays)]!);
  return { variants: { A: variants.A, B: variants.B, C: variants.C }, independentAblation: variants.targetRelativeAblation, paired };
}

function evaluateHorizon(records: DemandRecord[], manifest: V4ExperimentManifest, variant: V4Variant, horizonDays: number) {
  const train = v4Samples(records, manifest.partitions.train, horizonDays, variant);
  const validation = v4Samples(records, manifest.partitions.validation, horizonDays, variant);
  const retrospective = v4Samples(records, manifest.partitions.retrospectiveEvaluation, horizonDays, variant);
  if (train.length < 2 || !validation.length || !retrospective.length) throw new Error(`Insufficient ${variant} h${horizonDays} samples.`);
  const baselineFns = v4Baselines(train, variant, manifest.selection.baselines);
  const validationBaselines = Object.entries(baselineFns).map(([id, calculate]) => ({ id, metrics: evaluate(validation, calculate) }));
  const baselineReference = [...validationBaselines].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.id.localeCompare(right.id))[0]!.id as keyof typeof baselineFns;
  const frozenB = variant === 'B' ? loadDirectDemandModel(horizonDays) : null;
  if (frozenB && frozenB.baselineReference !== baselineReference) throw new Error('Frozen V2 baseline mismatch.');
  const validationGrid = frozenB ? [] : manifest.selection.alphaGrid.map(alpha => { const model = fitVariant(train, alpha, variant); return { alpha, model, metrics: evaluate(validation, row => predict(model, row.features)) }; });
  const selected = frozenB ? { alpha: frozenB.alpha, model: frozenV2Ridge(horizonDays), metrics: evaluate(validation, row => predict(frozenV2Ridge(horizonDays), row.features)) }
    : [...validationGrid].sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha)[0]!;
  if (!selected || !manifest.selection.alphaGrid.includes(selected.alpha)) throw new Error('Invalid V4 alpha selection.');
  const metrics = evaluate(retrospective, row => predict(selected.model, row.features));
  const baselineMetrics = evaluate(retrospective, baselineFns[baselineReference]);
  const catastrophicThresholdKwh = manifest.promotionCriteria.maxAbsoluteErrorMultiplierOfEligibleTrainTargetSampleStdDev * sampleStd(train.map(row => row.target));
  const p = manifest.promotionCriteria;
  const technicalQuality = metrics.unavailable === p.unavailableAttributableToModel &&
    [...selected.model.coefficients, selected.model.intercept, ...selected.model.means, ...selected.model.standardDeviations, metrics.MAE, metrics.RMSE, metrics.bias, metrics.WAPE, metrics.maxAbsoluteErrorKwh].every(finite) &&
    metrics.MAE <= (1 - p.minimumMaeImprovementPercentAgainstSelectedBaseline / 100) * baselineMetrics.MAE &&
    metrics.WAPE <= p.maximumWapeMultiplierAgainstSelectedBaseline * baselineMetrics.WAPE && metrics.maxAbsoluteErrorKwh <= catastrophicThresholdKwh;
  const operational = v4ConstructibleCoverage(records, variant, horizonDays, manifest.observedSourceCapacity.originRange, manifest.observedSourceCapacity.asOf);
  if (variant !== 'targetRelativeAblation' && JSON.stringify(operational.constructibleOrigins) !== JSON.stringify(manifest.observedSourceCapacity.constructibleOrigins[variant])) throw new Error('Preregistered operational capacity mismatch.');
  const cProvenance = variant === 'C' ? {
    train: train.map(row => ({ origin: row.forecastOriginDate, targetDate: row.targetDate, actualSourceDates: row.usableStatisticDates, calendarSpanDays: row.calendarSpanDays })),
    validation: validation.map(row => ({ origin: row.forecastOriginDate, targetDate: row.targetDate, actualSourceDates: row.usableStatisticDates, calendarSpanDays: row.calendarSpanDays })),
    retrospectiveEvaluation: retrospective.map(row => ({ origin: row.forecastOriginDate, targetDate: row.targetDate, actualSourceDates: row.usableStatisticDates, calendarSpanDays: row.calendarSpanDays })),
  } : undefined;
  return {
    modelId: frozenB?.modelId ?? `xm-demandasin-ridge-direct-h${horizonDays}-v4-${variant === 'targetRelativeAblation' ? 'target-relative-ablation' : variant.toLowerCase()}`,
    modelVersion: frozenB?.modelVersion ?? '1.0.0-experimental-offline', horizonDays, variant,
    sampleCounts: { train: train.length, validation: validation.length, retrospectiveEvaluation: retrospective.length },
    selection: { alphaGrid: manifest.selection.alphaGrid, validationAlphaGrid: validationGrid.map(value => ({ alpha: value.alpha, metrics: value.metrics })), selectedAlpha: selected.alpha, validationSelectedMetrics: selected.metrics, validationBaselines, baselineReference, frozenComparator: Boolean(frozenB) },
    fittedParameters: frozenB ? null : selected.model, frozenModelReference: frozenB ? { modelId: frozenB.modelId, modelVersion: frozenB.modelVersion, corpusHash: frozenB.corpusHash } : null,
    predictiveQuality: { retrospectiveEvaluation: metrics, selectedBaseline: baselineMetrics, catastrophicThresholdKwh, technicalQuality },
    operationalCoverage: { eligibleSamples: { train: train.length, validation: validation.length, retrospectiveEvaluation: retrospective.length }, ...operational },
    ...(cProvenance ? { usableStatisticProvenance: cProvenance } : {}),
  };
}

function pairedHorizon(records: DemandRecord[], manifest: V4ExperimentManifest, horizonDays: number, a: ReturnType<typeof evaluateHorizon>, b: ReturnType<typeof evaluateHorizon>) {
  const aRows = v4Samples(records, manifest.partitions.retrospectiveEvaluation, horizonDays, 'A');
  const bRows = new Map(v4Samples(records, manifest.partitions.retrospectiveEvaluation, horizonDays, 'B').map(row => [`${row.forecastOriginDate}|${row.targetDate}`, row]));
  const pairedA = aRows.filter(row => bRows.has(`${row.forecastOriginDate}|${row.targetDate}`));
  const pairedB = pairedA.map(row => bRows.get(`${row.forecastOriginDate}|${row.targetDate}`)!);
  if (!a.fittedParameters) throw new Error('Missing A model.');
  const A = evaluate(pairedA, row => predict(a.fittedParameters!, row.features));
  const B = evaluate(pairedB, row => predict(frozenV2Ridge(horizonDays), row.features));
  const criteria = manifest.promotionCriteria;
  const pairedQuality = pairedA.length >= criteria.minimumPairedEligibleTargetDaysPerHorizonForV2Comparison &&
    A.MAE <= criteria.maximumPairedMaeMultiplierOfV2 * B.MAE && A.WAPE <= criteria.maximumPairedWapeMultiplierOfV2 * B.WAPE;
  const addedOrigins = a.operationalCoverage.constructibleOrigins.filter(origin => !b.operationalCoverage.constructibleOrigins.includes(origin));
  const addedFutureTargets = a.operationalCoverage.constructibleFutureTargets.filter(target => !b.operationalCoverage.constructibleFutureTargets.includes(target));
  const greaterCoverage = addedOrigins.length >= criteria.minimumAdditionalConstructibleOriginsAndFutureTargets && addedFutureTargets.length >= criteria.minimumAdditionalConstructibleOriginsAndFutureTargets;
  const technicalReplacementConditions = a.predictiveQuality.technicalQuality && pairedQuality && greaterCoverage;
  return { horizonDays, pairedTargetDays: pairedA.length, MAE_A_paired: A.MAE, MAE_V2_paired: B.MAE, WAPE_A_paired: A.WAPE, WAPE_V2_paired: B.WAPE,
    coverage_A: a.operationalCoverage, coverage_V2: b.operationalCoverage, addedOrigins, addedFutureTargets, pairedQuality, greaterCoverage, technicalReplacementConditions,
    prospectiveCompleteTargetDays: 0, replacementCandidate: technicalReplacementConditions && 0 >= criteria.minimumProspectiveCompleteTargetDaysPerHorizonBeforeRuntimeReplacement };
}
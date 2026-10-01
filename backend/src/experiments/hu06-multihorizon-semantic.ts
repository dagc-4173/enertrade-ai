import { demandEligibilityIndex, isDemandForecastSampleEligible } from '@/services/demand-semantic-eligibility';
import { addDays, alphas, baselines, evaluate, fitRidge, horizons, orderedFeatures, partitions, predict, promotionCriteria, verifyCorpus, type DemandRecord, type Metrics, type Sample } from './hu06-multihorizon';
import { baselinesV2, fitRidgeV2, omittedCandidatesV2, orderedFeaturesV2, predictV2, samplesV2, type SampleV2 } from './hu06-multihorizon-v2';
import { samples } from './hu06-multihorizon';

export const semanticPartitions = {
  train: partitions.train,
  validation: partitions.validation,
  retrospectiveEvaluation: partitions.externalHoldout,
} as const;

const finite = (value: number) => Number.isFinite(value);
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const sampleStandardDeviation = (values: number[]) => { const center = mean(values); return Math.sqrt(values.reduce((total, value) => total + (value - center) ** 2, 0) / (values.length - 1)); };

export function eligibleDemandSamples<T extends Sample>(rows: T[], eligibility: ReturnType<typeof demandEligibilityIndex>) {
  return rows.filter(row => isDemandForecastSampleEligible({ eligibility, forecastOriginDate: row.forecastOriginDate, featureDates: row.featureDates, targetDate: row.targetDate, requireTarget: true }));
}

function selectBaseline(values: Record<string, Metrics>) {
  return Object.entries(values).sort(([leftId, left], [rightId, right]) => left.MAE - right.MAE || left.RMSE - right.RMSE || leftId.localeCompare(rightId))[0]![0];
}

function technicalDecision(train: Sample[], ridge: Metrics, reference: Metrics, modelValues: number[]) {
  const catastrophicThresholdKwh = promotionCriteria.catastrophicErrorMultiplierOfTrainTargetStandardDeviation * sampleStandardDeviation(train.map(row => row.target));
  const maeImprovementPercent = 100 * (reference.MAE - ridge.MAE) / reference.MAE;
  const technicalCandidate = ridge.unavailable === promotionCriteria.unavailableRequired &&
    [...modelValues, ridge.MAE, ridge.RMSE, ridge.bias, ridge.WAPE, ridge.maxAbsoluteErrorKwh].every(finite) &&
    maeImprovementPercent >= promotionCriteria.minimumMaeImprovementPercent &&
    ridge.WAPE <= promotionCriteria.maximumWapeMultiplier * reference.WAPE &&
    ridge.maxAbsoluteErrorKwh <= catastrophicThresholdKwh;
  return { catastrophicThresholdKwh, maeImprovementPercent, technicalCandidate };
}

export function semanticExperimentV1(records: DemandRecord[], corpusHash: string) {
  const corpus = verifyCorpus(records); const eligibility = demandEligibilityIndex(records.map(record => ({ date: record.fecha_xm, value: record.demanda_kwh }))); const results: Record<string, unknown> = {};
  for (const horizonDays of horizons) {
    const train = eligibleDemandSamples(samples(records, semanticPartitions.train, horizonDays), eligibility);
    const validation = eligibleDemandSamples(samples(records, semanticPartitions.validation, horizonDays), eligibility);
    const retrospective = eligibleDemandSamples(samples(records, semanticPartitions.retrospectiveEvaluation, horizonDays), eligibility);
    const baselinePredictors = baselines(train);
    const validationBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(validation, calculation)])) as Record<string, Metrics>;
    const baselineReference = selectBaseline(validationBaselines);
    const validationRidge = alphas.map(alpha => { const model = fitRidge(train, alpha); return { alpha, model, metrics: evaluate(validation, row => predict(model, row.features)) }; });
    const selected = validationRidge.sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha)[0]!;
    const retrospectiveBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(retrospective, calculation)])) as Record<string, Metrics>;
    const retrospectiveMetrics = evaluate(retrospective, row => predict(selected.model, row.features)); const reference = retrospectiveBaselines[baselineReference]!;
    const decision = technicalDecision(train, retrospectiveMetrics, reference, [...selected.model.coefficients, selected.model.intercept, ...selected.model.means, ...selected.model.standardDeviations]);
    results[String(horizonDays)] = {
      modelId: `xm-demandasin-ridge-direct-h${horizonDays}-v1`, protocolVersion: 'v3-semantic', horizonDays, corpusHash,
      samples: { train: train.length, validation: validation.length, retrospectiveEvaluation: retrospective.length },
      validation: { baselines: validationBaselines, ridge: validationRidge.map(value => ({ alpha: value.alpha, metrics: value.metrics })), selectedAlpha: selected.alpha, baselineReference },
      retrospectiveEvaluation: { baselines: retrospectiveBaselines, ridge: retrospectiveMetrics, baselineReference, ...decision },
      technicalCandidate: decision.technicalCandidate, fittedParameters: selected.model, ranges: semanticPartitions, promotionCriteria, orderedFeatures,
      originDefinition: 'end-of-calendar-day t; semantic eligibility required for origin, all inputs and target', targetDefinition: `demanda_kwh(targetDate=t+${horizonDays})`,
    };
  }
  return { experimentId: 'hu-06-multihorizon-v3-semantic-v1', evaluationType: 'retrospective_technical_reevaluation', corpus: { firstDate: corpus.firstDate, lastDate: corpus.lastDate, observations: corpus.observations, sha256: corpusHash }, partitions: semanticPartitions, orderedFeatures, promotionCriteria, results };
}

export function semanticExperimentV2(records: DemandRecord[], corpusHash: string) {
  const corpus = verifyCorpus(records); const eligibility = demandEligibilityIndex(records.map(record => ({ date: record.fecha_xm, value: record.demanda_kwh }))); const results: Record<string, unknown> = {};
  for (const horizonDays of horizons) {
    const train = eligibleDemandSamples(samplesV2(records, semanticPartitions.train, horizonDays), eligibility);
    const validation = eligibleDemandSamples(samplesV2(records, semanticPartitions.validation, horizonDays), eligibility);
    const retrospective = eligibleDemandSamples(samplesV2(records, semanticPartitions.retrospectiveEvaluation, horizonDays), eligibility);
    const baselinePredictors = baselinesV2(train);
    const validationBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(validation, calculation)])) as Record<string, Metrics>;
    const baselineReference = selectBaseline(validationBaselines);
    const validationRidge = alphas.map(alpha => { const model = fitRidgeV2(train, alpha); return { alpha, model, metrics: evaluate(validation, row => predictV2(model, row.features)) }; });
    const selected = validationRidge.sort((left, right) => left.metrics.MAE - right.metrics.MAE || left.metrics.RMSE - right.metrics.RMSE || left.alpha - right.alpha)[0]!;
    const retrospectiveBaselines = Object.fromEntries(Object.entries(baselinePredictors).map(([id, calculation]) => [id, evaluate(retrospective, calculation)])) as Record<string, Metrics>;
    const retrospectiveMetrics = evaluate(retrospective, row => predictV2(selected.model, row.features)); const reference = retrospectiveBaselines[baselineReference]!;
    const decision = technicalDecision(train, retrospectiveMetrics, reference, [...selected.model.coefficients, selected.model.intercept, ...selected.model.means, ...selected.model.standardDeviations]);
    results[String(horizonDays)] = {
      modelId: `xm-demandasin-ridge-direct-h${horizonDays}-v2`, protocolVersion: 'v3-semantic', horizonDays, corpusHash,
      samples: { train: train.length, validation: validation.length, retrospectiveEvaluation: retrospective.length },
      validation: { baselines: validationBaselines, ridge: validationRidge.map(value => ({ alpha: value.alpha, metrics: value.metrics })), selectedAlpha: selected.alpha, baselineReference },
      retrospectiveEvaluation: { baselines: retrospectiveBaselines, ridge: retrospectiveMetrics, baselineReference, ...decision },
      technicalCandidate: decision.technicalCandidate, fittedParameters: selected.model, ranges: semanticPartitions, promotionCriteria, orderedFeatures: orderedFeaturesV2, omittedCandidates: omittedCandidatesV2,
      originDefinition: 'end-of-calendar-day t; semantic eligibility required for origin, every lag, every rolling member and target', targetDefinition: `demanda_kwh(targetDate=t+${horizonDays})`,
    };
  }
  return { experimentId: 'hu-06-multihorizon-v3-semantic-v2', evaluationType: 'retrospective_technical_reevaluation', corpus: { firstDate: corpus.firstDate, lastDate: corpus.lastDate, observations: corpus.observations, sha256: corpusHash }, partitions: semanticPartitions, orderedFeatures: orderedFeaturesV2, omittedCandidates: omittedCandidatesV2, promotionCriteria, results };
}
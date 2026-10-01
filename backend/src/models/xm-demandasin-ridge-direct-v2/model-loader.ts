import { readFileSync } from 'node:fs';
import { orderedFeaturesV2 } from '@/experiments/hu06-multihorizon-v2';
import { demandSemanticRule } from '@/services/demand-semantic-eligibility';
import { ForecastError } from '@/services/forecast.contract';

export type DirectDemandModel = {
  modelId: string; modelVersion: '1.0.0-experimental'; modelFamily: 'ridge_direct_demand_v2_semantic';
  status: 'experimental'; academicValidation: 'pending'; horizonDays: number; orderedFeatures: string[];
  scaler: { ddof: 0; means: number[]; standardDeviations: number[] }; coefficients: number[]; intercept: number; alpha: number;
  corpusHash: string; trainingRange: { start: string; end: string }; validationRange: { start: string; end: string };
  retrospectiveEvaluationRange: { start: string; end: string }; evaluationType: 'retrospective_technical';
  semanticEligibilityRule: typeof demandSemanticRule; baselineReference: string;
  metrics: { validation: DemandMetric; retrospectiveEvaluation: DemandMetric };
};
type DemandMetric = { evaluable: number; unavailable: number; MAE: number; RMSE: number; bias: number; WAPE: number };
type Result = { modelId: string; horizonDays: number; technicalCandidate: boolean; corpusHash: string; orderedFeatures: string[]; fittedParameters: { alpha: number; means: number[]; standardDeviations: number[]; coefficients: number[]; intercept: number }; ranges: { train: DirectDemandModel['trainingRange']; validation: DirectDemandModel['validationRange']; retrospectiveEvaluation: DirectDemandModel['retrospectiveEvaluationRange'] }; validation: { selectedAlpha: number; baselineReference: string; ridge: { alpha: number; metrics: DemandMetric }[] }; retrospectiveEvaluation: { ridge: DemandMetric } };
type Evidence = { corpus: { sha256: string }; evaluationType: string; semanticPolicy: typeof demandSemanticRule; v2: { orderedFeatures: string[]; results: Record<string, Result> } };
const hash = '18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735';
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const freeze = <T>(value: T): T => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

export function validateDirectDemandModel(value: unknown, horizonDays: number, result: Result | undefined, evidence: Evidence): DirectDemandModel {
  const bad = (): never => { throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); };
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6 || !result || !evidence || evidence.corpus.sha256 !== hash || evidence.evaluationType !== 'retrospective_technical_reevaluation' || !equal(evidence.semanticPolicy, demandSemanticRule) || !equal(evidence.v2.orderedFeatures, orderedFeaturesV2)) return bad();
  const params = result.fittedParameters;
  if (!params || result.technicalCandidate !== true || result.horizonDays !== horizonDays || result.corpusHash !== hash || result.modelId !== `xm-demandasin-ridge-direct-h${horizonDays}-v2` || !equal(result.orderedFeatures, orderedFeaturesV2) || result.validation.selectedAlpha !== params.alpha) return bad();
  const expected: DirectDemandModel = {
    modelId: result.modelId, modelVersion: '1.0.0-experimental', modelFamily: 'ridge_direct_demand_v2_semantic', status: 'experimental', academicValidation: 'pending', horizonDays, orderedFeatures: [...orderedFeaturesV2],
    scaler: { ddof: 0, means: params.means, standardDeviations: params.standardDeviations }, coefficients: params.coefficients, intercept: params.intercept, alpha: params.alpha,
    corpusHash: hash, trainingRange: result.ranges.train, validationRange: result.ranges.validation, retrospectiveEvaluationRange: result.ranges.retrospectiveEvaluation,
    evaluationType: 'retrospective_technical', semanticEligibilityRule: demandSemanticRule, baselineReference: result.validation.baselineReference,
    metrics: { validation: result.validation.ridge.find(row => row.alpha === params.alpha)!.metrics, retrospectiveEvaluation: result.retrospectiveEvaluation.ridge },
  };
  if (!value || !equal(value, expected) || !Array.isArray(params.coefficients) || !Array.isArray(params.means) || !Array.isArray(params.standardDeviations) || [params.coefficients, params.means, params.standardDeviations].some(vector => vector.length !== orderedFeaturesV2.length || vector.some(item => typeof item !== 'number' || !Number.isFinite(item))) || params.standardDeviations.some(item => item <= 0) || !Number.isFinite(params.intercept) || !Number.isFinite(params.alpha) || !expected.metrics.validation || ![expected.metrics.validation, expected.metrics.retrospectiveEvaluation].every(metric => metric && metric.evaluable > 0 && metric.unavailable === 0 && [metric.MAE, metric.RMSE, metric.bias, metric.WAPE].every(Number.isFinite))) return bad();
  return freeze(structuredClone(expected));
}

export function createDirectDemandModelLoader(readModel: (horizonDays: number) => string, readEvidence: () => string) {
  let evidence: Evidence | undefined; const cache = new Map<number, DirectDemandModel>();
  return (horizonDays: number) => {
    if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
    const cached = cache.get(horizonDays); if (cached) return cached;
    try {
      evidence ??= JSON.parse(readEvidence()) as Evidence;
      const result = evidence.v2.results[String(horizonDays)];
      const model = validateDirectDemandModel(JSON.parse(readModel(horizonDays)), horizonDays, result, evidence);
      cache.set(horizonDays, model); return model;
    } catch (error) { if (error instanceof ForecastError) throw error; throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); }
  };
}

export const loadDirectDemandModel = createDirectDemandModelLoader(
  horizonDays => readFileSync(new URL(`../xm-demandasin-ridge-direct-h${horizonDays}-v2/1.0.0/model.json`, import.meta.url), 'utf8'),
  () => readFileSync(new URL('../../../../docs/evidencias/hu-06-multihorizon-v3-semantic/results.json', import.meta.url), 'utf8'),
);
import { loadEvaluation } from '@/models/xm-gene-ridge/evaluation-loader';
import { loadModel as loadGeneModel, type ForecastModel as GeneModel } from '@/models/xm-gene-ridge/model-loader';
import { loadModel as loadDemandModel, type ForecastModel as DemandModel } from '@/models/xm-demandasin-ridge/model-loader';
import { loadRule, type PriceRule } from '@/models/xm-preciobolsnaci-b1/rule-loader';
import { ForecastError } from './forecast.contract';
import type { PredictiveArtifactMetadata, PredictiveArtifactMetrics, PredictiveArtifactSummary } from './model-catalog.contract';

type Loaders = {
  geneModel: () => GeneModel;
  geneEvaluation: typeof loadEvaluation;
  demandModel: () => DemandModel;
  priceRule: () => PriceRule;
};

const defaultLoaders: Loaders = { geneModel: loadGeneModel, geneEvaluation: loadEvaluation, demandModel: loadDemandModel, priceRule: loadRule };

function ridgeParameters(model: GeneModel | DemandModel) {
  return { alpha: model.alpha, intercept: model.intercept, coefficients: model.coefficients, scaler: model.scaler };
}

function range(start: string, end: string) { return { start, end }; }

function metadata(loaders: Loaders = defaultLoaders): PredictiveArtifactMetadata[] {
  const gene = loaders.geneModel();
  const demand = loaders.demandModel();
  const price = loaders.priceRule();
  const [geneHoldoutStart, geneHoldoutEnd] = gene.evaluationSummary.holdoutRange;
  if (!geneHoldoutStart || !geneHoldoutEnd) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
  return [
    {
      id: gene.modelId, version: gene.modelVersion, kind: 'model', type: gene.modelType, target: gene.target, unit: gene.unit,
      forecastType: gene.forecastType, horizon: { value: gene.horizonPeriods, unit: 'periods' },
      data: { source: 'XM', profile: gene.compatibleProfile, ruleset: gene.compatibleRuleset, trainingRange: gene.trainingSourceRange, effectiveTrainingRange: gene.effectiveTrainingRange, externalHoldoutRange: range(geneHoldoutStart, geneHoldoutEnd) },
      method: { equation: 'y_hat = beta0 + sum(beta_j * ((x_j - mu_j) / sigma_j))', features: gene.orderedFeatures, parameters: ridgeParameters(gene) },
      quality: { metricsAvailable: true },
      limitations: ['Generación agregada XM; no diferenciada por tecnología.', 'No representa oferta transaccional real.'],
      lifecycle: { activeInRuntime: true, promoted: true, academicValidation: 'pending' },
    },
    {
      id: demand.modelId, version: demand.modelVersion, kind: 'model', type: demand.modelType, target: demand.target, unit: demand.unit,
      forecastType: demand.forecastType, horizon: { value: demand.horizonDays, unit: 'days' },
      data: { source: 'XM', profile: demand.compatibleProfile, ruleset: demand.compatibleRuleset, trainingRange: demand.trainingSourceRange, effectiveTrainingRange: demand.effectiveTrainingRange, externalHoldoutRange: demand.externalHoldoutRange },
      method: { equation: 'y_hat = beta0 + sum(beta_j * ((x_j - mu_j) / sigma_j))', features: demand.orderedFeatures, parameters: ridgeParameters(demand) },
      quality: { metricsAvailable: true, confidenceStatus: demand.confidence.status },
      limitations: ['Demanda agregada del SIN.', 'No zonal.', 'No personalizada.', 'No usa temperatura.', 'No usa precio.', 'No usa meteorologia.', 'Confidence no definido.'],
      lifecycle: { activeInRuntime: true, promoted: true, academicValidation: 'pending' },
    },
    {
      id: price.ruleId, version: price.ruleVersion, kind: 'rule', type: price.type, target: price.target, unit: price.unit,
      forecastType: price.forecastType, horizon: { value: price.horizonDays, unit: 'days' },
      data: { source: 'XM', profile: `${price.sourceProfileId}@${price.sourceProfileVersion}`, ruleset: `${price.sourceRulesetId}@${price.sourceRulesetVersion}`, trainingRange: range(price.corpusRange.startDate, price.corpusRange.endDate), externalHoldoutRange: range(price.evaluation.externalHoldout.range.startDate, price.evaluation.externalHoldout.range.endDate) },
      method: { equation: 'P_hat(D,p) = P(D-1,p)', features: [], parameters: { formula: price.formula, granularity: price.granularity } },
      quality: { metricsAvailable: true },
      limitations: price.limitations,
      lifecycle: { activeInRuntime: true, promoted: price.passed, academicValidation: 'pending' },
    },
  ];
}

function metric(value: number, unit: string) { return { value, unit }; }

function metrics(id: string, version: string, loaders: Loaders = defaultLoaders): PredictiveArtifactMetrics {
  if (id === 'xm-gene-ridge') {
    const evaluation = loaders.geneEvaluation();
    return { id, version, evaluationType: evaluation.evaluationType, range: evaluation.evaluationRange, evaluable: evaluation.evaluable, unavailable: evaluation.unavailable, metrics: { MAE: metric(evaluation.metrics.MAE.value, evaluation.metrics.MAE.unit), RMSE: metric(evaluation.metrics.RMSE.value, evaluation.metrics.RMSE.unit), bias: metric(evaluation.metrics.bias.value, evaluation.metrics.bias.unit), WAPE: metric(evaluation.metrics.WAPE.value, evaluation.metrics.WAPE.unit) } };
  }
  if (id === 'xm-demandasin-ridge') {
    const model = loaders.demandModel();
    const evaluation = model.evaluationSummary;
    const stored = evaluation.metrics.Ridge;
    return { id, version, evaluationType: evaluation.type, range: evaluation.range, evaluable: stored.evaluable, unavailable: stored.unavailable, metrics: { MAE: metric(stored.MAE, model.unit), RMSE: metric(stored.RMSE, model.unit), bias: metric(stored.bias, model.unit), WAPE: metric(stored.WAPE.value, stored.WAPE.unit) } };
  }
  const rule = loaders.priceRule();
  const evaluation = rule.evaluation.externalHoldout;
  const stored = evaluation.metrics;
  return { id, version, evaluationType: 'external_holdout', range: range(evaluation.range.startDate, evaluation.range.endDate), evaluable: stored.evaluable, unavailable: stored.unavailable, metrics: { MAE: metric(stored.MAE, rule.unit), RMSE: metric(stored.RMSE, rule.unit), bias: metric(stored.bias, rule.unit), WAPE: metric(stored.WAPE, stored.WAPEUnit) } };
}

export function createModelCatalogService(loaders: Loaders = defaultLoaders) {
  return {
    list(): PredictiveArtifactSummary[] {
      return metadata(loaders).map(({ id, version, kind, type, target, unit, forecastType, lifecycle }) => ({ id, version, kind, type, target, unit, forecastType, activeInRuntime: lifecycle.activeInRuntime }));
    },
    get(id: string) { return metadata(loaders).find(artifact => artifact.id === id); },
    metrics(id: string, version: string) { return metrics(id, version, loaders); },
  };
}

export const modelCatalogService = createModelCatalogService();
import { loadHourlyRidge } from '@/models/hourly-ridge/model-loader';
import { loadDirectSupplyModel } from '@/models/xm-gene-ridge-direct-v2/model-loader';
import { loadDirectDemandV5Model } from '@/models/xm-demandasin-ridge-direct-v5/model-loader';
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
  supplyDirect: typeof loadDirectSupplyModel;
  demandDirect: typeof loadDirectDemandV5Model;
};

const defaultLoaders: Loaders = { geneModel: loadGeneModel, geneEvaluation: loadEvaluation, demandModel: loadDemandModel, priceRule: loadRule, supplyDirect: loadDirectSupplyModel, demandDirect: loadDirectDemandV5Model };

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
    ...directMetadata(loaders),
    ...hourlyMetadata(),
    {
      id: gene.modelId, version: gene.modelVersion, kind: 'model', type: gene.modelType, target: gene.target, unit: gene.unit,
      forecastType: gene.forecastType, horizon: { value: gene.horizonPeriods, unit: 'periods' },
      data: { source: 'XM', profile: gene.compatibleProfile, ruleset: gene.compatibleRuleset, trainingRange: gene.trainingSourceRange, effectiveTrainingRange: gene.effectiveTrainingRange, externalHoldoutRange: range(geneHoldoutStart, geneHoldoutEnd) },
      method: { equation: 'y_hat = beta0 + sum(beta_j * ((x_j - mu_j) / sigma_j))', features: gene.orderedFeatures, parameters: ridgeParameters(gene) },
      quality: { metricsAvailable: true },
      limitations: ['Generación agregada XM; no diferenciada por tecnología.', 'No representa oferta transaccional real.'],
      lifecycle: { activeInRuntime: false, promoted: true, academicValidation: 'pending' },
    },
    {
      id: demand.modelId, version: demand.modelVersion, kind: 'model', type: demand.modelType, target: demand.target, unit: demand.unit,
      forecastType: demand.forecastType, horizon: { value: demand.horizonDays, unit: 'days' },
      data: { source: 'XM', profile: demand.compatibleProfile, ruleset: demand.compatibleRuleset, trainingRange: demand.trainingSourceRange, effectiveTrainingRange: demand.effectiveTrainingRange, externalHoldoutRange: demand.externalHoldoutRange },
      method: { equation: 'y_hat = beta0 + sum(beta_j * ((x_j - mu_j) / sigma_j))', features: demand.orderedFeatures, parameters: ridgeParameters(demand) },
      quality: { metricsAvailable: true, confidenceStatus: demand.confidence.status },
      limitations: ['Demanda agregada del SIN.', 'No zonal.', 'No personalizada.', 'No usa temperatura.', 'No usa precio.', 'No usa meteorologia.', 'Confidence no definido.'],
      lifecycle: { activeInRuntime: false, promoted: true, academicValidation: 'pending' },
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

function directMetadata(loaders: Loaders): PredictiveArtifactMetadata[] {
  return [
    ...Array.from({ length: 7 }, (_, i) => {
      const m = loaders.supplyDirect(i + 1);
      return { id: m.modelId, version: m.modelVersion, kind: 'model' as const, type: 'ridge', target: 'energia_kwh', unit: 'kWh', forecastType: 'generation_availability_proxy',
        horizon: { value: m.horizonDays, unit: 'days' as const },
        data: { source: 'XM Gene/Sistema', profile: 'xm_gene_preparacion_base@1.0.0', ruleset: 'xm_gene_base@1.0.0', trainingRange: m.trainingRange, externalHoldoutRange: m.externalHoldoutRange },
        method: { equation: 'y_hat = beta0 + sum(beta_j * ((x_j - mu_j) / sigma_j))', features: m.orderedFeatures, parameters: { alpha: m.hyperparameters.alpha, intercept: m.intercept, coefficients: m.coefficients, scaler: m.scaler } },
        quality: { metricsAvailable: true, confidenceStatus: 'not_defined' },
        limitations: ['Generación agregada como aproximación de oferta; no representa disponibilidad individual.', '24 periodos del día objetivo. Modelo directo específico por horizonte.', 'Experimental; validación académica pendiente.'],
        lifecycle: { activeInRuntime: true, promoted: false, academicValidation: 'pending' as const } };
    }),
    ...Array.from({ length: 6 }, (_, i) => {
      const m = loaders.demandDirect(i + 1);
      return { id: m.modelId, version: m.modelVersion, kind: 'model' as const, type: 'ridge', target: 'demanda_kwh', unit: 'kWh', forecastType: 'aggregate_demand_proxy',
        horizon: { value: m.horizonDays, unit: 'days' as const },
        data: { source: 'XM DemaSIN/Sistema', profile: 'xm_demandasin_preparacion_base@1.0.0', ruleset: 'xm_demandasin_base@1.0.0', trainingRange: m.trainingRange },
        method: { equation: 'y_hat = beta0 + sum(beta_j * ((x_j - mu_j) / sigma_j))', features: m.orderedFeatures, parameters: { alpha: m.selectedAlpha, intercept: m.intercept, coefficients: m.coefficients, scaler: m.scaler } },
        quality: { metricsAvailable: true, confidenceStatus: 'not_defined' },
        limitations: ['Demanda diaria agregada; no equivale a DemaReal horaria.', 'pendingProspectiveValidation: las métricas disponibles corresponden a VALIDATION técnica.', 'Sin demanda individual, zonal ni intervalo probabilístico calibrado.'],
        lifecycle: { activeInRuntime: true, promoted: false, academicValidation: 'pending' as const } };
    }),
  ];
}

function hourlyMetadata(): PredictiveArtifactMetadata[] {
  return (['demand', 'price'] as const).flatMap(series => (series === 'demand' ? [1,2,3,4,5,6,7] : [4,5,6]).map(h => {
    const m = loadHourlyRidge(series, h);
    return { id: m.modelId, version: m.modelVersion, kind: 'model' as const, type: 'ridge', target: series === 'price' ? 'precio_cop_kwh' : 'demanda_real_kwh', unit: series === 'price' ? 'COP/kWh' : 'kWh', forecastType: `experimental_hourly_system_${series}`,
      horizon: { value: h, unit: 'days' as const }, data: { source: series === 'price' ? 'XM PrecBolsNaci/Sistema' : 'XM DemaReal/Sistema' },
      method: { equation: 'y_hat = beta0 + sum(beta_j * ((x_j - mu_j) / sigma_j))', features: m.orderedFeatures, parameters: { coefficients: m.coefficients, intercept: m.intercept, means: m.means, scales: m.scales, featureSchema: series === 'price' ? 'price_v1_origin_15' : 'origin_28d_17_v1' } },
      quality: { metricsAvailable: true, confidenceStatus: 'not_defined' }, limitations: [series === 'price' ? 'Precio de referencia; solo h4/h5/h6.' : 'DemaReal horario; no equivale a DemaSIN diario.', 'Experimental; validación prospectiva y académica pendientes.'],
      lifecycle: { activeInRuntime: true, promoted: false, academicValidation: 'pending' as const } };
  }));
}

function metric(value: number, unit: string) { return { value, unit }; }

function metrics(id: string, version: string, loaders: Loaders = defaultLoaders): PredictiveArtifactMetrics {
  const hourlyDemand = /^xm-demareal-ridge-direct-h([1-7])-v1$/.exec(id), hourlyPrice = /^xm-preciobolsnaci-ridge-direct-h([456])-v1$/.exec(id);
  if (hourlyDemand || hourlyPrice) {
    const m = loadHourlyRidge(hourlyDemand ? 'demand' : 'price', Number((hourlyDemand ?? hourlyPrice)![1])), e = m.metrics;
    if (version !== m.modelVersion) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
    const unit = hourlyDemand ? 'kWh' : 'COP/kWh';
    return { id, version, evaluationType: e.evaluationType, range: e.range, evaluable: e.n, unavailable: 0, metrics: { MAE: metric(e.MAE, unit), RMSE: metric(e.RMSE, unit), bias: metric(e.bias, unit), WAPE: metric(e.WAPE_percent, 'percent') } };
  }

  const supply = /^xm-gene-ridge-direct-h([1-7])-v2$/.exec(id), demand = /^xm-demandasin-ridge-direct-h([1-6])-v5$/.exec(id);
  if (supply || demand) {
    const h = Number((supply ?? demand)![1]);
    const m = supply ? loaders.supplyDirect(h) : loaders.demandDirect(h);
    if (m.modelId !== id || m.modelVersion !== version) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
    const e = supply ? (m as ReturnType<typeof loadDirectSupplyModel>).metrics.externalHoldout : (m as ReturnType<typeof loadDirectDemandV5Model>).validationMetrics;
    const range = supply ? (m as ReturnType<typeof loadDirectSupplyModel>).externalHoldoutRange : (m as ReturnType<typeof loadDirectDemandV5Model>).validationRange;
    return { id, version, evaluationType: supply ? 'external_temporal_holdout' : 'validation_technical', range, evaluable: e.evaluable, unavailable: e.unavailable,
      metrics: { MAE: metric(e.MAE, 'kWh'), RMSE: metric(e.RMSE, 'kWh'), bias: metric(e.bias, 'kWh'), WAPE: metric(e.WAPE, 'percent') } };
  }

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

export function createModelCatalogService(overrides: Partial<Loaders> = {}) {
  const loaders = { ...defaultLoaders, ...overrides };
  return {
    list(): PredictiveArtifactSummary[] {
      return metadata(loaders).map(({ id, version, kind, type, target, unit, forecastType, lifecycle }) => ({ id, version, kind, type, target, unit, forecastType, activeInRuntime: lifecycle.activeInRuntime }));
    },
    get(id: string) { return metadata(loaders).find(artifact => artifact.id === id); },
    metrics(id: string, version: string) { return metrics(id, version, loaders); },
  };
}

export const modelCatalogService = createModelCatalogService();
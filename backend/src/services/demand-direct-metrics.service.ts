import { loadDirectDemandModel } from '@/models/xm-demandasin-ridge-direct-v2/model-loader';
import { ForecastError } from './forecast.contract';

export function getDirectDemandMetrics(horizonDays: number) {
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6) throw new ForecastError(422, 'FORECAST_HORIZON_NOT_SUPPORTED', 'Los modelos experimentales de Demanda admiten hasta 6 días de horizonte.');
  const model = loadDirectDemandModel(horizonDays), evaluation = model.metrics.retrospectiveEvaluation;
  return {
    status: 'available', modelId: model.modelId, modelVersion: model.modelVersion, active: true,
    modelStatus: model.status, academicValidation: model.academicValidation,
    forecastType: 'aggregate_demand_proxy', target: 'demanda_kwh', unit: 'kWh', horizonDays: model.horizonDays,
    evaluationType: model.evaluationType, baselineReference: model.baselineReference,
    training: { trainedAt: null, trainedAtStatus: 'not_recorded', snapshotSha256: model.corpusHash, sourceRange: model.trainingRange, effectiveRange: model.trainingRange },
    validationRange: model.validationRange, retrospectiveEvaluationRange: model.retrospectiveEvaluationRange,
    evaluation: { type: 'retrospective_technical', range: model.retrospectiveEvaluationRange, snapshotSha256: model.corpusHash, evaluable: evaluation.evaluable, unavailable: evaluation.unavailable,
      MAE: { value: evaluation.MAE, unit: 'kWh' }, RMSE: { value: evaluation.RMSE, unit: 'kWh' }, bias: { value: evaluation.bias, unit: 'kWh' }, percentageError: { metric: 'WAPE', value: evaluation.WAPE, unit: 'percent' } },
    scope: { aggregation: 'SIN', personalized: false, zonalFallback: false, confidenceStatus: 'not_defined' },
  };
}
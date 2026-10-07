import { loadDirectDemandV5Model } from '@/models/xm-demandasin-ridge-direct-v5/model-loader';
import { ForecastError } from './forecast.contract';

export function getDemandV5Metrics(horizonDays: number) {
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6) throw new ForecastError(422, 'FORECAST_HORIZON_NOT_SUPPORTED', 'Los modelos experimentales de Demanda admiten hasta 6 días de horizonte.');
  const model = loadDirectDemandV5Model(horizonDays), metrics = model.validationMetrics;
  return {
    status: 'available' as const, modelId: model.modelId, modelVersion: model.modelVersion, active: true as const,
    modelStatus: model.modelStatus, academicValidation: model.academicValidation, modelState: model.state,
    forecastType: 'aggregate_demand_proxy' as const, target: 'demanda_kwh' as const, unit: 'kWh' as const, horizonDays: model.horizonDays,
    evaluationType: 'validation_technical' as const, baselineReference: model.baselineReference,
    training: { trainedAt: null, trainedAtStatus: 'not_recorded' as const, snapshotSha256: model.corpusHash, sourceRange: model.trainingRange, effectiveRange: model.trainingRange },
    validationRange: model.validationRange,
    evaluation: { type: 'validation_technical' as const, range: model.validationRange, snapshotSha256: model.corpusHash,
      evaluable: metrics.evaluable, unavailable: metrics.unavailable, MAE: { value: metrics.MAE, unit: 'kWh' as const },
      RMSE: { value: metrics.RMSE, unit: 'kWh' as const }, bias: { value: metrics.bias, unit: 'kWh' as const },
      percentageError: { metric: 'WAPE' as const, value: metrics.WAPE, unit: 'percent' as const },
      maxAbsoluteError: { value: metrics.maxAbsoluteErrorKwh, unit: 'kWh' as const } },
    scope: { aggregation: 'SIN' as const, personalized: false as const, zonalFallback: false as const, confidenceStatus: 'not_defined' as const },
  };
}
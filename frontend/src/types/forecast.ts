export interface ForecastRequest { preparedDatasetId: number; targetDate: string }

interface ForecastBase extends ForecastRequest {
  status: 'available'
  sourceDatasetId: number
}

export interface SupplyForecast extends ForecastBase {
  forecastType: 'generation_availability_proxy'
  target: 'energia_kwh'
  unit: 'kWh'
  horizonPeriods: 24
  modelId: string
  modelVersion: string
  predictions: { hora_xm: number; energia_kwh: number }[]
}

export interface DemandForecast extends ForecastBase {
  forecastType: 'aggregate_demand_proxy'
  target: 'demanda_kwh'
  unit: 'kWh'
  horizonDays: 1
  modelId: string
  modelVersion: string
  prediction: { demanda_kwh: number }
  confidence: null
  confidenceStatus: 'not_defined'
}

export interface PriceForecast extends ForecastBase {
  forecastType: 'market_reference_price'
  target: 'precio_cop_kwh'
  unit: 'COP/kWh'
  granularity: 'hourly'
  horizonDays: 1
  rule: { id: string; version: string; type: 'deterministic_baseline'; description: string }
  predictions: { periodo: number; precio_cop_kwh: number }[]
  factors: { used: string[]; omitted: string[] }
  scope: { referencePrice: true; personalized: false; financialSettlement: false; commercialNegotiation: false }
  trace: { executionId: string | null; persistence: 'persisted' | 'failed'; conditionsCompleteness?: 'partial' }
}

export interface DateRange { start: string; end: string }
interface ModelMetricsBase {
  status: 'available'
  modelId: string
  modelVersion: string
  active: true
  unit: 'kWh'
  training: {
    trainedAt: null
    trainedAtStatus: 'not_recorded'
    snapshotSha256: string
    sourceRange: DateRange
    effectiveRange: DateRange
  }
  evaluation: {
    type: 'external_temporal_holdout'
    range: DateRange
    snapshotSha256: string
    evaluable: number
    unavailable: number
    MAE: { value: number; unit: 'kWh' }
    RMSE: { value: number; unit: 'kWh' }
    bias: { value: number; unit: 'kWh' }
    percentageError: { metric: 'WAPE'; value: number; unit: 'percent' }
  }
}
export interface SupplyMetrics extends ModelMetricsBase {
  forecastType: 'generation_availability_proxy'
  target: 'energia_kwh'
  horizonPeriods: 24
}
export interface DemandMetrics extends ModelMetricsBase {
  forecastType: 'aggregate_demand_proxy'
  target: 'demanda_kwh'
  horizonDays: 1
  training: ModelMetricsBase['training'] & { effectiveRows: number }
  scope: { aggregation: 'SIN'; personalized: false; zonalFallback: false; confidenceStatus: 'not_defined' }
}
export type ModelMetrics = SupplyMetrics | DemandMetrics
export type ForecastResult = SupplyForecast | DemandForecast | PriceForecast

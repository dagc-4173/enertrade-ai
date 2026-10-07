import { ApiError, apiRequest, postJson } from './apiClient'
import type { ForecastRequest, SupplyForecastRequest, SupplyForecast, DemandForecast, PriceForecast, SupplyMetrics, DemandMetrics } from '../types/forecast'

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const count = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v) && v >= 0
const id = (v: unknown): v is number => count(v) && v > 0
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text)
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)
function date(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v.startsWith('0000')) return false
  const time = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === v
}
const range = (v: unknown) => object(v) && date(v.start) && date(v.end) && v.start <= v.end
const identity = (v: Record<string, unknown>) => text(v.modelId) && text(v.modelVersion)
function base(v: unknown, request: ForecastRequest): v is Record<string, unknown> {
  return object(v) && v.status === 'available' && id(v.preparedDatasetId) && v.preparedDatasetId === request.preparedDatasetId &&
    id(v.sourceDatasetId) && date(v.targetDate) && v.targetDate === request.targetDate
}
function periods(v: unknown, period: string, value: string) {
  return Array.isArray(v) && v.length === 24 && v.every((row: unknown, i) => object(row) && row[period] === i + 1 && finite(row[value]))
}
const sourceArtifacts = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(a => object(a) && id(a.preparedDatasetId) && id(a.sourceDatasetId))
function supply(v: unknown, request: SupplyForecastRequest): v is SupplyForecast {
  return object(v) && v.status === 'available' && date(v.targetDate) && v.targetDate === request.targetDate && date(v.forecastOriginDate) && count(v.horizonDays) && v.horizonDays >= 1 && v.horizonDays <= 7 && sourceArtifacts(v.sourceArtifacts) &&
    identity(v) && v.forecastType === 'generation_availability_proxy' && v.target === 'energia_kwh' &&
    v.unit === 'kWh' && v.horizonPeriods === 24 && v.modelStatus === 'experimental' && v.academicValidation === 'pending' && periods(v.predictions, 'hora_xm', 'energia_kwh')
}
function demand(v: unknown, request: SupplyForecastRequest): v is DemandForecast {
  return object(v) && v.status === 'available' && date(v.targetDate) && v.targetDate === request.targetDate && date(v.forecastOriginDate) && sourceArtifacts(v.sourceArtifacts) && identity(v) && v.modelStatus === 'experimental' && v.academicValidation === 'pending' && v.forecastType === 'aggregate_demand_proxy' && v.target === 'demanda_kwh' &&
    v.unit === 'kWh' && count(v.horizonDays) && v.horizonDays >= 1 && v.horizonDays <= 6 && v.forecastOriginDate < v.targetDate && (Date.parse(`${v.targetDate}T00:00:00Z`) - Date.parse(`${v.forecastOriginDate}T00:00:00Z`)) / 86_400_000 === v.horizonDays && object(v.prediction) && finite(v.prediction.demanda_kwh) &&
    v.confidence === null && v.confidenceStatus === 'not_defined'
}
function price(v: unknown, request: ForecastRequest): v is PriceForecast {
  if (!base(v, request) || v.forecastType !== 'market_reference_price' || v.target !== 'precio_cop_kwh' || v.unit !== 'COP/kWh' ||
    v.granularity !== 'hourly' || v.horizonDays !== 1 || !object(v.rule) || !text(v.rule.id) || !text(v.rule.version) ||
    v.rule.type !== 'deterministic_baseline' || !text(v.rule.description) || !periods(v.predictions, 'periodo', 'precio_cop_kwh') ||
    !object(v.factors) || !strings(v.factors.used) || !strings(v.factors.omitted) || !object(v.scope) || v.scope.referencePrice !== true ||
    v.scope.personalized !== false || v.scope.financialSettlement !== false || v.scope.commercialNegotiation !== false || !object(v.trace)) return false
  return v.trace.persistence === 'persisted'
    ? uuid(v.trace.executionId) && v.trace.conditionsCompleteness === 'partial'
    : v.trace.persistence === 'failed' && (v.trace.executionId === null || uuid(v.trace.executionId)) &&
      (v.trace.conditionsCompleteness === undefined || v.trace.conditionsCompleteness === 'partial')
}
function metrics(v: unknown): v is Record<string, unknown> {
  if (!object(v) || v.status !== 'available' || !identity(v) || v.active !== true || v.unit !== 'kWh' || !object(v.training) || !object(v.evaluation)) return false
  const t = v.training, e = v.evaluation
  const measure = (x: unknown, nonnegative: boolean) => object(x) && finite(x.value) && (!nonnegative || x.value >= 0) && x.unit === 'kWh'
  return t.trainedAt === null && t.trainedAtStatus === 'not_recorded' && hash(t.snapshotSha256) && range(t.sourceRange) && range(t.effectiveRange) &&
    (e.type === 'external_temporal_holdout' || e.type === 'retrospective_technical' || e.type === 'validation_technical') && range(e.range) && hash(e.snapshotSha256) && count(e.evaluable) && count(e.unavailable) &&
    measure(e.MAE, true) && measure(e.RMSE, true) && measure(e.bias, false) && object(e.percentageError) &&
    e.percentageError.metric === 'WAPE' && finite(e.percentageError.value) && e.percentageError.value >= 0 && e.percentageError.unit === 'percent'
}
function supplyMetrics(v: unknown): v is SupplyMetrics {
  return metrics(v) && object(v.evaluation) && v.evaluation.type === 'external_temporal_holdout' && v.forecastType === 'generation_availability_proxy' && v.target === 'energia_kwh' && v.horizonPeriods === 24 && count(v.horizonDays) && v.horizonDays >= 1 && v.horizonDays <= 7 && v.modelStatus === 'experimental' && v.academicValidation === 'pending' && ['B_ORIGIN_0','B_ORIGIN_6','B_HISTORICAL_MEAN'].includes(v.baselineReference as string)
}
function demandMetrics(v: unknown): v is DemandMetrics {
  if (!metrics(v) || !object(v.evaluation) || v.modelStatus !== 'experimental' || v.academicValidation !== 'pending' ||
      !range(v.validationRange) || !text(v.baselineReference) || v.forecastType !== 'aggregate_demand_proxy' || v.target !== 'demanda_kwh' ||
      !count(v.horizonDays) || v.horizonDays < 1 || v.horizonDays > 6 || !object(v.scope) || v.scope.aggregation !== 'SIN' ||
      v.scope.personalized !== false || v.scope.zonalFallback !== false || v.scope.confidenceStatus !== 'not_defined') return false
  if (v.evaluationType === 'validation_technical') return v.evaluation.type === 'validation_technical' && v.modelState === 'pendingProspectiveValidation' &&
    v.modelId === `xm-demandasin-ridge-direct-h${v.horizonDays}-v5` && v.modelVersion === 'hu06-demand-v5-c-primary@1.0.0' &&
    JSON.stringify(v.evaluation.range) === JSON.stringify(v.validationRange) && object(v.evaluation.maxAbsoluteError) &&
    finite(v.evaluation.maxAbsoluteError.value) && v.evaluation.maxAbsoluteError.value >= 0 && v.evaluation.maxAbsoluteError.unit === 'kWh'
  return v.modelVersion !== 'hu06-demand-v5-c-primary@1.0.0' && !String(v.modelId).endsWith('-v5') && v.evaluationType === 'retrospective_technical' && v.evaluation.type === 'retrospective_technical' &&
    range(v.retrospectiveEvaluationRange) && JSON.stringify(v.evaluation.range) === JSON.stringify(v.retrospectiveEvaluationRange)
}
function parsed<T>(response: { status: number; data: unknown }, check: (v: unknown) => v is T): T {
  if (response.status !== 200 || !check(response.data)) throw new ApiError('response', 'La API devolvió un pronóstico o unas métricas con formato inesperado.', response.status)
  return response.data
}
export async function forecastSupply(request: SupplyForecastRequest, signal?: AbortSignal) {
  return parsed(await postJson<unknown>('/forecasts/supply', request, { signal }), (v): v is SupplyForecast => supply(v, request))
}
export async function forecastDemand(request: SupplyForecastRequest, signal?: AbortSignal) {
  return parsed(await postJson<unknown>('/forecasts/demand', request, { signal }), (v): v is DemandForecast => demand(v, request))
}
export async function forecastPrice(request: ForecastRequest, signal?: AbortSignal) {
  return parsed(await postJson<unknown>('/forecasts/price', request, { signal }), (v): v is PriceForecast => price(v, request))
}
export async function getSupplyMetrics(horizonDays: number, signal?: AbortSignal) {
  return parsed(await apiRequest<unknown>(`/forecasts/supply/metrics?horizonDays=${horizonDays}`, { signal }), supplyMetrics)
}
export async function getDemandMetrics(horizonDays: number, signal?: AbortSignal) {
  return parsed(await apiRequest<unknown>(`/forecasts/demand/metrics?horizonDays=${horizonDays}`, { signal }), (value): value is DemandMetrics => demandMetrics(value) && value.horizonDays === horizonDays)
}

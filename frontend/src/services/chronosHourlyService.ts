import { apiRequest, postJson, ApiError } from './apiClient'
export type HourlySeries = 'demand' | 'supply' | 'price'
export type HourlyModel = 'chronos2' | 'bolt'
export type HistoricalMetrics = { range: { start: string; end: string }; MAE: number; RMSE: number; WAPE_percent: number; coverageQ10Q90: number }
export type HourlyModelInfo = { key: HourlyModel; name: string; modelId: string; revision: string; configured: boolean; historicalMetrics: HistoricalMetrics | null }
export type HourlyForecast = {
  series?: HourlySeries; unit?: string; model: HourlyModel; modelId: string; modelVersion: string; targetDate: string; latestObservedDate: string;
  horizonDays: number; generatedPeriods: number; bridgePeriods: number; generatedAt: string;
  predictions: { periodo: number; q10: number; q50: number; q90: number }[];
  historicalMetrics: HistoricalMetrics | null; warnings: string[]; trace: { executionId: string }
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
const model = (v: unknown): v is HourlyModel => v === 'chronos2' || v === 'bolt'
const historical = (v: unknown): v is HistoricalMetrics => object(v) && object(v.range) && date(v.range.start) && date(v.range.end) && finite(v.MAE) && finite(v.RMSE) && finite(v.WAPE_percent) && finite(v.coverageQ10Q90)
export function parseHourlyModels(value: unknown, series: HourlySeries = 'demand'): HourlyModelInfo[] {
  if (!object(value) || !Array.isArray(value.models) || value.models.length !== 2 || !value.models.every(v => object(v) && model(v.key) && typeof v.name === 'string' && typeof v.modelId === 'string' && typeof v.revision === 'string' && typeof v.configured === 'boolean' && (series === 'demand' ? historical(v.historicalMetrics) : v.series === series && v.unit === (series === 'price' ? 'COP/kWh' : 'kWh') && v.historicalMetrics === null)) || new Set(value.models.map(v => v.key)).size !== 2) throw new ApiError('response', 'No se pudo interpretar el catálogo de demanda horaria.')
  return value.models as HourlyModelInfo[]
}
export function parseHourlyForecast(v: unknown, requested: { model: HourlyModel; targetDate: string }, series: HourlySeries = 'demand'): HourlyForecast {
  if (!object(v) || v.status !== 'available' || v.model !== requested.model || v.targetDate !== requested.targetDate || v.forecastType !== `experimental_hourly_system_${series}` || (series !== 'demand' && v.series !== series) || v.unit !== (series === 'price' ? 'COP/kWh' : 'kWh') || typeof v.modelId !== 'string' || typeof v.modelVersion !== 'string' || !date(v.targetDate) || !date(v.latestObservedDate) || !finite(v.horizonDays) || !Number.isInteger(v.horizonDays) || v.horizonDays < 1 || v.horizonDays > 7 || v.generatedPeriods !== v.horizonDays * 24 || v.bridgePeriods !== v.generatedPeriods - 24 || (Date.parse(v.targetDate) - Date.parse(v.latestObservedDate)) / 86400000 !== v.horizonDays || typeof v.generatedAt !== 'string' || !Number.isFinite(Date.parse(v.generatedAt)) || !(series === 'demand' ? historical(v.historicalMetrics) : v.historicalMetrics === null) || !Array.isArray(v.warnings) || !v.warnings.every(x => typeof x === 'string') || !object(v.trace) || typeof v.trace.executionId !== 'string' || !Array.isArray(v.predictions) || v.predictions.length !== 24 || !v.predictions.every((q, i) => object(q) && q.periodo === i + 1 && finite(q.q10) && finite(q.q50) && finite(q.q90) && q.q10 <= q.q50 && q.q50 <= q.q90)) throw new ApiError('response', 'El pronóstico horario no cumple el contrato esperado.')
  return v as unknown as HourlyForecast
}
export async function getHourlyModels(signal?: AbortSignal, series: HourlySeries = 'demand') {
  const { data } = await apiRequest(`/forecasts/hourly-${series}/models`, { credentials: 'include', signal })
  return parseHourlyModels(data, series)
}
export async function forecastHourlyDemand(input: { model: HourlyModel; targetDate: string }, signal?: AbortSignal, series: HourlySeries = 'demand') {
  const { data } = await postJson(`/forecasts/hourly-${series}`, input, { credentials: 'include', signal })
  return parseHourlyForecast(data, input, series)
}

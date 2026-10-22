import { ApiError, apiRequest, postJson } from './apiClient'
export type RidgeSeries = 'demand' | 'price'
export type RidgeAvailability = { series: RidgeSeries; origin: string | null; supportedHorizons: number[]; eligibleTargetDates: string[] }
export type RidgeHourlyResult = { status: 'available'; method: 'ridge'; series: RidgeSeries; source: string; target: string; unit: string; modelId: string; modelVersion: string; artifactSha256: string; targetDate: string; latestObservedDate: string; horizonDays: number; generatedAt: string;
  predictions: { periodo: number; value: number }[]; referenceDay: { date: string; values: { periodo: number; value: number }[] };
  historicalMetrics: { MAE: number; RMSE: number; WAPE_percent: number; n: number; horizonDays: number; evaluationType: string; range: { start: string; end: string } }; warnings: string[]; trace: { executionId: string } }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
const rows = (v: unknown) => Array.isArray(v) && v.length === 24 && v.every((r, i) => object(r) && r.periodo === i + 1 && finite(r.value))
export function parseRidgeAvailability(v: unknown, series: RidgeSeries): RidgeAvailability {
  if (!object(v) || v.series !== series || !(v.origin === null || date(v.origin)) || !Array.isArray(v.supportedHorizons) || !v.supportedHorizons.every(h => Number.isInteger(h) && (series === 'price' ? [4, 5, 6].includes(h) : h >= 1 && h <= 7)) || !Array.isArray(v.eligibleTargetDates) || !v.eligibleTargetDates.every(date)) throw new ApiError('response', 'Disponibilidad Ridge inválida.')
  return v as unknown as RidgeAvailability
}
export function parseRidgeHourly(v: unknown, series: RidgeSeries, targetDate: string): RidgeHourlyResult {
  if (!object(v) || v.status !== 'available' || v.method !== 'ridge' || v.series !== series || v.targetDate !== targetDate || !date(v.targetDate) || !date(v.latestObservedDate) || v.unit !== (series === 'price' ? 'COP/kWh' : 'kWh') || !finite(v.horizonDays) || !Number.isInteger(v.horizonDays) || !(series === 'price' ? [4, 5, 6].includes(v.horizonDays) : v.horizonDays >= 1 && v.horizonDays <= 7) || (Date.parse(v.targetDate) - Date.parse(v.latestObservedDate)) / 86400000 !== v.horizonDays || typeof v.modelId !== 'string' || v.modelId !== `xm-${series === 'price' ? 'preciobolsnaci' : 'demareal'}-ridge-direct-h${v.horizonDays}-v1` || v.modelVersion !== '1.0.0-experimental' || typeof v.artifactSha256 !== 'string' || !rows(v.predictions) || !object(v.referenceDay) || v.referenceDay.date !== v.latestObservedDate || !rows(v.referenceDay.values) || !object(v.historicalMetrics) || !finite(v.historicalMetrics.MAE) || !finite(v.historicalMetrics.RMSE) || !finite(v.historicalMetrics.WAPE_percent) || v.historicalMetrics.horizonDays !== v.horizonDays || v.historicalMetrics.evaluationType !== (series === 'price' ? 'external_temporal_holdout' : 'validation_technical') || !object(v.historicalMetrics.range) || !date(v.historicalMetrics.range.start) || !date(v.historicalMetrics.range.end) || !Array.isArray(v.warnings) || !v.warnings.every(w => typeof w === 'string') || !object(v.trace) || typeof v.trace.executionId !== 'string') throw new ApiError('response', 'El pronóstico Ridge horario no cumple el contrato.')
  return v as unknown as RidgeHourlyResult
}
export async function getRidgeAvailability(series: RidgeSeries, signal?: AbortSignal) {
  const { data } = await apiRequest(`/forecasts/hourly-ridge/${series}/availability`, { credentials: 'include', signal })
  return parseRidgeAvailability(data, series)
}
export async function forecastHourlyRidge(series: RidgeSeries, targetDate: string, signal?: AbortSignal) {
  const { data } = await postJson(`/forecasts/hourly-ridge/${series}`, { targetDate }, { credentials: 'include', signal })
  return parseRidgeHourly(data, series, targetDate)
}

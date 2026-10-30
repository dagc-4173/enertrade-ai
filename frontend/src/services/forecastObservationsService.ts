import { ApiError, apiRequest } from './apiClient'
export type ObservationSeries = 'supply' | 'demand' | 'price' | 'daily'
export type ForecastObservations = { series: ObservationSeries; date: string; source: string; unit: string; status: 'pending' | 'unavailable' | 'available'; checkedAt: string | null; points: { period: number; value: number }[] }
export function parseForecastObservations(value: unknown, series: ObservationSeries, date: string): ForecastObservations {
  const v = value as ForecastObservations | null
  if (!v || v.series !== series || v.date !== date || v.unit !== (series === 'price' ? 'COP/kWh' : 'kWh') || v.source !== `XM ${{ supply: 'Gene', demand: 'DemaReal', price: 'PrecBolsNaci', daily: 'DemaSIN' }[series]}/Sistema` || !['pending', 'unavailable', 'available'].includes(v.status) || !Array.isArray(v.points) || (v.status === 'pending' ? v.checkedAt !== null : typeof v.checkedAt !== 'string' || !Number.isFinite(Date.parse(v.checkedAt))) || (v.status !== 'available' ? v.points.length !== 0 : v.points.length !== (series === 'daily' ? 1 : 24) || v.points.some((p, i) => !p || p.period !== i + 1 || typeof p.value !== 'number' || !Number.isFinite(p.value) || (series !== 'price' && p.value < 0)))) throw new ApiError('response', 'Las observaciones recibidas no corresponden a la fecha y variable del pronóstico.')
  return v
}
export async function getForecastObservations(series: ObservationSeries, date: string, signal?: AbortSignal) {
  const { data } = await apiRequest(`/energy-series/forecast-observations?series=${series}&date=${encodeURIComponent(date)}`, { credentials: 'include', signal })
  return parseForecastObservations(data, series, date)
}

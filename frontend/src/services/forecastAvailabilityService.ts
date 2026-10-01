import { ApiError, apiRequest } from './apiClient'
import type { ForecastAvailability, ForecastSeries } from '../types/forecastAvailability'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
const series: readonly ForecastSeries[] = ['Gene', 'DemaSIN', 'PrecBolsNaci']

export function parseForecastAvailability(value: unknown): ForecastAvailability[] {
  if (!object(value) || !Array.isArray(value.availability) || value.availability.length !== series.length ||
    !value.availability.every(item => object(item) && series.includes(item.series as ForecastSeries) && date(item.currentDate) && date(item.latestObservationDate) && date(item.latestReceivedDate) && date(item.latestIndividuallyUsableDate) && item.latestObservationDate === item.latestIndividuallyUsableDate && item.latestIndividuallyUsableDate <= item.latestReceivedDate && Array.isArray(item.semanticExcludedDates) && item.semanticExcludedDates.every(date) && new Set(item.semanticExcludedDates).size === item.semanticExcludedDates.length && Array.isArray(item.eligibleFutureTargetDates) && item.eligibleFutureTargetDates.every(target => date(target) && target > String(item.currentDate)) && new Set(item.eligibleFutureTargetDates).size === item.eligibleFutureTargetDates.length && date(item.nextForecastDate) && date(item.modelMinTargetDate) && date(item.modelMaxTargetDate) &&
      (item.effectiveFutureMinDate === null || date(item.effectiveFutureMinDate)) && (item.effectiveFutureMaxDate === null || date(item.effectiveFutureMaxDate)) && item.nextForecastDate > item.latestObservationDate && (item.supportedHorizonDays === 1 || item.supportedHorizonDays === 7) &&
      item.supportedHorizonDays === (item.series === 'Gene' ? 7 : 1) && typeof item.hasFutureForecastWindow === 'boolean' && item.hasFutureForecastWindow === (item.eligibleFutureTargetDates.length > 0) && item.effectiveFutureMinDate === (item.eligibleFutureTargetDates[0] ?? null) && item.effectiveFutureMaxDate === (item.eligibleFutureTargetDates.at(-1) ?? null) && typeof item.dataFreshnessDays === 'number' && Number.isSafeInteger(item.dataFreshnessDays) && item.dataFreshnessDays >= 0) ||
    new Set(value.availability.map(item => (item as { series: string }).series)).size !== series.length) {
    throw new ApiError('response', 'La API devolvió disponibilidad de pronóstico con formato inesperado.')
  }
  return value.availability as ForecastAvailability[]
}

export async function getForecastAvailability(signal?: AbortSignal) {
  const response = await apiRequest<unknown>('/forecast-availability', { credentials: 'include', signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió disponibilidad de pronóstico con estado inesperado.', response.status)
  return parseForecastAvailability(response.data)
}
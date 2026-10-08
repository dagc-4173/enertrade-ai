import { ApiError, apiRequest } from './apiClient'
import type { ForecastAvailability, ForecastSeries } from '../types/forecastAvailability'
import { addCalendarDays } from '../utils/forecastAvailability'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
const series: readonly ForecastSeries[] = ['Gene', 'DemaSIN', 'PrecBolsNaci']

function futureContract(item: Record<string, unknown>): boolean {
  const horizon = item.series === 'Gene' ? 7 : item.series === 'DemaSIN' ? 6 : 1
  if (!date(item.currentDate) || !Array.isArray(item.eligibleFutureTargetDates)) return false
  const candidates = Array.from({ length: horizon }, (_, index) => addCalendarDays(item.currentDate as string, index + 1))
  if (!item.eligibleFutureTargetDates.every(target => candidates.includes(target))) return false
  if (item.eligiblePreparedDatasetIds !== undefined && (item.series !== 'PrecBolsNaci' ||
    !Array.isArray(item.eligiblePreparedDatasetIds) || !item.eligiblePreparedDatasetIds.every(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647) ||
    new Set(item.eligiblePreparedDatasetIds).size !== item.eligiblePreparedDatasetIds.length ||
    (item.eligiblePreparedDatasetIds.length > 0) !== (item.eligibleFutureTargetDates.length > 0))) return false
  if (['modelMaxHorizonDays', 'productMaxHorizonDays', 'candidateFutureTargetDates', 'availabilityReason'].every(key => item[key] === undefined)) return true
  return item.modelMaxHorizonDays === horizon && item.productMaxHorizonDays === 7 &&
    Array.isArray(item.candidateFutureTargetDates) && item.candidateFutureTargetDates.length === candidates.length &&
    item.candidateFutureTargetDates.every((target, index) => target === candidates[index]) &&
    ['AVAILABLE', 'SOURCE_DATA_STALE', 'INCOMPLETE_SOURCE_DAY', 'NO_BUILDABLE_ORIGIN', 'MODEL_HORIZON_LIMIT'].includes(String(item.availabilityReason)) &&
    (item.availabilityReason === 'AVAILABLE') === (item.eligibleFutureTargetDates.length > 0)
}

export function parseForecastAvailability(value: unknown): ForecastAvailability[] {
  if (!object(value) || !Array.isArray(value.availability) || value.availability.length !== series.length ||
    !value.availability.every(item => object(item) && series.includes(item.series as ForecastSeries) && futureContract(item) && date(item.currentDate) && date(item.latestObservationDate) && date(item.latestReceivedDate) && date(item.latestIndividuallyUsableDate) && item.latestObservationDate === item.latestIndividuallyUsableDate && item.latestIndividuallyUsableDate <= item.latestReceivedDate && Array.isArray(item.semanticExcludedDates) && item.semanticExcludedDates.every(date) && new Set(item.semanticExcludedDates).size === item.semanticExcludedDates.length && Array.isArray(item.eligibleFutureTargetDates) && item.eligibleFutureTargetDates.every(target => date(target) && target > String(item.currentDate)) && new Set(item.eligibleFutureTargetDates).size === item.eligibleFutureTargetDates.length && item.eligibleFutureTargetDates.every((target, index, dates) => index === 0 || dates[index - 1] < target) && date(item.nextForecastDate) && date(item.modelMinTargetDate) && date(item.modelMaxTargetDate) &&
      (item.effectiveFutureMinDate === null || date(item.effectiveFutureMinDate)) && (item.effectiveFutureMaxDate === null || date(item.effectiveFutureMaxDate)) && item.nextForecastDate > item.latestObservationDate &&
      item.supportedHorizonDays === (item.series === 'Gene' ? 7 : item.series === 'DemaSIN' ? 6 : 1) && (item.series !== 'DemaSIN' || (item.supportedHorizonMinDays === 1 && item.supportedHorizonMaxDays === 6)) && typeof item.hasFutureForecastWindow === 'boolean' && item.hasFutureForecastWindow === (item.eligibleFutureTargetDates.length > 0) && item.effectiveFutureMinDate === (item.eligibleFutureTargetDates[0] ?? null) && item.effectiveFutureMaxDate === (item.eligibleFutureTargetDates.at(-1) ?? null) && typeof item.dataFreshnessDays === 'number' && Number.isSafeInteger(item.dataFreshnessDays) && item.dataFreshnessDays >= 0) ||
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
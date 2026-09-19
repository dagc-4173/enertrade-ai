import { ApiError, apiRequest } from './apiClient'
import type { EnergySeriesGranularity, EnergySeriesRequest, EnergySeriesResponse, EnergySeriesUnit } from '../types/energySeries'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const identifier = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
const month = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
const units: readonly EnergySeriesUnit[] = ['kWh', 'COP/kWh']

function point(value: unknown, granularity: EnergySeriesGranularity): boolean {
  if (!object(value) || !text(value.date) || !finite(value.value)) return false
  if (granularity === 'hourly') return date(value.date) && Number.isInteger(value.period) && (value.period as number) >= 1 && (value.period as number) <= 24
  return (date(value.date) || month(value.date)) && value.period === undefined
}

export function parseEnergySeries(value: unknown, request: EnergySeriesRequest): EnergySeriesResponse {
  if (!object(value) || value.metric !== request.metric || value.granularity !== request.granularity || value.requestedFrom !== request.from || value.requestedTo !== request.to ||
    !units.includes(value.unit as EnergySeriesUnit) || !object(value.coverage) || !date(value.coverage.availableFrom) || !date(value.coverage.availableUntil) ||
    !(typeof value.pointCount === 'number' && Number.isSafeInteger(value.pointCount) && value.pointCount >= 0) || !identifier(value.sourceDatasetId) || !identifier(value.consolidatedDatasetId) || !hash(value.contentHash) ||
    !(value.returnedFrom === null || date(value.returnedFrom)) || !(value.returnedTo === null || date(value.returnedTo)) || !Array.isArray(value.points) || value.points.length !== value.pointCount || !value.points.every(item => point(item, request.granularity))) {
    throw new ApiError('response', 'La API devolvió una serie histórica con formato inesperado.')
  }
  return value as unknown as EnergySeriesResponse
}

export async function getEnergySeries(request: EnergySeriesRequest, signal?: AbortSignal): Promise<EnergySeriesResponse> {
  const query = new URLSearchParams({ metric: request.metric, from: request.from, to: request.to, granularity: request.granularity })
  const response = await apiRequest<unknown>(`/energy-series?${query.toString()}`, { credentials: 'include', signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió un estado inesperado para la serie histórica.', response.status)
  return parseEnergySeries(response.data, request)
}
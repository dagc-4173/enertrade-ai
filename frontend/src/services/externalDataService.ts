import { ApiError, apiRequest, postJson } from './apiClient'
import type { ExternalDataset, ExternalProvider, ExternalQuery, ExternalResult } from '../types/externalData'

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const granularity = (value: unknown) => value === 'hourly' || value === 'daily'
const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
function dataset(value: unknown): value is ExternalDataset {
  return object(value) && text(value.id) && text(value.name) && text(value.unit) &&
    granularity(value.granularity) && typeof value.maxInclusiveDays === 'number' &&
    Number.isInteger(value.maxInclusiveDays) && value.maxInclusiveDays > 0 && typeof value.supportsFilters === 'boolean'
}

export async function listExternalProviders(signal?: AbortSignal): Promise<ExternalProvider[]> {
  const { status, data } = await apiRequest<unknown>('/external-data/providers', { signal })
  if (status !== 200 || !object(data) || !Array.isArray(data.providers) ||
    !data.providers.every((provider): provider is ExternalProvider => object(provider) && text(provider.id) &&
      text(provider.name) && Array.isArray(provider.datasets) && provider.datasets.every(dataset) &&
      new Set(provider.datasets.map(item => item.id)).size === provider.datasets.length) ||
    new Set(data.providers.map(provider => provider.id)).size !== data.providers.length) {
    throw new ApiError('response', 'No se pudo interpretar el catálogo de fuentes.', status)
  }
  return data.providers
}

export async function queryExternalData(query: ExternalQuery, signal?: AbortSignal): Promise<ExternalResult> {
  const { status, data } = await postJson<unknown>('/external-data/query', query, { signal })
  if (status !== 200 || !object(data) || data.provider !== query.provider || data.dataset !== query.dataset ||
    data.startDate !== query.startDate || data.endDate !== query.endDate || !text(data.unit) ||
    !granularity(data.granularity) || !Array.isArray(data.records) ||
    !data.records.every(row => object(row) && date(row.date) && row.date >= query.startDate && row.date <= query.endDate &&
      typeof row.value === 'number' && Number.isFinite(row.value) &&
      (data.granularity === 'daily' ? row.hour === null : typeof row.hour === 'number' && Number.isInteger(row.hour) && row.hour >= 1 && row.hour <= 24))) {
    throw new ApiError('response', 'No se pudo interpretar el resultado de la consulta.', status)
  }
  const result = data as unknown as ExternalResult
  if (new Set(result.records.map(row => `${row.date}/${row.hour}`)).size !== result.records.length) {
    throw new ApiError('response', 'No se pudo interpretar el resultado de la consulta.', status)
  }
  return result
}

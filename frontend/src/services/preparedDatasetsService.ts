import { ApiError, apiRequest } from './apiClient'
import type { PreparedDatasetSummary } from '../types/preparedDatasets'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const dataTypes = new Set(['generacion', 'consumo', 'oferta', 'demanda', 'precios', 'transacciones_simuladas'])
function dateTime(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function summary(value: unknown): value is PreparedDatasetSummary {
  return object(value) && count(value.id) && value.id > 0 && count(value.sourceDatasetId) && value.sourceDatasetId > 0 && typeof value.dataType === 'string' && dataTypes.has(value.dataType) && text(value.profileId) && text(value.profileVersion) && text(value.sourceRulesetId) && text(value.sourceRulesetVersion) && dateTime(value.preparedAt) && count(value.recordCount)
}
export function parsePreparedDatasets(value: unknown): PreparedDatasetSummary[] {
  if (!object(value) || !Array.isArray(value.preparedDatasets) || !value.preparedDatasets.every(summary)) throw new ApiError('response', 'La API devolvió datasets preparados con formato inesperado.')
  return value.preparedDatasets as PreparedDatasetSummary[]
}
export async function getPreparedDatasets(signal?: AbortSignal) {
  const response = await apiRequest<unknown>('/prepared-datasets', { signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió datasets preparados con estado inesperado.', response.status)
  return parsePreparedDatasets(response.data)
}
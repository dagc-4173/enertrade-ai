import { ApiError, apiRequest } from './apiClient'
import type { CapabilityVersion } from '../types/capabilities'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const capabilities = new Set(['supply_forecast', 'demand_forecast', 'price_estimation', 'matching', 'pattern_recognition'])
const artifactTypes = new Set(['ml_model', 'deterministic_rule', 'deterministic_method'])

export function parseCapabilityVersions(value: unknown): CapabilityVersion[] {
  if (!object(value) || !Array.isArray(value.capabilities) || value.capabilities.length !== 5) throw new ApiError('response', 'La API devolvió capacidades con formato inesperado.')
  const result = value.capabilities
  if (!result.every(item => object(item) && typeof item.capability === 'string' && capabilities.has(item.capability) &&
    typeof item.artifactType === 'string' && artifactTypes.has(item.artifactType) && text(item.id) && text(item.version) &&
    item.status === 'active' && item.active === true && item.date === null && item.dateStatus === 'not_recorded') ||
    new Set(result.map(item => (item as Record<string, unknown>).capability)).size !== 5) {
    throw new ApiError('response', 'La API devolvió capacidades con formato inesperado.')
  }
  return result as CapabilityVersion[]
}

export async function getCapabilityVersions(signal?: AbortSignal) {
  const response = await apiRequest<unknown>('/capabilities/versions', { signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió capacidades con estado inesperado.', response.status)
  return parseCapabilityVersions(response.data)
}
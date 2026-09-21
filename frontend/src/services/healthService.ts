import { ApiError, apiRequest } from './apiClient'
import type { HealthResponse } from '../types/health'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

export function parseHealth(value: unknown): HealthResponse {
  if (!object(value) || (value.status !== 'ok' && value.status !== 'degraded') || value.service !== 'enertrade-backend' ||
    !object(value.dependencies) || (value.dependencies.database !== 'ok' && value.dependencies.database !== 'unavailable')) {
    throw new ApiError('response', 'La API devolvió un estado de salud con formato inesperado.')
  }
  return value as unknown as HealthResponse
}

export async function getHealth(signal?: AbortSignal) {
  const response = await apiRequest<unknown>('/health', { signal, acceptStatuses: [503] })
  if (response.status !== 200 && response.status !== 503) throw new ApiError('response', 'La API devolvió un estado de salud con código inesperado.', response.status)
  return parseHealth(response.data)
}

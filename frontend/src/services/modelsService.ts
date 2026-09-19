import { ApiError, apiRequest } from './apiClient'
import type { PredictiveArtifactMetadata, PredictiveArtifactMetrics, PredictiveArtifactSummary } from '../types/models'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const range = (value: unknown) => object(value) && text(value.start) && text(value.end)
const metric = (value: unknown) => object(value) && finite(value.value) && text(value.unit)

function summary(value: unknown): value is PredictiveArtifactSummary {
  return object(value) && text(value.id) && text(value.version) && (value.kind === 'model' || value.kind === 'rule') && text(value.type) &&
    text(value.target) && text(value.unit) && text(value.forecastType) && typeof value.activeInRuntime === 'boolean'
}

export function parseModels(value: unknown): PredictiveArtifactSummary[] {
  if (!object(value) || !Array.isArray(value.artifacts) || !value.artifacts.every(summary)) throw new ApiError('response', 'La API devolvió modelos con formato inesperado.')
  return value.artifacts as PredictiveArtifactSummary[]
}

export function parseModel(value: unknown): PredictiveArtifactMetadata {
  if (!object(value) || !summary(value) || !object(value.horizon) || !finite(value.horizon.value) || (value.horizon.unit !== 'periods' && value.horizon.unit !== 'days') ||
    !object(value.data) || !text(value.data.source) || !object(value.method) || !text(value.method.equation) || !Array.isArray(value.method.features) ||
    !value.method.features.every(text) || !object(value.method.parameters) || !object(value.quality) || typeof value.quality.metricsAvailable !== 'boolean' ||
    (value.quality.confidenceStatus !== undefined && !text(value.quality.confidenceStatus)) || !Array.isArray(value.limitations) || !value.limitations.every(text) ||
    !object(value.lifecycle) || typeof value.lifecycle.activeInRuntime !== 'boolean' || typeof value.lifecycle.promoted !== 'boolean' ||
    (value.lifecycle.academicValidation !== 'pending' && value.lifecycle.academicValidation !== 'validated')) throw new ApiError('response', 'La API devolvió un modelo con formato inesperado.')
  return value as unknown as PredictiveArtifactMetadata
}

export function parseModelMetrics(value: unknown): PredictiveArtifactMetrics {
  if (!object(value) || !text(value.id) || !text(value.version) || (value.evaluationType !== undefined && !text(value.evaluationType)) || !range(value.range) ||
    !finite(value.evaluable) || !finite(value.unavailable) || !object(value.metrics) || !metric(value.metrics.MAE) || !metric(value.metrics.RMSE) ||
    !metric(value.metrics.bias) || (value.metrics.WAPE !== undefined && !metric(value.metrics.WAPE))) throw new ApiError('response', 'La API devolvió métricas de modelo con formato inesperado.')
  return value as unknown as PredictiveArtifactMetrics
}

export async function getModels(signal?: AbortSignal) {
  const response = await apiRequest<unknown>('/models', { signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió modelos con estado inesperado.', response.status)
  return parseModels(response.data)
}
export async function getModel(id: string, signal?: AbortSignal) {
  const response = await apiRequest<unknown>(`/models/${encodeURIComponent(id)}`, { signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió un modelo con estado inesperado.', response.status)
  return parseModel(response.data)
}
export async function getModelMetrics(id: string, signal?: AbortSignal) {
  const response = await apiRequest<unknown>(`/models/${encodeURIComponent(id)}/metrics`, { signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió métricas de modelo con estado inesperado.', response.status)
  return parseModelMetrics(response.data)
}
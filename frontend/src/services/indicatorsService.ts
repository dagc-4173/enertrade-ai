import { ApiError, apiRequest } from './apiClient'
import type { IndicatorsResponse } from '../types/indicators'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const finiteOrNull = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value))
const rateOrNull = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)

export function parseIndicators(value: unknown): IndicatorsResponse {
  if (!object(value) || !object(value.indicators) || !object(value.sample) || !Array.isArray(value.warnings) || !value.warnings.every(item => typeof item === 'string')) {
    throw new ApiError('response', 'La API devolvió indicadores con formato inesperado.')
  }
  const indicators = value.indicators
  if (!object(indicators.forecasts) || !object(indicators.errors) || !object(indicators.executions) || !object(indicators.capabilities) || !object(indicators.capabilities.byArtifactType) ||
    !count(indicators.forecasts.supply) || !count(indicators.forecasts.demand) || !count(indicators.forecasts.total) ||
    indicators.forecasts.total !== indicators.forecasts.supply + indicators.forecasts.demand || !count(indicators.priceEstimates) ||
    !count(indicators.matchingSuggestions) || !count(indicators.patternsIdentified) || !count(indicators.errors.total) ||
    !count(indicators.executions.total) || !count(indicators.executions.succeeded) || !count(indicators.executions.empty) || !count(indicators.executions.failed) ||
    indicators.executions.total !== indicators.executions.succeeded + indicators.executions.empty + indicators.executions.failed ||
    !rateOrNull(indicators.executions.successRate) || (indicators.executions.total === 0) !== (indicators.executions.successRate === null) ||
    indicators.errors.total !== indicators.executions.failed ||
    !finiteOrNull(indicators.averageResponseTimeMs) || !count(indicators.capabilities.active) || !count(indicators.capabilities.total) ||
    indicators.capabilities.active > indicators.capabilities.total || !count(indicators.capabilities.byArtifactType.mlModel) ||
    !count(indicators.capabilities.byArtifactType.deterministicRule) || !count(indicators.capabilities.byArtifactType.deterministicMethod) ||
    !count(value.sample.traceCount)) throw new ApiError('response', 'La API devolvió indicadores con formato inesperado.')
  return value as unknown as IndicatorsResponse
}

export async function getIndicators(signal?: AbortSignal) {
  const response = await apiRequest<unknown>('/indicators', { signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió indicadores con estado inesperado.', response.status)
  return parseIndicators(response.data)
}
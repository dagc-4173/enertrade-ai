import { ApiError, apiRequest, postJson } from './apiClient'
import type { PatternAnalysis, PatternAnalysisResponse, PatternFilters, PatternResult } from '../types/patterns'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const count = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0
const dateOrNull = (value: unknown): value is string | null => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)))
const dateTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const dataTypes = new Set(['generacion', 'demanda', 'precios'])
const variables = new Set(['energia_kwh', 'demanda_kwh', 'precio_cop_kwh'])
const statuses = new Set(['completed', 'partial', 'no_results'])

function pattern(value: unknown): value is PatternResult {
  if (!object(value) || !text(value.description) || !object(value.metrics)) return false
  if (value.type === 'distribution') return count(value.metrics.count) && finite(value.metrics.min) && finite(value.metrics.max) && finite(value.metrics.mean) && finite(value.metrics.median) && finite(value.metrics.standardDeviation)
  if (value.type === 'trend') return finite(value.metrics.slope) && ['stable', 'increasing', 'decreasing'].includes(String(value.metrics.direction)) && finite(value.metrics.stableThreshold)
  return value.type === 'recurrence' && (value.metrics.grouping === 'Monday-Sunday' || value.metrics.grouping === '1-24') && Array.isArray(value.metrics.periods) && value.metrics.periods.every(item => object(item) && text(item.key) && count(item.count) && finite(item.mean) && finite(item.min) && finite(item.max))
}

function analysis(value: unknown): value is PatternAnalysis {
  return object(value) && text(value.analysisId) && typeof value.status === 'string' && statuses.has(value.status) && typeof value.dataType === 'string' && dataTypes.has(value.dataType) && typeof value.variable === 'string' && variables.has(value.variable) && object(value.period) && dateOrNull(value.period.from) && dateOrNull(value.period.to) && count(value.sampleSize) && object(value.method) && text(value.method.id) && text(value.method.version) && value.method.type === 'deterministic-statistical' && Array.isArray(value.patterns) && value.patterns.every(pattern) && Array.isArray(value.warnings) && value.warnings.every(text) && (value.createdAt === undefined || dateTime(value.createdAt))
}

export function parsePatternAnalysis(value: unknown): PatternAnalysisResponse {
  if (!object(value) || !analysis(value) || !object(value.persistence) || !text(value.persistence.analysisId) || (value.persistence.persistence !== 'persisted' && value.persistence.persistence !== 'failed')) throw new ApiError('response', 'La API devolvió un análisis de patrones con formato inesperado.')
  return value as unknown as PatternAnalysisResponse
}
export function parsePatterns(value: unknown): PatternAnalysis[] {
  if (!Array.isArray(value) || !value.every(analysis)) throw new ApiError('response', 'La API devolvió el historial de patrones con formato inesperado.')
  return value as PatternAnalysis[]
}
function query(filters: PatternFilters) {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.dataType) params.set('dataType', filters.dataType)
  if (filters.variable) params.set('variable', filters.variable)
  const encoded = params.toString()
  return encoded ? `/patterns?${encoded}` : '/patterns'
}
export async function analyzePatterns(preparedDatasetId: number, signal?: AbortSignal) {
  const response = await postJson<unknown>('/patterns/analyze', { preparedDatasetId }, { credentials: 'include', signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió patrones con estado inesperado.', response.status)
  return parsePatternAnalysis(response.data)
}
export async function getPatterns(filters: PatternFilters = {}, signal?: AbortSignal) {
  const response = await apiRequest<unknown>(query(filters), { credentials: 'include', signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió patrones con estado inesperado.', response.status)
  return parsePatterns(response.data)
}
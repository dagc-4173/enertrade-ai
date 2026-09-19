import { ApiError, postJson } from './apiClient'
import type { MatchingResult } from '../types/matching'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const decimal = (value: unknown): value is string => text(value) && /^-?\d+(?:\.\d+)?$/.test(value)
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
const matchingStatuses = new Set(['matched', 'partial', 'no_matches'])
const compatibilities = new Set(['FULL', 'PARTIAL', 'NO_MATCH'])
const reasons = new Set(['SAME_DELIVERY_DATE', 'PRICE_COMPATIBLE', 'INSUFFICIENT_QUANTITY', 'NO_COMPATIBLE_OFFERS'])
const warnings = new Set(['NO_ACTIVE_OFFERS', 'NO_ACTIVE_DEMANDS', 'PARTIAL_MATCHES'])

export function parseMatching(value: unknown): MatchingResult {
  if (!object(value) || typeof value.status !== 'string' || !matchingStatuses.has(value.status) || !Array.isArray(value.matches) || !Array.isArray(value.demands) || !object(value.summary) || !Array.isArray(value.warnings) || !object(value.trace)) {
    throw new ApiError('response', 'La API devolvió emparejamientos con formato inesperado.')
  }
  const validMatches = value.matches.every(item => object(item) && text(item.offerId) && text(item.demandId) && decimal(item.suggestedQuantityKwh) && decimal(item.offerPricePerKwh) && decimal(item.maxDemandPricePerKwh) && date(item.deliveryDate))
  const validDemands = value.demands.every(item => object(item) && text(item.demandId) && decimal(item.requestedQuantityKwh) && decimal(item.suggestedQuantityKwh) && decimal(item.unmatchedQuantityKwh) && typeof item.compatibility === 'string' && compatibilities.has(item.compatibility) && Array.isArray(item.reasons) && item.reasons.every(reason => typeof reason === 'string' && reasons.has(reason)))
  const summary = value.summary
  if (!validMatches || !validDemands || !count(summary.offersConsidered) || !count(summary.demandsConsidered) || !count(summary.suggestedMatches) || !decimal(summary.matchedQuantityKwh) || !decimal(summary.unmatchedDemandKwh) || summary.suggestedMatches !== value.matches.length || !value.warnings.every(warning => typeof warning === 'string' && warnings.has(warning)) || !text(value.trace.executionId) || (value.trace.persistence !== 'persisted' && value.trace.persistence !== 'failed')) {
    throw new ApiError('response', 'La API devolvió emparejamientos con formato inesperado.')
  }
  return value as unknown as MatchingResult
}

export async function suggestMatches(signal?: AbortSignal) {
  const response = await postJson<unknown>('/matches/suggest', {}, { credentials: 'include', signal })
  if (response.status !== 200) throw new ApiError('response', 'La API devolvió emparejamientos con estado inesperado.', response.status)
  return parseMatching(response.data)
}
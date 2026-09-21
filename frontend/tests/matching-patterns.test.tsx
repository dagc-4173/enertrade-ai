import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import { MatchingContent } from '../src/pages/Marketplace'
import { PatternResults, Patterns } from '../src/pages/Patterns'
import { ApiError } from '../src/services/apiClient'
import { suggestMatches } from '../src/services/matchingService'
import { analyzePatterns, getPatterns } from '../src/services/patternsService'
import type { MatchingResult } from '../src/types/matching'
import type { PatternAnalysisResponse } from '../src/types/patterns'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function respond(body: unknown, status = 200) { return spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body, { status })) }

const baseMatching = {
  matches: [{ offerId: 'offer-1', demandId: 'demand-1', suggestedQuantityKwh: '4.5', offerPricePerKwh: '10', maxDemandPricePerKwh: '12', deliveryDate: '2026-09-18' }],
  demands: [{ demandId: 'demand-1', requestedQuantityKwh: '4.5', suggestedQuantityKwh: '4.5', unmatchedQuantityKwh: '0', compatibility: 'FULL', reasons: ['SAME_DELIVERY_DATE', 'PRICE_COMPATIBLE'] }],
  summary: { offersConsidered: 1, demandsConsidered: 1, suggestedMatches: 1, matchedQuantityKwh: '4.5', unmatchedDemandKwh: '0' },
  warnings: [], trace: { executionId: 'run-1', persistence: 'persisted' },
} as const
const completed: PatternAnalysisResponse = {
  analysisId: 'analysis-1', status: 'completed', dataType: 'demanda', variable: 'demanda_kwh', period: { from: '2026-09-01', to: '2026-09-08' }, sampleSize: 2,
  method: { id: 'energy-pattern-descriptive', version: '1.0.0', type: 'deterministic-statistical' },
  patterns: [
    { type: 'distribution', metrics: { count: 2, min: 10, max: 20, mean: 15, median: 15, standardDeviation: 7.071 }, description: 'Distribución real.' },
    { type: 'trend', metrics: { slope: 10, direction: 'increasing', stableThreshold: 0.00000000002 }, description: 'Tendencia real.' },
    { type: 'recurrence', metrics: { grouping: 'Monday-Sunday', periods: [{ key: 'Monday', count: 2, mean: 15, min: 10, max: 20 }] }, description: 'Recurrencia real.' },
  ], warnings: [], persistence: { analysisId: 'analysis-1', persistence: 'persisted' },
}

test('matching service posts an empty authenticated JSON body and validates response', async () => {
  const fetch = respond({ status: 'matched', ...baseMatching })
  expect(await suggestMatches()).toEqual({ status: 'matched', ...baseMatching })
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/matches/suggest')
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({})
  expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('include')
})

test('matching UI distinguishes FULL, PARTIAL and NO_MATCH without calling it a transaction', () => {
  const full: MatchingResult = { status: 'matched', ...baseMatching, demands: [{ ...baseMatching.demands[0], suggestedQuantityKwh: '19703663.78', unmatchedQuantityKwh: '0' }] }
  const partial: MatchingResult = { status: 'partial', ...baseMatching, demands: [{ ...baseMatching.demands[0], compatibility: 'PARTIAL', suggestedQuantityKwh: '19703663.78', unmatchedQuantityKwh: '232740895.05', reasons: ['SAME_DELIVERY_DATE', 'INSUFFICIENT_QUANTITY'] }], warnings: ['PARTIAL_MATCHES'] }
  const noMatch: MatchingResult = { status: 'no_matches', ...baseMatching, matches: [], demands: [{ ...baseMatching.demands[0], compatibility: 'NO_MATCH', suggestedQuantityKwh: '0', unmatchedQuantityKwh: '252444558.83', reasons: ['NO_COMPATIBLE_OFFERS'] }], summary: { ...baseMatching.summary, suggestedMatches: 0, matchedQuantityKwh: '0', unmatchedDemandKwh: '252444558.83' }, warnings: ['NO_ACTIVE_OFFERS'] }
  const fullMarkup = renderToStaticMarkup(<MatchingContent state={{ kind: 'success', result: full }} onSuggest={() => {}} />)
  const partialMarkup = renderToStaticMarkup(<MatchingContent state={{ kind: 'success', result: partial }} onSuggest={() => {}} />)
  const noMatchMarkup = renderToStaticMarkup(<MatchingContent state={{ kind: 'success', result: noMatch }} onSuggest={() => {}} />)
  expect(fullMarkup).toContain('FULL')
  expect(fullMarkup).toContain('19.703.663,78 kWh')
  expect(fullMarkup).toContain('0,00 kWh')
  expect(partialMarkup).toContain('PARTIAL')
  expect(partialMarkup).toContain('19.703.663,78 kWh')
  expect(partialMarkup).toContain('232.740.895,05 kWh')
  expect(noMatchMarkup).toContain('NO_MATCH')
  expect(noMatchMarkup).toContain('0,00 kWh')
  expect(noMatchMarkup).toContain('252.444.558,83 kWh')
  expect(noMatchMarkup).toContain('No se encontraron emparejamientos compatibles.')
  expect(noMatchMarkup).not.toMatch(/transacción|pago|liquidación/i)
})

test('matching loading and API errors are visible without a false success', async () => {
  expect(renderToStaticMarkup(<MatchingContent state={{ kind: 'loading', message: 'Generando sugerencias…' }} onSuggest={() => {}} />)).toContain('Generando sugerencias…')
  expect(renderToStaticMarkup(<MatchingContent state={{ kind: 'error', message: 'No fue posible completar la solicitud.' }} onSuggest={() => {}} />)).toContain('role="alert"')
  respond({ error: 'MATCHING_OPERATION_FAILED', message: 'No fue posible sugerir emparejamientos.' }, 500)
  await expect(suggestMatches()).rejects.toMatchObject({ kind: 'http', status: 500, serverMessage: 'No fue posible sugerir emparejamientos.' })
})

test('patterns services send the exact analysis body and real filter query', async () => {
  const fetch = respond(completed)
  expect(await analyzePatterns(7)).toEqual(completed)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/patterns/analyze')
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ preparedDatasetId: 7 })
  const history = { ...completed, persistence: undefined }
  respond([history])
  expect(await getPatterns({ from: '2026-09-01', to: '2026-09-08', dataType: 'demanda', variable: 'demanda_kwh' })).toEqual([history])
  expect(fetch.mock.calls[1]?.[0]).toBe('http://enertrade.test/patterns?from=2026-09-01&to=2026-09-08&dataType=demanda&variable=demanda_kwh')
})

test('patterns results render distribution, trend and recurrence without invented confidence or recommendations', () => {
  const html = renderToStaticMarkup(<PatternResults analysis={completed} />)
  expect(html).toContain('Distribución real.')
  expect(html).toContain('Tendencia real.')
  expect(html).toContain('Recurrencia real.')
  expect(html).not.toMatch(/confidence|recomendación|zona/i)
})

test('patterns initial render has dataset selector, loading history and no demo records', () => {
  const html = renderToStaticMarkup(<Patterns />)
  expect(html).toContain('Dataset preparado compatible')
  expect(html).toContain('Cargando datasets preparados…')
  expect(html).toContain('Cargando análisis registrados…')
  expect(html).not.toContain('PAT-01')
  expect(html).not.toContain('No hay análisis registrados.')
})

test('patterns history accepts empty responses and rejects malformed or API error responses safely', async () => {
  respond([]); expect(await getPatterns()).toEqual([])
  respond([{ ...completed, patterns: [{ type: 'trend', metrics: {}, description: 'inválido' }] }])
  await expect(getPatterns()).rejects.toBeInstanceOf(ApiError)
  respond({ error: 'PREPARED_DATASET_NOT_FOUND', message: 'Dataset preparado no encontrado.' }, 404)
  await expect(analyzePatterns(7)).rejects.toMatchObject({ kind: 'http', status: 404, serverMessage: 'Dataset preparado no encontrado.' })
})
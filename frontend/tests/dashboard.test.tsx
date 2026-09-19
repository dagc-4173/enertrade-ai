import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import { DashboardContent } from '../src/pages/Dashboard'
import { getCapabilityVersions } from '../src/services/capabilityVersionsService'
import { getIndicators } from '../src/services/indicatorsService'
import type { CapabilityVersion } from '../src/types/capabilities'
import type { IndicatorsResponse } from '../src/types/indicators'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const indicators: IndicatorsResponse = {
  indicators: {
    forecasts: { supply: 2, demand: 3, total: 5 },
    priceEstimates: 4,
    matchingSuggestions: 6,
    patternsIdentified: 7,
    errors: { total: 0 },
    averageResponseTimeMs: 18.25,
    capabilities: { active: 5, total: 5, byArtifactType: { mlModel: 2, deterministicRule: 1, deterministicMethod: 2 } },
  },
  sample: { traceCount: 12 },
  warnings: [],
}
const capabilities: CapabilityVersion[] = [
  { capability: 'supply_forecast', artifactType: 'ml_model', id: 'xm-gene-ridge', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'demand_forecast', artifactType: 'ml_model', id: 'xm-demandasin-ridge', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'price_estimation', artifactType: 'deterministic_rule', id: 'xm-preciobolsnaci-b1', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'matching', artifactType: 'deterministic_method', id: 'market-matching', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'pattern_recognition', artifactType: 'deterministic_method', id: 'pattern-analysis', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
]

test('indicators service requests the real endpoint and retains nullable duration', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ...indicators, indicators: { ...indicators.indicators, averageResponseTimeMs: null } }))
  expect(await getIndicators()).toEqual({ ...indicators, indicators: { ...indicators.indicators, averageResponseTimeMs: null } })
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/indicators')
  expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined()
})

test('capability versions service requests and validates all five capabilities', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ capabilities }))
  expect(await getCapabilityVersions()).toEqual(capabilities)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/capabilities/versions')
})

test('services reject malformed indicator and capability contracts', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ indicators: {}, sample: {}, warnings: [] }))
  await expect(getIndicators()).rejects.toMatchObject({ kind: 'response' })
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ capabilities: capabilities.slice(0, 4) }))
  await expect(getCapabilityVersions()).rejects.toMatchObject({ kind: 'response' })
})

test('Dashboard renders loading without prior values', () => {
  const html = renderToStaticMarkup(<DashboardContent state={{ kind: 'loading' }} onRetry={() => {}} />)
  expect(html).toContain('Cargando indicadores y capacidades…')
  expect(html).not.toContain('1.284 kWh')
  expect(html).not.toContain('Mercado en vivo')
})

test('Dashboard renders backend indicators and capability taxonomy on success', () => {
  const html = renderToStaticMarkup(<DashboardContent state={{ kind: 'success', indicators, capabilities }} onRetry={() => {}} />)
  expect(html).toContain('Pronósticos registrados')
  expect(html).toContain('>5<')
  expect(html).toContain('18.25 ms')
  expect(html).toContain('Modelo de ML')
  expect(html).toContain('Regla determinista')
  expect(html).toContain('Método determinista')
  expect(html).not.toMatch(/recomendación inteligente|mercado en vivo|412 COP/i)
})

test('Dashboard represents empty warnings and null duration without inventing a value', () => {
  const empty: IndicatorsResponse = { ...indicators, indicators: { ...indicators.indicators, forecasts: { supply: 0, demand: 0, total: 0 }, priceEstimates: 0, matchingSuggestions: 0, patternsIdentified: 0, averageResponseTimeMs: null }, sample: { traceCount: 0 }, warnings: ['NO_TRACE_DATA', 'NO_FUNCTIONAL_RECORDS'] }
  const html = renderToStaticMarkup(<DashboardContent state={{ kind: 'success', indicators: empty, capabilities }} onRetry={() => {}} />)
  expect(html).toContain('No disponible')
  expect(html).toContain('No hay registros funcionales suficientes')
  expect(html).not.toContain('0 ms')
})

test('Dashboard exposes only a safe API error and retry action', () => {
  const html = renderToStaticMarkup(<DashboardContent state={{ kind: 'error', message: 'No fue posible consultar los indicadores.' }} onRetry={() => {}} />)
  expect(html).toContain('role="alert"')
  expect(html).toContain('No fue posible consultar los indicadores.')
  expect(html).toContain('Reintentar carga')
})
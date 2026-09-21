import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import { DashboardContent } from '../src/pages/Dashboard'
import { ApiError } from '../src/services/apiClient'
import { getCapabilityVersions } from '../src/services/capabilityVersionsService'
import { getHealth } from '../src/services/healthService'
import { getIndicators } from '../src/services/indicatorsService'
import type { CapabilityVersion } from '../src/types/capabilities'
import type { HealthResponse } from '../src/types/health'
import type { IndicatorsResponse } from '../src/types/indicators'
import { formatNumberCO, formatPercentCO } from '../src/utils/numberFormat'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const noop = () => {}

const healthOk: HealthResponse = { status: 'ok', service: 'enertrade-backend', dependencies: { database: 'ok' } }
const healthDegraded: HealthResponse = { status: 'degraded', service: 'enertrade-backend', dependencies: { database: 'unavailable' } }

const indicators: IndicatorsResponse = {
  indicators: {
    forecasts: { supply: 2, demand: 3, total: 5 },
    priceEstimates: 4,
    matchingSuggestions: 6,
    patternsIdentified: 7,
    errors: { total: 1 },
    executions: { total: 8, succeeded: 6, empty: 1, failed: 1, successRate: 75 },
    averageResponseTimeMs: 18.25,
    capabilities: { active: 5, total: 5, byArtifactType: { mlModel: 2, deterministicRule: 1, deterministicMethod: 2 } },
  },
  sample: { traceCount: 12 },
  warnings: [],
}
const zeroExecutionsIndicators: IndicatorsResponse = {
  ...indicators,
  indicators: { ...indicators.indicators, executions: { total: 0, succeeded: 0, empty: 0, failed: 0, successRate: null }, errors: { total: 0 } },
}
const capabilities: CapabilityVersion[] = [
  { capability: 'supply_forecast', artifactType: 'ml_model', id: 'xm-gene-ridge', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'demand_forecast', artifactType: 'ml_model', id: 'xm-demandasin-ridge', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'price_estimation', artifactType: 'deterministic_rule', id: 'xm-preciobolsnaci-b1', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'matching', artifactType: 'deterministic_method', id: 'market-matching', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'pattern_recognition', artifactType: 'deterministic_method', id: 'pattern-analysis', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
]

test('health service requests the real endpoint and accepts both ok and degraded HTTP codes', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(healthOk))
  expect(await getHealth()).toEqual(healthOk)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/health')

  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(healthDegraded, { status: 503 }))
  expect(await getHealth()).toEqual(healthDegraded)
})

test('health service rejects malformed contracts', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ status: 'ok' }))
  await expect(getHealth()).rejects.toMatchObject({ kind: 'response' })
})

test('an unexpected 500 from /health is rejected and never resolved as degraded', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: 'INTERNAL_ERROR', message: 'Fallo interno.' }, { status: 500 }))
  const rejection = getHealth()
  await expect(rejection).rejects.toBeInstanceOf(ApiError)
  await expect(rejection).rejects.toMatchObject({ kind: 'http', status: 500 })
})

test('a network failure on /health is rejected and never resolved as degraded', async () => {
  spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('network down'))
  const rejection = getHealth()
  await expect(rejection).rejects.toBeInstanceOf(ApiError)
  await expect(rejection).rejects.toMatchObject({ kind: 'network' })
})

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

test('services reject malformed indicator, executions and capability contracts', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ indicators: {}, sample: {}, warnings: [] }))
  await expect(getIndicators()).rejects.toMatchObject({ kind: 'response' })
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ ...indicators, indicators: { ...indicators.indicators, executions: { total: 8, succeeded: 6, empty: 1, failed: 2, successRate: 75 } } }))
  await expect(getIndicators()).rejects.toMatchObject({ kind: 'response' })
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ ...indicators, indicators: { ...indicators.indicators, executions: { ...indicators.indicators.executions, successRate: 101 } } }))
  await expect(getIndicators()).rejects.toMatchObject({ kind: 'response' })
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ ...indicators, indicators: { ...indicators.indicators, errors: { total: 0 } } }))
  await expect(getIndicators()).rejects.toMatchObject({ kind: 'response' })
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ capabilities: capabilities.slice(0, 4) }))
  await expect(getCapabilityVersions()).rejects.toMatchObject({ kind: 'response' })
})

test('Dashboard renders loading without prior values for every independent block', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'loading' }} indicatorsState={{ kind: 'loading' }} capabilitiesState={{ kind: 'loading' }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('Cargando indicadores…')
  expect(html).toContain('Cargando capacidades activas…')
  expect(html).not.toContain('1.284 kWh')
  expect(html).not.toContain('Mercado en vivo')
})

test('health ok muestra estado Operativo y base de datos disponible', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'success', health: healthOk }} indicatorsState={{ kind: 'loading' }} capabilitiesState={{ kind: 'loading' }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('Operativo')
  expect(html).not.toContain('Degradado')
  expect(html).not.toContain('No disponible')
})

test('health degraded muestra estado Degradado y base de datos no disponible', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'success', health: healthDegraded }} indicatorsState={{ kind: 'loading' }} capabilitiesState={{ kind: 'loading' }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('Degradado')
  expect(html).toContain('No disponible')
  expect(html).toContain('Disponible')
})

test('indicators success expone total de ejecuciones, tasa de éxito y desglose succeeded/empty/failed', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'loading' }} indicatorsState={{ kind: 'success', indicators }} capabilitiesState={{ kind: 'loading' }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('Total de ejecuciones')
  expect(html).toContain(`>${formatNumberCO(8)}<`)
  expect(html).toContain('Tasa de éxito')
  expect(html).toContain(formatPercentCO(75))
  expect(html).toContain(`${formatNumberCO(6)} exitosas · ${formatNumberCO(1)} sin resultados · ${formatNumberCO(1)} fallidas.`)
  expect(html).toContain('Ejecuciones fallidas')
})

test('indicators con total de ejecuciones cero muestra No disponible sin inventar 0 %', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'loading' }} indicatorsState={{ kind: 'success', indicators: zeroExecutionsIndicators }} capabilitiesState={{ kind: 'loading' }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('Tasa de éxito')
  expect(html).toContain('No disponible')
  expect(html).not.toContain('0 %')
})

test('un fallo de health no oculta los indicadores', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'error', message: 'No fue posible consultar el estado operativo.' }} indicatorsState={{ kind: 'success', indicators }} capabilitiesState={{ kind: 'loading' }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('No fue posible consultar el estado operativo.')
  expect(html).toContain('Reintentar estado operativo')
  expect(html).toContain('Pronósticos registrados')
  expect(html).toContain('Total de ejecuciones')
})

test('un fallo de indicators no oculta health, capabilities ni la gestión de datos', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'success', health: healthOk }} indicatorsState={{ kind: 'error', message: 'No fue posible cargar los indicadores.' }} capabilitiesState={{ kind: 'success', capabilities }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('Operativo')
  expect(html).toContain('No fue posible cargar los indicadores.')
  expect(html).toContain('Reintentar indicadores')
  expect(html).toContain('Artefactos activos')
  expect(html).toContain('Registrar dataset')
  expect(html).toContain('Fuentes de datos')
})

test('un fallo de capabilities no hace desaparecer las métricas de indicadores', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'success', health: healthOk }} indicatorsState={{ kind: 'success', indicators }} capabilitiesState={{ kind: 'error', message: 'No fue posible cargar las capacidades activas.' }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('Pronósticos registrados')
  expect(html).toContain('Total de ejecuciones')
  expect(html).toContain('No fue posible cargar las capacidades activas.')
  expect(html).toContain('Reintentar capacidades')
})

test('Dashboard renders backend capability taxonomy on success', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'success', health: healthOk }} indicatorsState={{ kind: 'success', indicators }} capabilitiesState={{ kind: 'success', capabilities }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('Modelo de ML')
  expect(html).toContain('Regla determinista')
  expect(html).toContain('Método determinista')
  expect(html).not.toMatch(/recomendación inteligente|mercado en vivo|412 COP/i)
})

test('Dashboard represents empty warnings without inventing a value', () => {
  const empty: IndicatorsResponse = { ...indicators, indicators: { ...indicators.indicators, forecasts: { supply: 0, demand: 0, total: 0 }, priceEstimates: 0, matchingSuggestions: 0, patternsIdentified: 0, averageResponseTimeMs: null }, sample: { traceCount: 0 }, warnings: ['NO_TRACE_DATA', 'NO_FUNCTIONAL_RECORDS'] }
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'loading' }} indicatorsState={{ kind: 'success', indicators: empty }} capabilitiesState={{ kind: 'loading' }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('No disponible')
  expect(html).toContain('No hay registros funcionales suficientes')
  expect(html).not.toContain('0 ms')
})

test('Dashboard no expone el texto interno de desarrollo del hero', () => {
  const html = renderToStaticMarkup(<DashboardContent
    healthState={{ kind: 'loading' }} indicatorsState={{ kind: 'loading' }} capabilitiesState={{ kind: 'loading' }}
    onRetryHealth={noop} onRetryIndicators={noop} onRetryCapabilities={noop}
  />)
  expect(html).toContain('Los indicadores mostrados corresponden a datos y ejecuciones registradas por EnerTrade AI.')
  expect(html).not.toContain('sin un contrato backend que las respalde')
  expect(html).not.toMatch(/validada académicamente|recomendación automática/i)
})
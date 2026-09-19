import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { ApiError } from '../src/services/apiClient'
import { getEnergySeries } from '../src/services/energySeriesService'
import { formatCurrencyCOP, formatDateCO, formatEnergyKWh, formatNumberCO, formatPercentCO, formatPriceCOPPerKWh } from '../src/utils/numberFormat'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const originalFetch = globalThis.fetch
const request = { metric: 'gene', from: '2026-09-09', to: '2026-09-09', granularity: 'hourly' } as const
const base = { ...request, unit: 'kWh', requestedFrom: request.from, requestedTo: request.to, returnedFrom: request.from, returnedTo: request.to, coverage: { availableFrom: '2024-01-01', availableUntil: '2026-09-15' }, pointCount: 1, sourceDatasetId: 118, consolidatedDatasetId: 4, contentHash: 'a'.repeat(64) }
const series = { ...base, points: [{ date: request.from, period: 1, value: 1234.56 }] }
afterEach(() => { globalThis.fetch = originalFetch })
function respond(body: unknown, status = 200) { return spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) }

test('serializa C18c, usa cookie y conserva una respuesta Gene horaria numérica', async () => {
  const fetch = respond(series)
  expect(await getEnergySeries(request)).toEqual(series)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/energy-series?metric=gene&from=2026-09-09&to=2026-09-09&granularity=hourly')
  expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('include')
})
test('acepta Demand diario y Price mensual sin periodos artificiales', async () => {
  const demand = { ...base, metric: 'demand', granularity: 'daily', unit: 'kWh', points: [{ date: request.from, value: 1234.56 }] }
  respond(demand); expect(await getEnergySeries({ ...request, metric: 'demand', granularity: 'daily' })).toEqual(demand)
  const price = { ...base, metric: 'price', granularity: 'monthly', unit: 'COP/kWh', points: [{ date: '2026-09', value: 245.37 }] }
  respond(price); expect(await getEnergySeries({ ...request, metric: 'price', granularity: 'monthly' })).toEqual(price)
})
test.each([401, 400, 413])('conserva el error autenticación, rango o granularidad HTTP %i', async status => {
  respond({ error: status === 401 ? 'UNAUTHENTICATED' : status === 413 ? 'ENERGY_SERIES_RANGE_TOO_LARGE' : 'UNSUPPORTED_ENERGY_SERIES_GRANULARITY', message: 'Mensaje seguro.' }, status)
  await expect(getEnergySeries(request)).rejects.toBeInstanceOf(ApiError)
})
test('centraliza formato visual es-CO sin alterar números de dominio', () => {
  expect(formatNumberCO(1234.56)).toBe('1.234,56')
  expect(formatEnergyKWh(1234.56)).toBe('1.234,56 kWh')
  expect(formatPriceCOPPerKWh(245.37)).toBe('245,37 COP/kWh')
  expect(formatCurrencyCOP(1234.56).replace(/\u00a0/g, ' ')).toContain('1.234,56')
  expect(formatPercentCO(12.5)).toBe('12,5 %')
  expect(formatDateCO('2026-09-15')).toBe('15/09/2026')
})
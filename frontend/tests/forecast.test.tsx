import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { Predictions } from '../src/pages/Predictions'
import { ApiError } from '../src/services/apiClient'
import { forecastSupply, forecastDemand, forecastPrice, getSupplyMetrics, getDemandMetrics } from '../src/services/forecastService'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const input = { preparedDatasetId: 49, targetDate: '2024-09-29' }
const base = { status: 'available', ...input, sourceDatasetId: 68 }
const supply = { ...base, forecastType: 'generation_availability_proxy', target: 'energia_kwh', unit: 'kWh', horizonPeriods: 24,
  modelId: 'xm-gene-ridge', modelVersion: '1.0.0', predictions: Array.from({ length: 24 }, (_, i) => ({ hora_xm: i + 1, energia_kwh: 10 + i / 100 })) }
const demand = { ...base, forecastType: 'aggregate_demand_proxy', target: 'demanda_kwh', unit: 'kWh', horizonDays: 1,
  modelId: 'xm-demandasin-ridge', modelVersion: '1.0.0', prediction: { demanda_kwh: 120.123 }, confidence: null, confidenceStatus: 'not_defined' }
const price = { ...base, forecastType: 'market_reference_price', target: 'precio_cop_kwh', unit: 'COP/kWh', granularity: 'hourly', horizonDays: 1,
  rule: { id: 'xm-preciobolsnaci-b1', version: '1.0.0', type: 'deterministic_baseline', description: 'same period previous day' },
  predictions: Array.from({ length: 24 }, (_, i) => ({ periodo: i + 1, precio_cop_kwh: i === 0 ? 0 : i - 2.25 })),
  factors: { used: ['previous_day_same_period_price'], omitted: ['commercial_supply', 'commercial_demand', 'generation_forecast', 'demand_forecast'] },
  scope: { referencePrice: true, personalized: false, financialSettlement: false, commercialNegotiation: false },
  trace: { executionId: '1fbd029a-21e9-4322-ae1b-7838d7511eed', persistence: 'persisted', conditionsCompleteness: 'partial' } }
const range = { start: '2024-01-01', end: '2024-03-30' }
const metrics = { status: 'available', modelId: 'xm-gene-ridge', modelVersion: '1.0.0', active: true, unit: 'kWh',
  forecastType: 'generation_availability_proxy', target: 'energia_kwh', horizonPeriods: 24,
  training: { trainedAt: null, trainedAtStatus: 'not_recorded', snapshotSha256: 'a'.repeat(64), sourceRange: range, effectiveRange: range },
  evaluation: { type: 'external_temporal_holdout', range, snapshotSha256: 'b'.repeat(64), evaluable: 720, unavailable: 0,
    MAE: { value: 2, unit: 'kWh' }, RMSE: { value: 3, unit: 'kWh' }, bias: { value: -1, unit: 'kWh' }, percentageError: { metric: 'WAPE', value: 1.5, unit: 'percent' } } }
const demandMetrics = { ...metrics, modelId: 'xm-demandasin-ridge', forecastType: 'aggregate_demand_proxy', target: 'demanda_kwh', horizonDays: 1,
  training: { ...metrics.training, effectiveRows: 337 }, scope: { aggregation: 'SIN', personalized: false, zonalFallback: false, confidenceStatus: 'not_defined' } }
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function respond(body: unknown, status = 200) {
  return spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

test('supply parsing and POST JSON use shared apiClient without changing numeric values', async () => {
  const fetch = respond(supply)
  expect(await forecastSupply(input)).toEqual(supply)
  const [url, init] = fetch.mock.calls[0]!
  expect(url).toBe('http://enertrade.test/forecasts/supply')
  expect(init?.method).toBe('POST'); expect(JSON.parse(String(init?.body))).toEqual(input)
})
test('demand parsing preserves null confidence', async () => { respond(demand); expect(await forecastDemand(input)).toEqual(demand) })
test('price parsing preserves trace, zero/negative prices and partial conditions', async () => { respond(price); expect(await forecastPrice(input)).toEqual(price) })
test('trace failure does not discard a valid price result', async () => {
  const value = { ...price, trace: { executionId: null, persistence: 'failed' } }
  respond(value); expect(await forecastPrice(input)).toEqual(value)
})
test.each([null, {}, { ...supply, targetDate: '2024-09-28' }, { ...supply, preparedDatasetId: 33 },
  { ...supply, predictions: supply.predictions.slice(1) }, { ...supply, predictions: supply.predictions.map(r => ({ ...r, hora_xm: 1 })) },
  { ...supply, predictions: supply.predictions.map(r => ({ ...r, energia_kwh: '10' })) }])('rejects invalid supply response %j', async value => {
  respond(value); await expect(forecastSupply(input)).rejects.toMatchObject({ kind: 'response', status: 200 })
})
test.each([{ ...price, trace: null }, { ...price, trace: { executionId: null, persistence: 'persisted', conditionsCompleteness: 'partial' } },
  { ...price, unit: 'kWh' }, { ...price, predictions: [] }])('rejects invalid price response %j', async value => {
  respond(value); await expect(forecastPrice(input)).rejects.toBeInstanceOf(ApiError)
})
test('supply metrics are GET without body; all evaluation fields are retained', async () => {
  const fetch = respond(metrics); expect(await getSupplyMetrics()).toEqual(metrics)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/forecasts/supply/metrics')
  expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined()
})
test('demand metrics retain effective rows and aggregated scope', async () => {
  const fetch = respond(demandMetrics); expect(await getDemandMetrics()).toEqual(demandMetrics)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/forecasts/demand/metrics')
})
test.each([{ ...metrics, evaluation: { ...metrics.evaluation, MAE: 2 } },
  { ...metrics, training: { ...metrics.training, trainedAt: 'invented' } },
  { ...metrics, evaluation: { ...metrics.evaluation, percentageError: { metric: 'MAPE', value: 1, unit: 'percent' } } }])('rejects invalid metrics %j', async value => {
  respond(value); await expect(getSupplyMetrics()).rejects.toMatchObject({ kind: 'response' })
})
test.each([400, 404, 409, 422, 500])('retains safe backend error and HTTP %i', async status => {
  respond({ error: 'FORECAST_DATA_INSUFFICIENT', message: 'No hay datos históricos suficientes.', status: 'unavailable' }, status)
  await expect(forecastSupply(input)).rejects.toMatchObject({ kind: 'http', status, code: 'FORECAST_DATA_INSUFFICIENT', serverMessage: 'No hay datos históricos suficientes.' })
})
test('backend stack is not exposed', async () => {
  respond({ error: 'FORECAST_FAILED', message: 'private detail', stack: 'secret stack' }, 500)
  await expect(forecastPrice(input)).rejects.toMatchObject({ status: 500, serverMessage: null })
})
test('non-JSON and network failures are typed safely', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<html>private</html>'))
  await expect(getSupplyMetrics()).rejects.toMatchObject({ kind: 'response' })
  fetch.mockRejectedValueOnce(new Error('internal host'))
  await expect(getDemandMetrics()).rejects.toMatchObject({ kind: 'network', serverMessage: null })
})
test('Predictions initially renders compatible dataset selectors and no mock results/recommendations', () => {
  const fetch = spyOn(globalThis, 'fetch')
  const html = renderToStaticMarkup(<Predictions />)
  expect(html).toContain('Oferta energética'); expect(html).toContain('Demanda energética'); expect(html).toContain('Precio de referencia')
  expect(html.match(/Sin pronóstico solicitado/g)).toHaveLength(3)
  expect(html.match(/Selecciona un dataset preparado/g)).toHaveLength(3)
  expect(html).not.toMatch(/Recomendaciones|Produccion|v1\.8\.2|DS-2026|915\.15174|value="17"|value="33"|value="49"/)
  expect(fetch).not.toHaveBeenCalled()
  for (const file of ['../src/pages/Predictions.tsx', '../src/components/forecasts/ForecastPanel.tsx']) {
    expect(readFileSync(new URL(file, import.meta.url), 'utf8')).not.toMatch(/mockData|resolveMock|aiRecommendations|forecastPoints|techStats|techTrace/)
  }
})

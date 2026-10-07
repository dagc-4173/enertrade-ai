import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { Predictions } from '../src/pages/Predictions'
import { ApiError } from '../src/services/apiClient'
import { forecastSupply, forecastDemand, forecastPrice, getSupplyMetrics, getDemandMetrics } from '../src/services/forecastService'
import { getForecastAvailability, parseForecastAvailability } from '../src/services/forecastAvailabilityService'
import { ForecastAvailabilityView, ForecastPanel, ForecastRunOutcome, ResultView } from '../src/components/forecasts/ForecastPanel'
import { exceedsSupportedHorizon, horizonMessage, lastForecastDate, selectedHorizonDays } from '../src/utils/forecastAvailability'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
// HU-04/HU-06 usan targetDate; Precio B1 conserva preparedDatasetId.
const input = { preparedDatasetId: 49, targetDate: '2024-09-29' }
const demandInput = { targetDate: '2026-09-24' }
const supplyInput = { targetDate: '2026-09-24' }
const base = { status: 'available', ...input, sourceDatasetId: 68 }
const supply = { status: 'available', forecastOriginDate: '2026-09-20', targetDate: supplyInput.targetDate, horizonDays: 4,
  sourceArtifacts: [{ preparedDatasetId: 21, sourceDatasetId: 40 }, { preparedDatasetId: 22, sourceDatasetId: 41 }],
  forecastType: 'generation_availability_proxy', target: 'energia_kwh', unit: 'kWh', horizonPeriods: 24,
  modelId: 'xm-gene-ridge-direct-h4-v2', modelVersion: '1.0.0-experimental', modelStatus: 'experimental', academicValidation: 'pending', predictions: Array.from({ length: 24 }, (_, i) => ({ hora_xm: i + 1, energia_kwh: 10 + i / 100 })) }
const demand = { status: 'available', ...demandInput, forecastOriginDate: '2026-09-20', sourceArtifacts: [{ preparedDatasetId: 49, sourceDatasetId: 68 }], forecastType: 'aggregate_demand_proxy', target: 'demanda_kwh', unit: 'kWh', horizonDays: 4,
  modelId: 'xm-demandasin-ridge-direct-h4-v2', modelVersion: '1.0.0-experimental', modelStatus: 'experimental', academicValidation: 'pending', prediction: { demanda_kwh: 120.123 }, confidence: null, confidenceStatus: 'not_defined' }
const price = { ...base, forecastType: 'market_reference_price', target: 'precio_cop_kwh', unit: 'COP/kWh', granularity: 'hourly', horizonDays: 1,
  rule: { id: 'xm-preciobolsnaci-b1', version: '1.0.0', type: 'deterministic_baseline', description: 'same period previous day' },
  predictions: Array.from({ length: 24 }, (_, i) => ({ periodo: i + 1, precio_cop_kwh: i === 0 ? 0 : i - 2.25 })),
  factors: { used: ['previous_day_same_period_price'], omitted: ['commercial_supply', 'commercial_demand', 'generation_forecast', 'demand_forecast'] },
  scope: { referencePrice: true, personalized: false, financialSettlement: false, commercialNegotiation: false },
  trace: { executionId: '1fbd029a-21e9-4322-ae1b-7838d7511eed', persistence: 'persisted', conditionsCompleteness: 'partial' } }
const range = { start: '2024-01-01', end: '2024-03-30' }
const metrics = { status: 'available', modelId: 'xm-gene-ridge-direct-h4-v2', modelVersion: '1.0.0-experimental', active: true, modelStatus: 'experimental', academicValidation: 'pending', unit: 'kWh',
  forecastType: 'generation_availability_proxy', target: 'energia_kwh', horizonPeriods: 24, horizonDays: 4, baselineReference: 'B_HISTORICAL_MEAN',
  training: { trainedAt: null, trainedAtStatus: 'not_recorded', snapshotSha256: 'a'.repeat(64), sourceRange: range, effectiveRange: range },
  evaluation: { type: 'external_temporal_holdout', range, snapshotSha256: 'b'.repeat(64), evaluable: 720, unavailable: 0,
    MAE: { value: 2, unit: 'kWh' }, RMSE: { value: 3, unit: 'kWh' }, bias: { value: -1, unit: 'kWh' }, percentageError: { metric: 'WAPE', value: 1.5, unit: 'percent' } } }
const demandMetrics = { ...metrics, modelId: 'xm-demandasin-ridge-direct-h4-v2', forecastType: 'aggregate_demand_proxy', target: 'demanda_kwh', horizonDays: 4,
  evaluationType: 'retrospective_technical', validationRange: range, retrospectiveEvaluationRange: range, evaluation: { ...metrics.evaluation, type: 'retrospective_technical' }, scope: { aggregation: 'SIN', personalized: false, zonalFallback: false, confidenceStatus: 'not_defined' } }
const availability = [
  { series: 'Gene', currentDate: '2026-09-20', latestObservationDate: '2026-09-20', latestReceivedDate: '2026-09-20', latestIndividuallyUsableDate: '2026-09-20', semanticExcludedDates: [], eligibleFutureTargetDates: ['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27'], nextForecastDate: '2026-09-21', supportedHorizonDays: 7, modelMinTargetDate: '2026-09-21', modelMaxTargetDate: '2026-09-27', effectiveFutureMinDate: '2026-09-21', effectiveFutureMaxDate: '2026-09-27', hasFutureForecastWindow: true, dataFreshnessDays: 0 },
  { series: 'DemaSIN', currentDate: '2026-10-01', latestObservationDate: '2026-09-27', latestReceivedDate: '2026-09-29', latestIndividuallyUsableDate: '2026-09-27', semanticExcludedDates: ['2026-09-16','2026-09-28','2026-09-29'], eligibleFutureTargetDates: [], nextForecastDate: '2026-10-02', supportedHorizonDays: 6, supportedHorizonMinDays: 1, supportedHorizonMaxDays: 6, modelMinTargetDate: '2026-09-28', modelMaxTargetDate: '2026-10-03', effectiveFutureMinDate: null, effectiveFutureMaxDate: null, hasFutureForecastWindow: false, dataFreshnessDays: 4 },
  { series: 'PrecBolsNaci', currentDate: '2026-09-20', latestObservationDate: '2026-09-15', latestReceivedDate: '2026-09-15', latestIndividuallyUsableDate: '2026-09-15', semanticExcludedDates: [], eligibleFutureTargetDates: [], nextForecastDate: '2026-09-16', supportedHorizonDays: 1, modelMinTargetDate: '2026-09-16', modelMaxTargetDate: '2026-09-16', effectiveFutureMinDate: null, effectiveFutureMaxDate: null, hasFutureForecastWindow: false, dataFreshnessDays: 5 },
]
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function respond(body: unknown, status = 200) {
  return spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

test('HU-04: supply parsing and POST JSON send only targetDate', async () => {
  const fetch = respond(supply)
  expect(await forecastSupply(supplyInput)).toEqual(supply)
  const [url, init] = fetch.mock.calls[0]!
  expect(url).toBe('http://enertrade.test/forecasts/supply')
  expect(init?.method).toBe('POST'); expect(JSON.parse(String(init?.body))).toEqual(supplyInput)
})
test('demand parsing preserves direct h4, null confidence and target-only POST', async () => { const fetch = respond(demand); expect(await forecastDemand(demandInput)).toEqual(demand); expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual(demandInput) })
test('price parsing preserves trace, zero/negative prices and partial conditions', async () => { respond(price); expect(await forecastPrice(input)).toEqual(price) })
test('trace failure does not discard a valid price result', async () => {
  const value = { ...price, trace: { executionId: null, persistence: 'failed' } }
  respond(value); expect(await forecastPrice(input)).toEqual(value)
})
test.each([null, {}, { ...supply, targetDate: '2024-09-28' }, { ...supply, sourceArtifacts: [] },
  { ...supply, sourceArtifacts: [{ preparedDatasetId: 0, sourceDatasetId: 40 }] },
  { ...supply, predictions: supply.predictions.slice(1) }, { ...supply, predictions: supply.predictions.map(r => ({ ...r, hora_xm: 1 })) },
  { ...supply, predictions: supply.predictions.map(r => ({ ...r, energia_kwh: '10' })) }])('rejects invalid supply response %j', async value => {
  respond(value); await expect(forecastSupply(supplyInput)).rejects.toMatchObject({ kind: 'response', status: 200 })
})
test.each([{ ...price, trace: null }, { ...price, trace: { executionId: null, persistence: 'persisted', conditionsCompleteness: 'partial' } },
  { ...price, unit: 'kWh' }, { ...price, predictions: [] }])('rejects invalid price response %j', async value => {
  respond(value); await expect(forecastPrice(input)).rejects.toBeInstanceOf(ApiError)
})
test('supply metrics are GET without body; all evaluation fields are retained', async () => {
  const fetch = respond(metrics); expect(await getSupplyMetrics(4)).toEqual(metrics)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/forecasts/supply/metrics?horizonDays=4')
  expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined()
})
test('demand metrics select horizon and retain retrospective technical scope', async () => {
  const fetch = respond(demandMetrics); expect(await getDemandMetrics(4)).toEqual(demandMetrics)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/forecasts/demand/metrics?horizonDays=4')
})
test('forecast availability is authenticated and preserves Gene D+7, Demand D+6, Price D+1', async () => {
  const fetch = respond({ availability })
  expect(await getForecastAvailability()).toEqual(availability)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/forecast-availability')
  expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('include')
  expect(() => parseForecastAvailability({ availability: [...availability, availability[0]] })).toThrow('formato inesperado')
  expect(() => parseForecastAvailability({ availability: [{ ...availability[0], nextForecastDate: '2026-09-15' }] })).toThrow('formato inesperado')
})
test.each([{ ...metrics, evaluation: { ...metrics.evaluation, MAE: 2 } },
  { ...metrics, training: { ...metrics.training, trainedAt: 'invented' } },
  { ...metrics, evaluation: { ...metrics.evaluation, percentageError: { metric: 'MAPE', value: 1, unit: 'percent' } } }])('rejects invalid metrics %j', async value => {
  respond(value); await expect(getSupplyMetrics(4)).rejects.toMatchObject({ kind: 'response' })
})
test.each([400, 404, 409, 422, 500])('retains safe backend error and HTTP %i', async status => {
  respond({ error: 'FORECAST_DATA_INSUFFICIENT', message: 'No hay datos históricos suficientes.', status: 'unavailable' }, status)
  await expect(forecastSupply(supplyInput)).rejects.toMatchObject({ kind: 'http', status, code: 'FORECAST_DATA_INSUFFICIENT', serverMessage: 'No hay datos históricos suficientes.' })
})
test('HU04-MULTI-03/04/10: supply keeps FORECAST_DATA_INSUFFICIENT visible with its exact backend code and message', async () => {
  respond({ status: 'unavailable', error: 'FORECAST_DATA_INSUFFICIENT', message: 'No hay datos históricos suficientes para pronosticar el día solicitado.' }, 422)
  await expect(forecastSupply(supplyInput)).rejects.toMatchObject({ kind: 'http', status: 422, code: 'FORECAST_DATA_INSUFFICIENT', serverMessage: 'No hay datos históricos suficientes para pronosticar el día solicitado.' })
})
test('HU04-MULTI-06: supply keeps PREPARED_DATASET_INCONSISTENT visible for conflicting cross-artifact history', async () => {
  respond({ error: 'PREPARED_DATASET_INCONSISTENT', message: 'El contenido del dataset preparado es inconsistente.' }, 409)
  await expect(forecastSupply(supplyInput)).rejects.toMatchObject({ kind: 'http', status: 409, code: 'PREPARED_DATASET_INCONSISTENT', serverMessage: 'El contenido del dataset preparado es inconsistente.' })
})
test('direct supply calls retain FORECAST_HORIZON_NOT_SUPPORTED and its domain message', async () => {
  const message = 'Los modelos experimentales de Oferta admiten hasta 7 días de horizonte. La última observación disponible es 20/09/2026. El rango pronosticable actual es 21/09/2026 a 27/09/2026.'
  respond({ error: 'FORECAST_HORIZON_NOT_SUPPORTED', message }, 422)
  await expect(forecastSupply({ targetDate: '2026-09-28' })).rejects.toMatchObject({ kind: 'http', status: 422, code: 'FORECAST_HORIZON_NOT_SUPPORTED', serverMessage: message })
})
test('backend stack is not exposed', async () => {
  respond({ error: 'FORECAST_FAILED', message: 'private detail', stack: 'secret stack' }, 500)
  await expect(forecastPrice(input)).rejects.toMatchObject({ status: 500, serverMessage: null })
})
test('non-JSON and network failures are typed safely', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<html>private</html>'))
  await expect(getSupplyMetrics(1)).rejects.toMatchObject({ kind: 'response' })
  fetch.mockRejectedValueOnce(new Error('internal host'))
  await expect(getDemandMetrics(1)).rejects.toMatchObject({ kind: 'network', serverMessage: null })
})
test('Predictions initially renders fecha objetivo; only Precio requires prepared dataset', () => {
  const fetch = spyOn(globalThis, 'fetch')
  const html = renderToStaticMarkup(<Predictions />)
  expect(html).toContain('Oferta energética'); expect(html).toContain('Demanda energética'); expect(html).toContain('Precio de referencia')
  expect(html.match(/Sin pronóstico solicitado/g)).toHaveLength(3)
  expect(html.match(/Solicitud al backend/g)).toHaveLength(3)
  expect(html.match(/Horizonte seleccionado/g)).toHaveLength(3)
  expect(html).toContain('Regla determinista · B1')
  expect(html).toContain('Baseline determinista de referencia')
  expect(html).not.toMatch(/xm-demandasin-ridge-direct-h[1-6]|xm-preciobolsnaci-ridge-direct|pendingProspectiveValidation/)
  expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3)
  expect(html.match(/Selecciona un dataset preparado/g)).toHaveLength(1)
  expect(html).not.toMatch(/Recomendaciones|Produccion|v1\.8\.2|DS-2026|915\.15174|value="17"|value="33"|value="49"/)
  expect(fetch).not.toHaveBeenCalled()
  for (const file of ['../src/pages/Predictions.tsx', '../src/components/forecasts/ForecastPanel.tsx']) {
    expect(readFileSync(new URL(file, import.meta.url), 'utf8')).not.toMatch(/mockData|resolveMock|aiRecommendations|forecastPoints|techStats|techTrace/)
  }
})
test('Oferta y Demanda resuelven preparados automáticamente; Precio conserva selector', () => {
  const supplyHtml = renderToStaticMarkup(<ForecastPanel kind="supply" />)
  expect(supplyHtml).toContain('Fecha objetivo')
  expect(supplyHtml).toContain('Elige una fecha objetivo.')
  expect(supplyHtml).not.toContain('Dataset preparado compatible')
  expect(supplyHtml).not.toContain('Selecciona un dataset preparado')
  const demandHtml = renderToStaticMarkup(<ForecastPanel kind="demand" />)
  expect(demandHtml).not.toContain('Dataset preparado compatible')
  const priceHtml = renderToStaticMarkup(<ForecastPanel kind="price" />)
  expect(priceHtml).toContain('Dataset preparado compatible')
})
test('Oferta availability renders experimental D+1..D+7 range and blocks D+8', () => {
  const gene = availability[0]!
  const html = renderToStaticMarkup(<ForecastAvailabilityView state={{ kind: 'success', availability: gene }} />)
  expect(html).toContain('Últimos datos disponibles'); expect(html).toContain('20/09/2026')
  expect(html).toContain('Horizonte experimental soportado'); expect(html).toContain('1 a 7 días')
  expect(html).toContain('Rango futuro disponible'); expect(html).toContain('21/09/2026'); expect(html).toContain('27/09/2026')
  for (const [date,horizon] of [['2026-09-21',1],['2026-09-24',4],['2026-09-27',7]] as const) { expect(exceedsSupportedHorizon(date, gene)).toBe(false); expect(selectedHorizonDays(date,gene)).toBe(horizon) }
  expect(lastForecastDate(gene)).toBe('2026-09-27'); expect(exceedsSupportedHorizon('2026-09-28', gene)).toBe(true)
  expect(horizonMessage(gene)).toContain('hasta 7 días de horizonte')
  expect(horizonMessage(gene)).not.toContain('datos históricos insuficientes')
})
test('Demanda availability distinguishes received XM data from semantically usable observations', () => {
  const html = renderToStaticMarkup(<ForecastAvailabilityView state={{ kind: 'success', availability: availability[1]! }} />)
  expect(html).toContain('Últimos datos recibidos'); expect(html).toContain('29/09/2026')
  expect(html).toContain('Última observación utilizable'); expect(html).toContain('27/09/2026')
  expect(html).toContain('Fechas en revisión semántica de EnerTrade AI')
  for (const date of ['16/09/2026','28/09/2026','29/09/2026']) expect(html).toContain(date)
  expect(html).toContain('todas sus observaciones fuente utilizables')
  expect(html).toContain('1 a 6 días')
  expect(html).toContain('Rango futuro disponible')
})
test('Demanda respeta target elegible con huecos y horizonte desde origen, no desde currentDate', () => {
  const demandAvailability = { ...availability[1]!, currentDate: '2026-09-20', latestObservationDate: '2026-09-20', latestReceivedDate: '2026-09-20', latestIndividuallyUsableDate: '2026-09-20', modelMinTargetDate: '2026-09-21', modelMaxTargetDate: '2026-09-26', nextForecastDate: '2026-09-21', eligibleFutureTargetDates: ['2026-09-21', '2026-09-24', '2026-09-26'], effectiveFutureMinDate: '2026-09-21', effectiveFutureMaxDate: '2026-09-26', hasFutureForecastWindow: true }
  expect(selectedHorizonDays('2026-09-24', demandAvailability)).toBe(4)
  expect(selectedHorizonDays('2026-09-26', demandAvailability)).toBe(6)
  expect(exceedsSupportedHorizon('2026-09-23', demandAvailability)).toBe(true)
  expect(exceedsSupportedHorizon('2026-09-26', demandAvailability)).toBe(false)
  expect(exceedsSupportedHorizon('2026-09-27', demandAvailability)).toBe(true)
  expect(renderToStaticMarkup(<ForecastAvailabilityView state={{ kind: 'success', availability: demandAvailability }} />)).toContain('Fechas objetivo elegibles')
})
test('Demanda consulta métricas h6 sin reutilizar h4', async () => {
  const value = { ...demandMetrics, modelId: 'xm-demandasin-ridge-direct-h6-v2', horizonDays: 6 }
  const fetch = respond(value)
  expect(await getDemandMetrics(6)).toEqual(value)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/forecasts/demand/metrics?horizonDays=6')
})
test('ForecastRunOutcome expresa loading, éxito con 24 predicciones y trazabilidad, e insuficiencia/inconsistencia sin ocultar el código', () => {
  const loadingHtml = renderToStaticMarkup(<ForecastRunOutcome title="Oferta energética" state={{ kind: 'loading' }} />)
  expect(loadingHtml).toContain('role="status"'); expect(loadingHtml).toContain('Cargando... Consultando oferta energética.')

  const idleHtml = renderToStaticMarkup(<ForecastRunOutcome title="Oferta energética" state={{ kind: 'idle' }} />)
  expect(idleHtml).toContain('Sin pronóstico solicitado.')

  const insufficientHtml = renderToStaticMarkup(<ForecastRunOutcome title="Oferta energética" state={{ kind: 'error', message: 'No hay datos históricos suficientes para pronosticar el día solicitado.' }} />)
  expect(insufficientHtml).toContain('role="alert"'); expect(insufficientHtml).toContain('No hay datos históricos suficientes para pronosticar el día solicitado.')

  const inconsistentHtml = renderToStaticMarkup(<ForecastRunOutcome title="Oferta energética" state={{ kind: 'error', message: 'El contenido del dataset preparado es inconsistente.' }} />)
  expect(inconsistentHtml).toContain('El contenido del dataset preparado es inconsistente.')

  const successHtml = renderToStaticMarkup(<ForecastRunOutcome title="Oferta energética" state={{ kind: 'success', result: supply }} />)
  expect(successHtml).toContain('Resultado disponible para')
  expect(successHtml.match(/<tr/g)).toHaveLength(25)
  expect(successHtml).toContain('Datasets preparados fuente')
  expect(successHtml).toContain('#21 (dataset 40)'); expect(successHtml).toContain('#22 (dataset 41)')
  expect(successHtml).toContain('xm-gene-ridge-direct-h4-v2'); expect(successHtml).toContain('Experimental'); expect(successHtml).toContain('Pendiente'); expect(successHtml).toContain('4 días')
})
test('ResultView Demanda usa fuentes trazables, origen, h4 y estado experimental', () => {
  const html = renderToStaticMarkup(<ResultView result={demand} />)
  expect(html).toContain('Datasets preparados fuente'); expect(html).toContain('#49 (dataset 68)')
  expect(html).toContain('xm-demandasin-ridge-direct-h4-v2'); expect(html).toContain('1.0.0-experimental')
  expect(html).toContain('20/09/2026'); expect(html).toContain('4 días')
  expect(html).toContain('Experimental'); expect(html).toContain('Pendiente')
  expect(html).toContain('Día XM'); expect(html).toContain('Demanda estimada (kWh)')
  expect(html.match(/<tr/g)).toHaveLength(2)
  expect(html).not.toContain('xm-demandasin-ridge-direct-h7')
  expect(html).not.toContain('<dd>xm-demandasin-ridge</dd>')
})
test('Precio B1 presenta versión real, origen D-1, 24 periodos y ningún modelo HU-08 offline', () => {
  const html = renderToStaticMarkup(<ResultView result={price} />)
  expect(html).toContain('xm-preciobolsnaci-b1')
  expect(html).toContain('Determinista / baseline')
  expect(html).toContain('28/09/2024')
  expect(html).toContain('1 día · 24 periodos')
  expect(html).toContain('Precio estimado (COP/kWh)')
  expect(html.match(/<tr/g)).toHaveLength(25)
  expect(html).not.toMatch(/v1-exogenous|v2-exogenous|v3-exogenous|v4-gene-only/)
})
test('Availability común conserva etiquetas, aviso sin target y error', () => {
  const priceHtml = renderToStaticMarkup(<ForecastAvailabilityView state={{ kind: 'success', availability: availability[2]! }} />)
  expect(priceHtml).toContain('Fecha actual'); expect(priceHtml).toContain('Últimos datos disponibles')
  expect(priceHtml).toContain('Horizonte activo'); expect(priceHtml).toContain('1 día')
  expect(priceHtml).toContain('No hay target futuro disponible.')
  const errorHtml = renderToStaticMarkup(<ForecastAvailabilityView state={{ kind: 'error', message: 'Sin conexión' }} />)
  expect(errorHtml).toContain('role="alert"'); expect(errorHtml).toContain('Error de disponibilidad')
  expect(renderToStaticMarkup(<ForecastRunOutcome title="Precio de referencia" state={{ kind: 'error', message: 'Sin conexión' }} />)).toContain('Error de forecast')
})

function v5MetricsResponse(horizonDays: number) {
  const frozen = JSON.parse(readFileSync(new URL(`../../backend/src/models/xm-demandasin-ridge-direct-h${horizonDays}-v5/1.0.0/model.json`, import.meta.url), 'utf8'))
  return { status: 'available', modelId: frozen.modelId, modelVersion: frozen.modelVersion, active: true,
    modelStatus: 'experimental', academicValidation: 'pending', modelState: frozen.state,
    forecastType: 'aggregate_demand_proxy', target: 'demanda_kwh', unit: 'kWh', horizonDays,
    evaluationType: 'validation_technical', validationRange: frozen.validationRange, baselineReference: frozen.baselineReference,
    training: { trainedAt: null, trainedAtStatus: 'not_recorded', snapshotSha256: frozen.corpusHash, sourceRange: frozen.trainingRange, effectiveRange: frozen.trainingRange },
    evaluation: { type: 'validation_technical', range: frozen.validationRange, snapshotSha256: frozen.corpusHash,
      evaluable: frozen.validationMetrics.evaluable, unavailable: frozen.validationMetrics.unavailable,
      MAE: { value: frozen.validationMetrics.MAE, unit: 'kWh' }, RMSE: { value: frozen.validationMetrics.RMSE, unit: 'kWh' },
      bias: { value: frozen.validationMetrics.bias, unit: 'kWh' }, percentageError: { metric: 'WAPE', value: frozen.validationMetrics.WAPE, unit: 'percent' },
      maxAbsoluteError: { value: frozen.validationMetrics.maxAbsoluteErrorKwh, unit: 'kWh' } },
    scope: { aggregation: 'SIN', personalized: false, zonalFallback: false, confidenceStatus: 'not_defined' } }
}

test.each([1, 2, 3, 4, 5, 6])('parser accepts frozen V5 h%s metrics as VALIDATION, not retrospective or prospective validation', async horizon => {
  const value = v5MetricsResponse(horizon), fetch = respond(value)
  expect(await getDemandMetrics(horizon)).toEqual(value)
  expect(fetch.mock.calls[0]?.[0]).toBe(`http://enertrade.test/forecasts/demand/metrics?horizonDays=${horizon}`)
  expect(value).not.toHaveProperty('retrospectiveEvaluationRange')
})

test('parser rejects incorrect V5 metadata, wrong requested horizon, missing metric and h7', async () => {
  const value = v5MetricsResponse(4)
  const invalid = [{ ...value, modelState: 'validated' }, { ...value, modelId: 'xm-demandasin-ridge-direct-h4-v2' },
    { ...value, modelVersion: 'other' }, { ...value, horizonDays: 7, modelId: 'xm-demandasin-ridge-direct-h7-v5' },
    { ...value, evaluation: { ...value.evaluation, range: { start: '2026-06-01', end: '2026-09-29' } } },
    { ...value, evaluation: { ...value.evaluation, maxAbsoluteError: null } },
    { ...value, evaluationType: 'retrospective_technical', retrospectiveEvaluationRange: value.validationRange, evaluation: { ...value.evaluation, type: 'retrospective_technical' } }]
  for (const response of invalid) { respond(response); await expect(getDemandMetrics(4)).rejects.toMatchObject({ kind: 'response' }) }
  respond(v5MetricsResponse(5)); await expect(getDemandMetrics(4)).rejects.toMatchObject({ kind: 'response' })
})

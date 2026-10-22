import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HourlyDemandPanel, HourlyDemandResult } from '../src/components/forecasts/HourlyDemandPanel'
import { parseHourlyForecast, parseHourlyModels } from '../src/services/chronosHourlyService'

const historical = { range: { start: '2025-07-01', end: '2025-12-31' }, MAE: 166051, RMSE: 263990, WAPE_percent: 1.7193, coverageQ10Q90: .7111 }
const input = { model: 'chronos2' as const, targetDate: '2026-10-22' }
const result = { ...input, status: 'available', modelId: 'amazon/chronos-2', modelVersion: 'revision', forecastType: 'experimental_hourly_system_demand', unit: 'kWh', latestObservedDate: '2026-10-17', horizonDays: 5, generatedPeriods: 120, bridgePeriods: 96, generatedAt: '2026-10-21T06:00:00Z', historicalMetrics: historical, warnings: ['Intervalo experimental sin calibración prospectiva.'], trace: { executionId: 'evidence' }, predictions: Array.from({ length: 24 }, (_, i) => ({ periodo: i + 1, q10: 7, q50: 8, q90: 9 })) }
test('CHF-01: validate exact daily outputs and lag, reject corrupt quantiles', () => {
  expect(parseHourlyForecast(result, input).predictions).toHaveLength(24)
  expect(() => parseHourlyForecast({ ...result, bridgePeriods: 0 }, input)).toThrow()
  expect(() => parseHourlyForecast({ ...result, predictions: [...result.predictions.slice(1), result.predictions[0]] }, input)).toThrow()
  expect(() => parseHourlyForecast({ ...result, predictions: result.predictions.map(p => ({ ...p, q90: 1 })) }, input)).toThrow()
})
test('CHF-02: two model choices and configuration state', () => {
  expect(parseHourlyModels({ models: ['chronos2', 'bolt'].map(key => ({ key, name: key, modelId: key, revision: 'rev', configured: true, historicalMetrics: historical })) })).toHaveLength(2)
  expect(() => parseHourlyModels({ models: [] })).toThrow()
  const html = renderToStaticMarkup(<HourlyDemandPanel />)
  expect(html).toContain('Chronos-2'); expect(html).toContain('Chronos-Bolt Small'); expect(html).toContain('Experimental')
})
test('CHF-03: visible horizon, historical scope, interval caveat and 24-period chart', () => {
  const html = renderToStaticMarkup(<HourlyDemandResult result={parseHourlyForecast(result, input)} />)
  expect(html).toContain('5 días'); expect(html).toContain('120 periodos'); expect(html).toContain('96')
  expect(html).toContain('sin calibración prospectiva')
  expect(html).toContain('24'); expect(html).toContain('Evaluación histórica')
})

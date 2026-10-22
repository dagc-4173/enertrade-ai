import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HourlyDemandPanel, HourlyDemandResult } from '../src/components/forecasts/HourlyDemandPanel'
import { parseHourlyForecast, parseHourlyModels } from '../src/services/chronosHourlyService'

for (const series of ['supply', 'price'] as const) {
  test(`CHMF-${series}: units, model choices and evaluation status stay with the variable`, () => {
    const input = { model: 'bolt' as const, targetDate: '2026-10-22' }, unit = series === 'price' ? 'COP/kWh' : 'kWh'
    const data = { ...input, series, status: 'available', modelId: 'amazon/chronos-bolt-small', modelVersion: 'revision', forecastType: `experimental_hourly_system_${series}`, unit, latestObservedDate: '2026-10-20', horizonDays: 2, generatedPeriods: 48, bridgePeriods: 24, generatedAt: '2026-10-21T06:00:00Z', historicalMetrics: null, warnings: [], trace: { executionId: 'evidence' }, predictions: Array.from({ length: 24 }, (_, i) => ({ periodo: i + 1, q10: 7, q50: 8, q90: 9 })) }
    const result = parseHourlyForecast(data, input, series)
    expect(() => parseHourlyForecast(data, input)).toThrow()
    expect(() => parseHourlyForecast({ ...data, unit: 'MWh' }, input, series)).toThrow()
    const html = renderToStaticMarkup(<HourlyDemandResult result={result} series={series} />)
    expect(html).toContain('Evaluación histórica específica pendiente')
    expect(html).toContain(unit)
    const panel = renderToStaticMarkup(<HourlyDemandPanel series={series} />)
    expect(panel).toContain('Chronos-2'); expect(panel).toContain('Chronos-Bolt Small')
    expect(panel).toContain(series === 'price' ? 'Precio horario' : 'Oferta horaria')
    expect(parseHourlyModels({ models: ['bolt', 'chronos2'].map(key => ({ key, name: key, modelId: key, revision: 'rev', configured: true, series, unit, historicalMetrics: null })) }, series)).toHaveLength(2)
  })
}

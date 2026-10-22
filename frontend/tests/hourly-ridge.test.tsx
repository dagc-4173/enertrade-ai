import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HourlyDemandPanel } from '../src/components/forecasts/HourlyDemandPanel'
import { HourlyRidgeResult } from '../src/components/forecasts/HourlyRidgeResult'
import { parseRidgeAvailability, parseRidgeHourly } from '../src/services/hourlyRidgeService'
for (const series of ['demand', 'price'] as const) {
  const result = { status: 'available', method: 'ridge', series, source: series === 'price' ? 'XM PrecBolsNaci/Sistema' : 'XM DemaReal/Sistema', target: series === 'price' ? 'precio_cop_kwh' : 'demanda_real_kwh', unit: series === 'price' ? 'COP/kWh' : 'kWh', modelId: `xm-${series === 'price' ? 'preciobolsnaci' : 'demareal'}-ridge-direct-h5-v1`, modelVersion: '1.0.0-experimental', artifactSha256: 'a'.repeat(64), targetDate: '2026-10-22', latestObservedDate: '2026-10-17', horizonDays: 5, generatedAt: '2026-10-21T08:00:00Z', predictions: Array.from({ length: 24 }, (_, i) => ({ periodo: i + 1, value: 100 + i })), referenceDay: { date: '2026-10-17', values: Array.from({ length: 24 }, (_, i) => ({ periodo: i + 1, value: 90 + i })) }, historicalMetrics: { MAE: 10, RMSE: 12, WAPE_percent: 2, n: 4344, horizonDays: 5, range: { start: '2025-01-01', end: '2025-06-30' }, evaluationType: series === 'price' ? 'external_temporal_holdout' : 'validation_technical' }, warnings: ['Sin intervalo probabilístico.'], trace: { executionId: 'fixture' } }
  test(`RHUI-${series}-01: strict hourly identity, unit, horizon and reference contract`, () => {
    expect(parseRidgeHourly(result, series, result.targetDate).predictions).toHaveLength(24)
    for (const changed of [{ unit: 'MWh' }, { modelId: 'other' }, { horizonDays: 4 }, { predictions: result.predictions.slice(1) }, { referenceDay: { ...result.referenceDay, date: result.targetDate } }, { historicalMetrics: { ...result.historicalMetrics, horizonDays: 1 } }]) expect(() => parseRidgeHourly({ ...result, ...changed }, series, result.targetDate)).toThrow()
    expect(() => parseRidgeAvailability({ series, origin: '2026-10-17', supportedHorizons: [8], eligibleTargetDates: [] }, series)).toThrow()
  })
  test(`RHUI-${series}-02: Ridge choice and observed/forecast graph without invented quantiles`, () => {
    const panel = renderToStaticMarkup(<HourlyDemandPanel series={series} />)
    expect(panel).toContain('Ridge horario experimental'); expect(panel).toContain('Chronos-2')
    const html = renderToStaticMarkup(<HourlyRidgeResult result={parseRidgeHourly(result, series, result.targetDate)} />)
    expect(html).toContain('Observado en el origen'); expect(html).toContain('Pronóstico Ridge'); expect(html).toContain('Son días diferentes')
    expect(html).toContain('Métricas del modelo activo'); expect(html).toContain(result.unit)
    expect(html).not.toContain('Cuantil 90'); expect(html).toContain('24 periodos')
  })
}

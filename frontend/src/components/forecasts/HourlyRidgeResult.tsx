import { ForecastSavedNotice } from './ForecastSavedNotice'
import { ModelPerformance } from './ModelPerformance'
import { ForecastInsights } from './ForecastInsights'
import { xmPeriodLabel } from '../../utils/forecastInsights'
import type { RidgeHourlyResult } from '../../services/hourlyRidgeService'
import { SeriesChart } from '../charts/SeriesChart'
import { formatDateCO, formatEnergyKWh, formatPriceCOPPerKWh } from '../../utils/numberFormat'
export function HourlyRidgeResult({ result, elapsedMs }: { result: RidgeHourlyResult; elapsedMs?: number }) {
  const format = result.series === 'price' ? formatPriceCOPPerKWh : formatEnergyKWh, m = result.historicalMetrics
  return <div className="forecast-result">
    <ForecastSavedNotice history={result.history} />
    <p role="status">Pronóstico Ridge para {formatDateCO(result.targetDate)} · 24 periodos.</p>
    <details><summary>Modelo, origen y trazabilidad</summary><dl className="forecast-metadata">
      <div><dt>Modelo</dt><dd>{result.modelId}</dd></div><div><dt>Versión</dt><dd>{result.modelVersion}</dd></div>
      <div><dt>Origen observado</dt><dd>{formatDateCO(result.latestObservedDate)}</dd></div><div><dt>Horizonte desde el origen</dt><dd>{result.horizonDays} días</dd></div>
      <div><dt>Fuente</dt><dd>{result.source}</dd></div><div><dt>Estado</dt><dd>Experimental · validación pendiente</dd></div>
    </dl></details>
    <ModelPerformance name={result.modelId} version={result.modelVersion} source={result.source} unit={result.unit} metrics={m} evaluatedHorizon={m.horizonDays} selectedHorizon={result.horizonDays} elapsedMs={elapsedMs} />
    <ForecastInsights key={result.trace.executionId} series={result.series} targetDate={result.targetDate} originDate={result.latestObservedDate} rows={result.predictions.map(r=>({period:r.periodo,value:r.value}))} />
    <SeriesChart title={result.series === 'price' ? 'Precio observado y pronóstico Ridge' : 'Demanda observada y pronóstico Ridge'} description={`Referencia observada: ${formatDateCO(result.latestObservedDate)}. Pronóstico: ${formatDateCO(result.targetDate)}. Son días diferentes; no es una comparación con el valor real futuro.`} unit={result.unit} state={{ kind: 'success', lines: [
      { id: 'observed-origin', label: 'Observado en el origen', color: '#1e5945', points: result.referenceDay.values.map(r => ({ key: String(r.periodo), label: `P${r.periodo}`, value: r.value, detail: `${formatDateCO(result.latestObservedDate)} · ${xmPeriodLabel(r.periodo)}: ${format(r.value)}` })) },
      { id: 'ridge-target', label: 'Pronóstico Ridge', color: '#b98126', dash: '5 4', points: result.predictions.map(r => ({ key: String(r.periodo), label: `P${r.periodo}`, value: r.value, detail: `${formatDateCO(result.targetDate)} · ${xmPeriodLabel(r.periodo)}: ${format(r.value)}` })) },
    ] }} />
    <details><summary>Alcance y trazabilidad</summary>{result.warnings.map(w => <p key={w}>{w}</p>)}<p>Evidencia: {result.trace.executionId}</p></details>
  </div>
}

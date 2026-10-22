import type { RidgeHourlyResult } from '../../services/hourlyRidgeService'
import { SeriesChart } from '../charts/SeriesChart'
import { formatDateCO, formatEnergyKWh, formatPriceCOPPerKWh, formatPercentCO } from '../../utils/numberFormat'
export function HourlyRidgeResult({ result }: { result: RidgeHourlyResult }) {
  const format = result.series === 'price' ? formatPriceCOPPerKWh : formatEnergyKWh, m = result.historicalMetrics
  return <div className="forecast-result">
    <p role="status">Pronóstico Ridge para {formatDateCO(result.targetDate)} · 24 periodos.</p>
    <details><summary>Modelo, origen y trazabilidad</summary><dl className="forecast-metadata">
      <div><dt>Modelo</dt><dd>{result.modelId}</dd></div><div><dt>Versión</dt><dd>{result.modelVersion}</dd></div>
      <div><dt>Origen observado</dt><dd>{formatDateCO(result.latestObservedDate)}</dd></div><div><dt>Horizonte desde el origen</dt><dd>{result.horizonDays} días</dd></div>
      <div><dt>Fuente</dt><dd>{result.source}</dd></div><div><dt>Estado</dt><dd>Experimental · validación pendiente</dd></div>
    </dl></details>
    <SeriesChart title={result.series === 'price' ? 'Precio observado y pronóstico Ridge' : 'Demanda observada y pronóstico Ridge'} description={`Referencia observada: ${formatDateCO(result.latestObservedDate)}. Pronóstico: ${formatDateCO(result.targetDate)}. Son días diferentes; no es una comparación con el valor real futuro.`} unit={result.unit} state={{ kind: 'success', lines: [
      { id: 'observed-origin', label: 'Observado en el origen', color: '#1e5945', points: result.referenceDay.values.map(r => ({ key: String(r.periodo), label: `P${r.periodo}`, value: r.value, detail: format(r.value) })) },
      { id: 'ridge-target', label: 'Pronóstico Ridge', color: '#b98126', dash: '5 4', points: result.predictions.map(r => ({ key: String(r.periodo), label: `P${r.periodo}`, value: r.value, detail: format(r.value) })) },
    ] }} />
    <h3>Métricas del modelo activo</h3>
    <p className="section-description">{m.evaluationType === 'validation_technical' ? 'Validación técnica' : 'Evaluación histórica temporal'} · h{m.horizonDays} · {formatDateCO(m.range.start)} a {formatDateCO(m.range.end)}. No son métricas de esta consulta ni validación prospectiva.</p>
    <dl className="forecast-metadata"><div><dt>MAE</dt><dd>{format(m.MAE)}</dd></div><div><dt>RMSE</dt><dd>{format(m.RMSE)}</dd></div><div><dt>WAPE</dt><dd>{formatPercentCO(m.WAPE_percent)}</dd></div></dl>
    <details><summary>Ver los 24 periodos</summary><div className="table-scroll"><table><thead><tr><th>Periodo XM</th><th>Observado en el origen</th><th>Pronóstico Ridge</th></tr></thead><tbody>{result.predictions.map((r, i) => <tr key={r.periodo}><td>{r.periodo}</td><td>{format(result.referenceDay.values[i]!.value)}</td><td>{format(r.value)}</td></tr>)}</tbody></table></div></details>
    <details><summary>Alcance y trazabilidad</summary>{result.warnings.map(w => <p key={w}>{w}</p>)}<p>Evidencia: {result.trace.executionId}</p></details>
  </div>
}

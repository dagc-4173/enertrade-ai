import { formatDateCO, formatEnergyKWh, formatNumberCO, formatPercentCO, formatPriceCOPPerKWh } from '../../utils/numberFormat'
import './ForecastInsights.css'

export type PerformanceMetrics = { MAE: number; RMSE: number; WAPE_percent?: number; bias?: number; n?: number; unavailable?: number; coverageQ10Q90?: number; range: { start: string; end: string }; evaluationType?: string }
export function ModelPerformance({ name, version, source, unit, metrics, evaluatedHorizon, selectedHorizon, elapsedMs, deterministic = false }: { name: string; version?: string; source: string; unit: string; metrics: PerformanceMetrics | null; evaluatedHorizon?: number; selectedHorizon?: number; elapsedMs?: number; deterministic?: boolean }) {
  const format = unit === 'COP/kWh' ? formatPriceCOPPerKWh : formatEnergyKWh
  return <section className="model-performance" aria-label="Rendimiento del modelo">
    <div className="model-performance__heading"><div><p className="eyebrow">Evaluación histórica</p><h3>Métricas del modelo activo</h3></div><span>{deterministic ? 'Referencia determinista' : 'Experimental'}</span></div>
    <p><strong>{name}</strong> · {source}{selectedHorizon !== undefined && ` · horizonte seleccionado: ${selectedHorizon} días`}</p>
    {metrics ? <>
      <p className="section-description">{metrics.evaluationType === 'validation_technical' ? 'Validación técnica' : 'Evaluación histórica de referencia'}: {formatDateCO(metrics.range.start)} — {formatDateCO(metrics.range.end)}.{evaluatedHorizon !== undefined && ` Horizonte evaluado: ${evaluatedHorizon} día${evaluatedHorizon === 1 ? '' : 's'}.`} No son métricas de esta consulta ni una garantía futura.</p>
      {selectedHorizon !== undefined && evaluatedHorizon !== undefined && selectedHorizon !== evaluatedHorizon && <p className="forecast-insight-note" role="note">La evaluación corresponde a h{evaluatedHorizon}; no acredita el rendimiento del horizonte h{selectedHorizon} solicitado.</p>}
      <dl className="performance-measures">
        <div><dt>MAE · error promedio</dt><dd>{format(metrics.MAE)}</dd><small>Magnitud media del error. Menor es mejor.</small></div>
        <div><dt>RMSE · errores grandes</dt><dd>{format(metrics.RMSE)}</dd><small>Penaliza más los errores grandes. Menor es mejor.</small></div>
        <div><dt>WAPE · error agregado</dt><dd>{metrics.WAPE_percent === undefined ? 'No publicado' : formatPercentCO(metrics.WAPE_percent)}</dd><small>Error absoluto respecto al total observado; no es un porcentaje de exactitud.</small></div>
        <div><dt>Sesgo · tendencia del error</dt><dd>{metrics.bias === undefined ? 'No publicado' : format(metrics.bias)}</dd><small>Pronóstico menos observado: positivo sobreestima; negativo subestima.</small></div>
      </dl>
      <dl className="forecast-metadata"><div><dt>Observaciones evaluadas</dt><dd>{metrics.n === undefined ? 'No publicadas' : new Intl.NumberFormat('es-CO').format(metrics.n)}</dd></div>{metrics.unavailable !== undefined && <div><dt>Observaciones no disponibles</dt><dd>{new Intl.NumberFormat('es-CO').format(metrics.unavailable)}</dd></div>}{metrics.coverageQ10Q90 !== undefined && <div><dt>Cobertura histórica P10–P90</dt><dd>{formatPercentCO(metrics.coverageQ10Q90 * 100)}</dd></div>}</dl>
      {metrics.coverageQ10Q90 !== undefined && <p className="section-description">La cobertura es la proporción histórica dentro de P10–P90; no garantiza una cobertura futura del 80 %.</p>}
    </> : <p className="forecast-insight-note" role="status">Evaluación histórica específica pendiente para esta variable. No se trasladan métricas de demanda ni se inventa un porcentaje de precisión.</p>}
    {elapsedMs !== undefined && <p className="section-description">Tiempo de respuesta de esta consulta: <strong>{formatNumberCO(elapsedMs / 1000)} s</strong>. Incluye red, consulta de datos y cálculo; no mide únicamente la inferencia del modelo.</p>}
    {version && <details><summary>Identidad y versión del modelo</summary><p className="model-performance__version">{name} · {version}</p></details>}
  </section>
}

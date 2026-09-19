import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../services/apiClient'
import { forecastSupply, forecastDemand, forecastPrice, getSupplyMetrics, getDemandMetrics } from '../../services/forecastService'
import type { ForecastResult, ModelMetrics } from '../../types/forecast'
import { SectionHeader } from '../ui/SectionHeader'
import { StatusBadge } from '../ui/StatusBadge'
import { DataTable } from '../tables/DataTable'
import { PreparedDatasetSelect } from '../datasets/PreparedDatasetSelect'
import { ForecastHistoryChart } from '../charts/ForecastHistoryCharts'
import type { PreparedDatasetCompatibility } from '../../types/preparedDatasets'
import { formatDateCO, formatEnergyKWh, formatNumberCO, formatPercentCO, formatPriceCOPPerKWh } from '../../utils/numberFormat'
import './ForecastPanel.css'

const profiles: Record<'supply' | 'demand' | 'price', PreparedDatasetCompatibility> = {
  supply: { profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0' },
  demand: { profileId: 'xm_demandasin_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_demandasin_base', sourceRulesetVersion: '1.0.0' },
  price: { profileId: 'xm_preciobolsnaci_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_preciobolsnaci_base', sourceRulesetVersion: '1.0.0' },
}
const forecasts = {
  supply: { title: 'Oferta energética', source: 'XM Gene', description: 'Generación como proxy de disponibilidad energética. No equivale a oferta transaccional.', run: forecastSupply, metrics: getSupplyMetrics },
  demand: { title: 'Demanda energética', source: 'XM DemaSIN', description: 'Demanda diaria agregada del SIN. No representa consumo individual ni por zona.', run: forecastDemand, metrics: getDemandMetrics },
  price: { title: 'Precio de referencia', source: 'XM PrecBolsNaci', description: 'Regla determinista B1, no modelo ML. No realiza negociación ni liquidación financiera.', run: forecastPrice, metrics: null },
}
type ForecastKind = keyof typeof forecasts
function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.serverMessage ?? error.message
  return 'No fue posible completar la solicitud. Intenta nuevamente.'
}
function MetricsView({ metrics, result }: { metrics: ModelMetrics; result: ForecastResult | null }) {
  const e = metrics.evaluation
  const mismatch = result && 'modelId' in result && (result.modelId !== metrics.modelId || result.modelVersion !== metrics.modelVersion)
  return <div className="forecast-metrics">
    <h3>Métricas del modelo activo</h3>
    <p>{metrics.modelId} · versión {metrics.modelVersion}</p>
    {mismatch && <p role="alert">Estas métricas corresponden a otra versión que el pronóstico mostrado.</p>}
    <p className="section-description">Holdout temporal: {formatDateCO(e.range.start)} — {formatDateCO(e.range.end)}. Describe ese periodo; no es una garantía futura.</p>
    <dl className="forecast-metadata">
      <div><dt>MAE</dt><dd>{formatEnergyKWh(e.MAE.value)}</dd></div>
      <div><dt>RMSE</dt><dd>{formatEnergyKWh(e.RMSE.value)}</dd></div>
      <div><dt>Sesgo medio</dt><dd>{formatEnergyKWh(e.bias.value)}</dd></div>
      <div><dt>WAPE</dt><dd>{formatPercentCO(e.percentageError.value)}</dd></div>
      <div><dt>Observaciones evaluables / no disponibles</dt><dd>{formatNumberCO(e.evaluable)} / {formatNumberCO(e.unavailable)}</dd></div>
      <div><dt>Datos de entrenamiento</dt><dd>{formatDateCO(metrics.training.sourceRange.start)} — {formatDateCO(metrics.training.sourceRange.end)}</dd></div>
      <div><dt>Fecha de entrenamiento</dt><dd>No registrada</dd></div>
    </dl>
  </div>
}

function ResultView({ result }: { result: ForecastResult }) {
  const price = result.forecastType === 'market_reference_price'
  return <div>
    <p role="status">Resultado disponible para {formatDateCO(result.targetDate)}.</p>
    <dl className="forecast-metadata">
      <div><dt>{price ? 'Regla determinista' : 'Modelo'}</dt><dd>{price ? result.rule.id : result.modelId}</dd></div>
      <div><dt>Versión</dt><dd>{price ? result.rule.version : result.modelVersion}</dd></div>
      <div><dt>Preparado / dataset fuente</dt><dd>{result.preparedDatasetId} / {result.sourceDatasetId}</dd></div>
      <div><dt>Fecha objetivo</dt><dd>{formatDateCO(result.targetDate)}</dd></div>
      <div><dt>Unidad</dt><dd>{result.unit}</dd></div>
      <div><dt>Horizonte</dt><dd>{result.forecastType === 'aggregate_demand_proxy' ? '1 día' : '24 periodos del día objetivo'}</dd></div>
    </dl>
    {result.forecastType === 'aggregate_demand_proxy' ? <>
      <p className="forecast-value">{formatEnergyKWh(result.prediction.demanda_kwh)}</p>
      <p>Demanda estimada del SIN. Nivel de confianza no definido.</p>
    </> : <DataTable columns={[
      { header: 'Periodo XM', render: (row: { period: number; value: number }) => row.period },
      { header: `${price ? 'Precio de referencia' : 'Generación estimada'} (${result.unit})`, render: row => price ? formatPriceCOPPerKWh(row.value) : formatEnergyKWh(row.value) },
    ]} rows={result.forecastType === 'generation_availability_proxy'
      ? result.predictions.map(row => ({ period: row.hora_xm, value: row.energia_kwh }))
      : result.predictions.map(row => ({ period: row.periodo, value: row.precio_cop_kwh }))} getRowKey={row => String(row.period)} />}
    <ForecastHistoryChart key={`${result.forecastType}:${result.preparedDatasetId}:${result.targetDate}`} result={result} />
    {price && <div className="forecast-trace">
      <h3>Trazabilidad de esta estimación</h3>
      <dl className="forecast-metadata">
        <div><dt>executionId</dt><dd>{result.trace.executionId ?? 'No disponible'}</dd></div>
        <div><dt>Persistencia</dt><dd>{result.trace.persistence}</dd></div>
      </dl>
      {result.trace.persistence === 'failed' && <p role="alert">El precio se calculó, pero no se pudo guardar la trazabilidad. Reintentar genera una nueva ejecución.</p>}
      {result.trace.conditionsCompleteness === 'partial' && <p>Condiciones parciales: están los 24 periodos; se omiten factores del alcance comercial.</p>}
      <p>Factor utilizado: {result.factors.used.join(', ')}.</p>
      <p>Factores omitidos: {result.factors.omitted.join(', ')}.</p>
    </div>}
  </div>
}

export function ForecastPanel({ kind }: { kind: ForecastKind }) {
  const config = forecasts[kind]
  const [preparedId, setPreparedId] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [result, setResult] = useState<ForecastResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const request = useRef<AbortController | null>(null)
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(Boolean(config.metrics))
  const [metricsError, setMetricsError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const load = config.metrics
    if (!load) return
    const controller = new AbortController()
    load(controller.signal).then(value => { if (!controller.signal.aborted) setMetrics(value) })
      .catch(reason => { if (!controller.signal.aborted) setMetricsError(errorMessage(reason)) })
      .finally(() => { if (!controller.signal.aborted) setMetricsLoading(false) })
    return () => controller.abort()
  }, [config.metrics, retry])
  useEffect(() => () => request.current?.abort(), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current && !request.current.signal.aborted) return
    const id = Number(preparedId)
    setError(''); setResult(null)
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || !targetDate) {
      setError('Selecciona un dataset preparado y una fecha objetivo válidos.'); return
    }
    const controller = new AbortController()
    request.current = controller; setLoading(true)
    try {
      const response = await config.run({ preparedDatasetId: id, targetDate }, controller.signal)
      if (!controller.signal.aborted) setResult(response)
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorMessage(reason))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
      if (request.current === controller) request.current = null
    }
  }
  function clear() { setResult(null); setError('') }
  return <section className="panel forecast-panel" aria-label={config.title}>
    <SectionHeader eyebrow={config.source} title={config.title} description={config.description}>
      <StatusBadge>{kind === 'price' ? 'Regla determinista · B1' : 'Modelo experimental · Ridge'}</StatusBadge>
    </SectionHeader>
    <p className="section-description">Elige un dataset preparado compatible y una fecha objetivo. Los pronósticos no se consultan automáticamente.</p>
    <form onSubmit={submit}>
      <fieldset disabled={loading}>
        <legend>Solicitud al backend</legend>
        <PreparedDatasetSelect value={preparedId} onChange={value => { setPreparedId(value); clear() }} requirements={[profiles[kind]]} />
        <label>Fecha objetivo<input type="date" required value={targetDate} onChange={e => { setTargetDate(e.target.value); clear() }} /></label>
      </fieldset>
      <button className="primary-button" disabled={loading} type="submit">{loading ? 'Consultando…' : error ? 'Reintentar consulta' : 'Generar pronóstico'}</button>
    </form>
    {kind === 'price' && <p className="section-description">Cada solicitud registra una nueva ejecución HU-09, incluso si repites la misma fecha.</p>}
    {loading && <p role="status">Consultando {config.title.toLowerCase()}…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !result && <p>Sin pronóstico solicitado.</p>}
    {result && <ResultView result={result} />}
    {metricsLoading && <p role="status">Cargando métricas del modelo…</p>}
    {metricsError && <div role="alert"><p>{metricsError}</p><button type="button" className="secondary-button" onClick={() => {
      setMetricsError(''); setMetricsLoading(true); setRetry(n => n + 1)
    }}>Reintentar métricas</button></div>}
    {metrics && <MetricsView metrics={metrics} result={result} />}
  </section>
}

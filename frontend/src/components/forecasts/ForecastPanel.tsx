import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../services/apiClient'
import { forecastSupply, forecastDemand, forecastPrice, getSupplyMetrics, getDemandMetrics } from '../../services/forecastService'
import { getForecastAvailability } from '../../services/forecastAvailabilityService'
import type { ForecastResult, ModelMetrics } from '../../types/forecast'
import type { ForecastAvailability } from '../../types/forecastAvailability'
import { SectionHeader } from '../ui/SectionHeader'
import { StatusBadge } from '../ui/StatusBadge'
import { DataTable } from '../tables/DataTable'
import { PreparedDatasetSelect } from '../datasets/PreparedDatasetSelect'
import { ForecastHistoryChart } from '../charts/ForecastHistoryCharts'
import type { PreparedDatasetCompatibility } from '../../types/preparedDatasets'
import { formatDateCO, formatEnergyKWh, formatNumberCO, formatPercentCO, formatPriceCOPPerKWh } from '../../utils/numberFormat'
import { effectiveRange, exceedsSupportedHorizon, horizonMessage, selectedHorizonDays } from '../../utils/forecastAvailability'
import './ForecastPanel.css'

type RunInput = { preparedDatasetId?: number; targetDate: string }
const profiles: Record<'demand' | 'price', PreparedDatasetCompatibility> = {
  demand: { profileId: 'xm_demandasin_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_demandasin_base', sourceRulesetVersion: '1.0.0' },
  price: { profileId: 'xm_preciobolsnaci_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_preciobolsnaci_base', sourceRulesetVersion: '1.0.0' },
}
// HU-04 solo exige targetDate: el backend resuelve los PreparedDataset compatibles. HU-06/HU-08 conservan su contrato.
const forecasts = {
  supply: { title: 'Oferta energética', source: 'XM Gene', series: 'Gene' as const, description: 'Generación como proxy de disponibilidad energética. No equivale a oferta transaccional.', requiresPreparedDataset: false,
    run: (input: RunInput, signal?: AbortSignal) => forecastSupply({ targetDate: input.targetDate }, signal), metrics: null },
  demand: { title: 'Demanda energética', source: 'XM DemaSIN', series: 'DemaSIN' as const, description: 'Demanda diaria agregada del SIN. No representa consumo individual ni por zona.', requiresPreparedDataset: true,
    run: (input: RunInput, signal?: AbortSignal) => forecastDemand({ preparedDatasetId: input.preparedDatasetId!, targetDate: input.targetDate }, signal), metrics: getDemandMetrics },
  price: { title: 'Precio de referencia', source: 'XM PrecBolsNaci', series: 'PrecBolsNaci' as const, description: 'Regla determinista B1, no modelo ML. No realiza negociación ni liquidación financiera.', requiresPreparedDataset: true,
    run: (input: RunInput, signal?: AbortSignal) => forecastPrice({ preparedDatasetId: input.preparedDatasetId!, targetDate: input.targetDate }, signal), metrics: null },
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
    {'modelStatus' in metrics && <p>Estado: <strong>Experimental</strong> · Validación académica: <strong>Pendiente</strong></p>}
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
      {'baselineReference' in metrics && <div><dt>Baseline de referencia</dt><dd>{metrics.baselineReference}</dd></div>}
    </dl>
  </div>
}

function sourceArtifactsLabel(result: ForecastResult) {
  if (!('sourceArtifacts' in result)) return `${result.preparedDatasetId} / ${result.sourceDatasetId}`
  return result.sourceArtifacts.map(a => `#${a.preparedDatasetId} (dataset ${a.sourceDatasetId})`).join(', ')
}
function historyChartKey(result: ForecastResult) {
  const artifact = 'sourceArtifacts' in result ? result.sourceArtifacts.map(a => a.preparedDatasetId).join(',') : result.preparedDatasetId
  return `${result.forecastType}:${artifact}:${result.targetDate}`
}

export function ResultView({ result }: { result: ForecastResult }) {
  const price = result.forecastType === 'market_reference_price'
  return <div>
    <p role="status">Resultado disponible para {formatDateCO(result.targetDate)}.</p>
    <dl className="forecast-metadata">
      <div><dt>{price ? 'Regla determinista' : 'Modelo'}</dt><dd>{price ? result.rule.id : result.modelId}</dd></div>
      <div><dt>Versión</dt><dd>{price ? result.rule.version : result.modelVersion}</dd></div>
      {'modelStatus' in result && <div><dt>Estado</dt><dd>Experimental</dd></div>}
      {'academicValidation' in result && <div><dt>Validación académica</dt><dd>Pendiente</dd></div>}
      <div><dt>{'sourceArtifacts' in result ? 'Datasets preparados fuente' : 'Preparado / dataset fuente'}</dt><dd>{sourceArtifactsLabel(result)}</dd></div>
      <div><dt>Fecha objetivo</dt><dd>{formatDateCO(result.targetDate)}</dd></div>
      {'forecastOriginDate' in result && <div><dt>Última observación / origen</dt><dd>{formatDateCO(result.forecastOriginDate)}</dd></div>}
      <div><dt>Unidad</dt><dd>{result.unit}</dd></div>
      <div><dt>Horizonte</dt><dd>{result.forecastType === 'aggregate_demand_proxy' ? '1 día' : result.forecastType === 'generation_availability_proxy' ? `${result.horizonDays} día${result.horizonDays === 1 ? '' : 's'} · 24 periodos del día objetivo` : '24 periodos del día objetivo'}</dd></div>
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
    <ForecastHistoryChart key={historyChartKey(result)} result={result} />
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

export type ForecastRunState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; result: ForecastResult }

export function ForecastRunOutcome({ title, state }: { title: string; state: ForecastRunState }) {
  return <>
    {state.kind === 'loading' && <p role="status">Consultando {title.toLowerCase()}…</p>}
    {state.kind === 'error' && <p role="alert">{state.message}</p>}
    {state.kind === 'idle' && <p>Sin pronóstico solicitado.</p>}
    {state.kind === 'success' && <ResultView result={state.result} />}
  </>
}

export type ForecastAvailabilityState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; availability: ForecastAvailability }

export function ForecastAvailabilityView({ state }: { state: ForecastAvailabilityState }) {
  if (state.kind === 'loading') return <p role="status">Consultando disponibilidad de datos…</p>
  if (state.kind === 'error') return <p className="forecast-availability" role="alert">{state.message}</p>
  const { availability } = state
  if (!availability.hasFutureForecastWindow) return <div className="forecast-availability" role="status"><p><strong>Los datos disponibles están desactualizados.</strong></p><p>Fecha actual: {formatDateCO(availability.currentDate)}</p><p>Última observación: {formatDateCO(availability.latestObservationDate)}.</p><p>No existe actualmente un rango futuro pronosticable.</p><p>Actualizando datos XM...</p></div>
  const range = effectiveRange(availability)
  return <dl className="forecast-metadata forecast-availability">
    <div><dt>Fecha actual</dt><dd>{formatDateCO(availability.currentDate)}</dd></div>
    <div><dt>Últimos datos disponibles</dt><dd>{formatDateCO(availability.latestObservationDate)}</dd></div>
    {availability.series === 'Gene' ? <>
      <div><dt>Horizonte experimental soportado</dt><dd>1 a {availability.supportedHorizonDays} días</dd></div>
      <div><dt>Rango futuro disponible</dt><dd>{formatDateCO(range!.min)} — {formatDateCO(range!.max)}</dd></div>
    </> : <>
      <div><dt>Próxima fecha pronosticable</dt><dd>{formatDateCO(availability.nextForecastDate)}</dd></div>
      <div><dt>Horizonte soportado</dt><dd>{availability.supportedHorizonDays} día</dd></div>
    </>}
  </dl>
}

export function ForecastPanel({ kind }: { kind: ForecastKind }) {
  const config = forecasts[kind]
  const [preparedId, setPreparedId] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [runState, setRunState] = useState<ForecastRunState>({ kind: 'idle' })
  const [availabilityState, setAvailabilityState] = useState<ForecastAvailabilityState>({ kind: 'loading' })
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
  useEffect(() => {
    const controller = new AbortController()
    getForecastAvailability(controller.signal).then(values => {
      const availability = values.find(value => value.series === config.series)
      if (!availability) throw new ApiError('response', 'La API no informó disponibilidad para esta serie.')
      if (!controller.signal.aborted) {
        setAvailabilityState({ kind: 'success', availability })
        setTargetDate(value => value || (config.series === 'Gene' ? effectiveRange(availability)?.min : null) || availability.nextForecastDate)
      }
    }).catch(reason => { if (!controller.signal.aborted) setAvailabilityState({ kind: 'error', message: errorMessage(reason) }) })
    return () => controller.abort()
  }, [config.series])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current && !request.current.signal.aborted) return
    let preparedDatasetId: number | undefined
    if (config.requiresPreparedDataset) {
      const parsedId = Number(preparedId)
      if (!Number.isSafeInteger(parsedId) || parsedId < 1 || parsedId > 2147483647) {
        setRunState({ kind: 'error', message: 'Selecciona un dataset preparado y una fecha objetivo válidos.' }); return
      }
      preparedDatasetId = parsedId
    }
    if (!targetDate) { setRunState({ kind: 'error', message: 'Selecciona una fecha objetivo válida.' }); return }
    if (availabilityState.kind === 'success' && exceedsSupportedHorizon(targetDate, availabilityState.availability)) {
      setRunState({ kind: 'error', message: horizonMessage(availabilityState.availability) }); return
    }
    const controller = new AbortController()
    request.current = controller; setRunState({ kind: 'loading' })
    try {
      const response = await config.run({ preparedDatasetId, targetDate }, controller.signal)
      if (!controller.signal.aborted) {
        setRunState({ kind: 'success', result: response })
        if (response.forecastType === 'generation_availability_proxy') {
          setMetricsLoading(true); setMetricsError('')
          try { setMetrics(await getSupplyMetrics(response.horizonDays, controller.signal)) }
          catch (reason) { if (!controller.signal.aborted) setMetricsError(errorMessage(reason)) }
          finally { if (!controller.signal.aborted) setMetricsLoading(false) }
        }
      }
    } catch (reason) {
      if (!controller.signal.aborted) setRunState({ kind: 'error', message: errorMessage(reason) })
    } finally {
      if (request.current === controller) request.current = null
    }
  }
  function clear() { setRunState({ kind: 'idle' }); if (kind === 'supply') { setMetrics(null); setMetricsError('') } }
  return <section className="panel forecast-panel" aria-label={config.title}>
    <SectionHeader eyebrow={config.source} title={config.title} description={config.description}>
      <StatusBadge>{kind === 'price' ? 'Regla determinista · B1' : 'Modelo experimental · Ridge'}</StatusBadge>
    </SectionHeader>
    <ForecastAvailabilityView state={availabilityState} />
    <p className="section-description">{config.requiresPreparedDataset ? 'Elige un dataset preparado compatible y una fecha objetivo.' : 'Elige una fecha objetivo.'} Los pronósticos no se consultan automáticamente.</p>
    <form onSubmit={submit}>
      <fieldset disabled={runState.kind === 'loading'}>
        <legend>Solicitud al backend</legend>
        {config.requiresPreparedDataset && <PreparedDatasetSelect value={preparedId} onChange={value => { setPreparedId(value); clear() }} requirements={[profiles[kind as 'demand' | 'price']]} />}
        <label>Fecha objetivo<input type="date" required value={targetDate}
          min={availabilityState.kind === 'success' ? kind === 'supply' ? effectiveRange(availabilityState.availability)?.min : availabilityState.availability.nextForecastDate : undefined}
          max={availabilityState.kind === 'success' ? kind === 'supply' ? effectiveRange(availabilityState.availability)?.max : availabilityState.availability.nextForecastDate : undefined}
          onChange={e => { setTargetDate(e.target.value); clear() }} /></label>
      </fieldset>
      {kind === 'supply' && availabilityState.kind === 'success' && effectiveRange(availabilityState.availability) && targetDate >= effectiveRange(availabilityState.availability)!.min && targetDate <= effectiveRange(availabilityState.availability)!.max &&
        <p className="section-description">Horizonte seleccionado: <strong>{selectedHorizonDays(targetDate, availabilityState.availability)} días</strong></p>}
      <button className="primary-button" disabled={runState.kind === 'loading'} type="submit">{runState.kind === 'loading' ? 'Consultando…' : runState.kind === 'error' ? 'Reintentar consulta' : 'Generar pronóstico'}</button>
    </form>
    {kind === 'price' && <p className="section-description">Cada solicitud registra una nueva ejecución HU-09, incluso si repites la misma fecha.</p>}
    <ForecastRunOutcome title={config.title} state={runState} />
    {metricsLoading && <p role="status">Cargando métricas del modelo…</p>}
    {metricsError && <div role="alert"><p>{metricsError}</p><button type="button" className="secondary-button" onClick={() => {
      setMetricsError(''); setMetricsLoading(true); setRetry(n => n + 1)
    }}>Reintentar métricas</button></div>}
    {metrics && <MetricsView metrics={metrics} result={runState.kind === 'success' ? runState.result : null} />}
  </section>
}

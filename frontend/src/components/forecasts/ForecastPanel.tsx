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
// Oferta y Demanda resuelven datasets en backend; Precio B1 conserva preparedDatasetId.
const forecasts = {
  supply: { title: 'Oferta energética', source: 'XM Gene', series: 'Gene' as const, description: 'Generación como proxy de disponibilidad energética. No equivale a oferta transaccional.', requiresPreparedDataset: false,
    run: (input: RunInput, signal?: AbortSignal) => forecastSupply({ targetDate: input.targetDate }, signal), metrics: null },
  demand: { title: 'Demanda energética', source: 'XM DemaSIN', series: 'DemaSIN' as const, description: 'Demanda diaria agregada del SIN. No representa consumo individual ni por zona.', requiresPreparedDataset: false,
    run: (input: RunInput, signal?: AbortSignal) => forecastDemand({ targetDate: input.targetDate }, signal), metrics: null },
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
    <p className="section-description">{metrics.forecastType === 'aggregate_demand_proxy' ? metrics.evaluationType === 'validation_technical' ? 'Evaluación técnica de VALIDATION' : 'Evaluación retrospectiva técnica' : 'Holdout temporal'}: {formatDateCO(e.range.start)} — {formatDateCO(e.range.end)}. Describe ese periodo; no es una garantía futura.</p>
    <dl className="forecast-metadata">
      <div><dt>MAE</dt><dd>{formatEnergyKWh(e.MAE.value)}</dd></div>
      <div><dt>RMSE</dt><dd>{formatEnergyKWh(e.RMSE.value)}</dd></div>
      <div><dt>Sesgo medio</dt><dd>{formatEnergyKWh(e.bias.value)}</dd></div>
      <div><dt>WAPE</dt><dd>{formatPercentCO(e.percentageError.value)}</dd></div>
      <div><dt>Observaciones evaluables / no disponibles</dt><dd>{formatNumberCO(e.evaluable)} / {formatNumberCO(e.unavailable)}</dd></div>
      <div><dt>Datos de entrenamiento</dt><dd>{formatDateCO(metrics.training.sourceRange.start)} — {formatDateCO(metrics.training.sourceRange.end)}</dd></div>
      {metrics.forecastType === 'aggregate_demand_proxy' && <><div><dt>Validación</dt><dd>{formatDateCO(metrics.validationRange.start)} — {formatDateCO(metrics.validationRange.end)}</dd></div><div><dt>{metrics.evaluationType === 'validation_technical' ? 'Tipo de evaluación' : 'Evaluación retrospectiva'}</dt><dd>{metrics.evaluationType === 'validation_technical' ? 'VALIDATION técnica (no prospectiva)' : metrics.retrospectiveEvaluationRange ? `${formatDateCO(metrics.retrospectiveEvaluationRange.start)} — ${formatDateCO(metrics.retrospectiveEvaluationRange.end)}` : 'No informada'}</dd></div></>}
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
  const status = price ? 'Determinista / baseline' : result.forecastType === 'aggregate_demand_proxy' ? 'Experimental' : result.modelStatus
  const academicValidation = !price && ('academicValidation' in result ? result.academicValidation : null)
  const priceOrigin = price ? new Date(`${result.targetDate}T00:00:00Z`) : null
  if (priceOrigin) priceOrigin.setUTCDate(priceOrigin.getUTCDate() - 1)
  return <div className="forecast-result">
    <p role="status">Resultado disponible para {formatDateCO(result.targetDate)}.</p>
    <dl className="forecast-metadata forecast-result-metadata">
      <div><dt>{price ? 'Regla determinista' : 'Modelo'}</dt><dd>{price ? result.rule.id : result.modelId}</dd></div>
      <div><dt>Versión</dt><dd>{price ? result.rule.version : result.modelVersion}</dd></div>
      <div><dt>Estado</dt><dd>{status === 'experimental' ? 'Experimental' : status}</dd></div>
      {!price && <div><dt>Validación académica</dt><dd>{academicValidation === 'pending' ? 'Pendiente' : academicValidation ?? 'No informada'}</dd></div>}
      <div><dt>{'sourceArtifacts' in result ? 'Datasets preparados fuente' : 'Preparado / dataset fuente'}</dt><dd>{sourceArtifactsLabel(result)}</dd></div>
      <div><dt>Fecha objetivo</dt><dd>{formatDateCO(result.targetDate)}</dd></div>
      <div><dt>Última observación / origen</dt><dd>{'forecastOriginDate' in result ? formatDateCO(result.forecastOriginDate) : priceOrigin ? formatDateCO(priceOrigin.toISOString().slice(0, 10)) : 'No informado por el resultado'}</dd></div>
      <div><dt>Unidad</dt><dd>{result.unit}</dd></div>
      <div><dt>Horizonte</dt><dd>{result.forecastType === 'aggregate_demand_proxy' ? `${result.horizonDays} día${result.horizonDays === 1 ? '' : 's'}` : result.forecastType === 'generation_availability_proxy' ? `${result.horizonDays} día${result.horizonDays === 1 ? '' : 's'} · 24 periodos del día objetivo` : '1 día · 24 periodos'}</dd></div>
    </dl>
    {result.forecastType === 'aggregate_demand_proxy' ? <>
      <div className="forecast-daily-result"><DataTable columns={[{ header: 'Día XM', render: (row: { date: string; value: number }) => formatDateCO(row.date) }, { header: 'Demanda estimada (kWh)', render: (row: { date: string; value: number }) => formatEnergyKWh(row.value) }]} rows={[{ date: result.targetDate, value: result.prediction.demanda_kwh }]} getRowKey={row => row.date} /></div>
      <p className="section-description">Demanda estimada del SIN. Nivel de confianza no definido.</p>
    </> : <DataTable columns={[
      { header: 'Periodo XM', render: (row: { period: number; value: number }) => row.period },
      { header: `${price ? 'Precio estimado' : 'Generación estimada'} (${result.unit})`, render: row => price ? formatPriceCOPPerKWh(row.value) : formatEnergyKWh(row.value) },
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
    {state.kind === 'loading' && <p className="forecast-state" role="status">Cargando... Consultando {title.toLowerCase()}.</p>}
    {state.kind === 'error' && <p className="forecast-state" role="alert">Error de forecast: {state.message}</p>}
    {state.kind === 'idle' && <p className="forecast-state">Sin pronóstico solicitado.</p>}
    {state.kind === 'success' && <ResultView result={state.result} />}
  </>
}

export type ForecastAvailabilityState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; availability: ForecastAvailability }

export function ForecastTargetDateSelect({ dates, value, onChange }: { dates: string[]; value: string; onChange: (value: string) => void }) {
  return <label>Fecha objetivo<select required value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Selecciona una fecha elegible</option>
    {dates.map(date => <option key={date} value={date}>{formatDateCO(date)}</option>)}
  </select></label>
}

export function ForecastAvailabilityView({ state }: { state: ForecastAvailabilityState }) {
  if (state.kind === 'loading') return <p role="status">Consultando disponibilidad de datos…</p>
  if (state.kind === 'error') return <p className="forecast-availability" role="alert">Error de disponibilidad: {state.message}</p>
  const { availability } = state
  const range = effectiveRange(availability)
  const demand = availability.series === 'DemaSIN'
  const eligible = availability.eligibleFutureTargetDates
  const reasons = {
    SOURCE_DATA_STALE: 'Los datos fuente no alcanzan un target futuro dentro del horizonte real.',
    INCOMPLETE_SOURCE_DAY: 'El día fuente D-1 no contiene 24 periodos únicos con precios válidos en un mismo dataset preparado.',
    NO_BUILDABLE_ORIGIN: 'No existe un origen con todas sus observaciones fuente utilizables.',
    MODEL_HORIZON_LIMIT: 'No hay un modelo compatible para los horizontes requeridos.',
    AVAILABLE: '',
  }
  return <div className="forecast-availability">
    <dl className="forecast-metadata forecast-availability-grid">
      <div><dt>Fecha actual</dt><dd>{formatDateCO(availability.currentDate)}</dd></div>
      <div><dt>{demand ? 'Últimos datos recibidos' : 'Últimos datos disponibles'}</dt><dd>{formatDateCO(demand ? availability.latestReceivedDate : availability.latestObservationDate)}</dd></div>
      {demand && <div><dt>Última observación utilizable</dt><dd>{formatDateCO(availability.latestIndividuallyUsableDate)}</dd></div>}
      <div><dt>{availability.series === 'PrecBolsNaci' ? 'Horizonte activo' : 'Horizonte experimental soportado'}</dt><dd>{availability.series === 'PrecBolsNaci' ? '1 día' : `1 a ${availability.supportedHorizonDays} días`}</dd></div>
      <div><dt>Rango futuro disponible</dt><dd>{range ? `${formatDateCO(range.min)} — ${formatDateCO(range.max)}` : 'No disponible'}</dd></div>
    </dl>
    {demand && availability.semanticExcludedDates.length > 0 && <p className="forecast-semantic-note" role="note">Fechas en revisión semántica de EnerTrade AI: {availability.semanticExcludedDates.map(formatDateCO).join(', ')}.</p>}
    {eligible.length > 0 && <p className="forecast-range">Fechas objetivo elegibles: {eligible.map(formatDateCO).join(', ')}.</p>}
    {!availability.hasFutureForecastWindow && <p className="forecast-unavailable" role="status"><strong>{demand && eligible.length === 0 ? 'No existe actualmente un target futuro con todas sus observaciones fuente utilizables.' : 'No hay target futuro disponible.'}</strong> {availability.availabilityReason ? reasons[availability.availabilityReason] : 'Datos desactualizados.'}</p>}
  </div>
}

export function ForecastPanel({ kind }: { kind: ForecastKind }) {
  const config = forecasts[kind]
  const [preparedId, setPreparedId] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [runState, setRunState] = useState<ForecastRunState>({ kind: 'idle' })
  const [availabilityState, setAvailabilityState] = useState<ForecastAvailabilityState>({ kind: 'loading' })
  const request = useRef<AbortController | null>(null)
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (kind !== 'demand' || availabilityState.kind !== 'success' || !availabilityState.availability.eligibleFutureTargetDates.includes(targetDate)) return
    const controller = new AbortController()
    getDemandMetrics(selectedHorizonDays(targetDate, availabilityState.availability), controller.signal).then(value => { if (!controller.signal.aborted) setMetrics(value) })
      .catch(reason => { if (!controller.signal.aborted) setMetricsError(errorMessage(reason)) })
      .finally(() => { if (!controller.signal.aborted) setMetricsLoading(false) })
    return () => controller.abort()
  }, [kind, availabilityState, targetDate, retry])
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    getForecastAvailability(controller.signal).then(values => {
      const availability = values.find(value => value.series === config.series)
      if (!availability) throw new ApiError('response', 'La API no informó disponibilidad para esta serie.')
      if (!controller.signal.aborted) {
        setAvailabilityState({ kind: 'success', availability })
        setTargetDate(availability.eligibleFutureTargetDates[0] ?? '')
      }
    }).catch(reason => { if (!controller.signal.aborted) setAvailabilityState({ kind: 'error', message: errorMessage(reason) }) })
    return () => controller.abort()
  }, [config.series])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current && !request.current.signal.aborted) return
    if (availabilityState.kind !== 'success' || !availabilityState.availability.hasFutureForecastWindow) return
    let preparedDatasetId: number | undefined
    if (config.requiresPreparedDataset) {
      const parsedId = Number(preparedId)
      if (!Number.isSafeInteger(parsedId) || parsedId < 1 || parsedId > 2147483647) {
        setRunState({ kind: 'error', message: 'Selecciona un dataset preparado y una fecha objetivo válidos.' }); return
      }
      preparedDatasetId = parsedId
      if (availabilityState.availability.eligiblePreparedDatasetIds && !availabilityState.availability.eligiblePreparedDatasetIds.includes(parsedId)) {
        setRunState({ kind: 'error', message: 'El dataset preparado no contiene el día fuente completo requerido por B1.' }); return
      }
    }
    if (!targetDate) { setRunState({ kind: 'error', message: 'Selecciona una fecha objetivo válida.' }); return }
    if (!availabilityState.availability.eligibleFutureTargetDates.includes(targetDate)) {
      setRunState({ kind: 'error', message: 'La fecha objetivo no está entre los targets futuros elegibles.' }); return
    }
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
  function clear() { setRunState({ kind: 'idle' }); if (kind !== 'price') { setMetrics(null); setMetricsError(''); if (kind === 'demand') setMetricsLoading(true) } }
  const unavailable = availabilityState.kind !== 'success' || !availabilityState.availability.hasFutureForecastWindow || !availabilityState.availability.eligibleFutureTargetDates.includes(targetDate) ||
    (kind === 'price' && availabilityState.availability.eligiblePreparedDatasetIds !== undefined && !availabilityState.availability.eligiblePreparedDatasetIds.includes(Number(preparedId)))
  const dates = availabilityState.kind === 'success' ? availabilityState.availability.eligibleFutureTargetDates : []
  return <section className="panel forecast-panel" aria-label={config.title}>
    <SectionHeader eyebrow={config.source} title={config.title} description={config.description}>
      <StatusBadge>{kind === 'price' ? 'Regla determinista · B1' : 'Modelo experimental · Ridge'}</StatusBadge>
    </SectionHeader>
    <ForecastAvailabilityView state={availabilityState} />
    <p className="section-description">{config.requiresPreparedDataset ? 'Elige un dataset preparado compatible y una fecha objetivo.' : 'Elige una fecha objetivo.'} Las solicitudes se realizan únicamente al pulsar Generar pronóstico.</p>
    <form onSubmit={submit}>
      <fieldset disabled={runState.kind === 'loading' || availabilityState.kind !== 'success' || !availabilityState.availability.hasFutureForecastWindow}>
        <legend>Solicitud al backend</legend>
        {config.requiresPreparedDataset && <PreparedDatasetSelect value={preparedId} onChange={value => { setPreparedId(value); clear() }} requirements={[profiles[kind as 'demand' | 'price']]} eligibleIds={availabilityState.kind === 'success' ? availabilityState.availability.eligiblePreparedDatasetIds : undefined} />}
        <ForecastTargetDateSelect dates={dates} value={targetDate} onChange={date => { setTargetDate(date); clear() }} />
      </fieldset>
      <p className="section-description forecast-horizon">Horizonte seleccionado: <strong>{kind !== 'price' && availabilityState.kind === 'success' && availabilityState.availability.eligibleFutureTargetDates.includes(targetDate) ? `${selectedHorizonDays(targetDate, availabilityState.availability)} días` : kind === 'price' ? '1 día' : 'Selecciona una fecha'}</strong></p>
      <button className="primary-button" disabled={runState.kind === 'loading' || unavailable} type="submit">{runState.kind === 'loading' ? 'Cargando...' : runState.kind === 'error' ? 'Reintentar consulta' : 'Generar pronóstico'}</button>
    </form>
    {kind === 'price' && <p className="section-description">Cada solicitud registra una nueva ejecución HU-09, incluso si repites la misma fecha.</p>}
    <ForecastRunOutcome title={config.title} state={runState} />
    {metricsLoading && <p role="status">Cargando métricas del modelo…</p>}
    {metricsError && <div role="alert"><p>{metricsError}</p><button type="button" className="secondary-button" onClick={() => {
      setMetricsError(''); setMetricsLoading(true)
      if (kind === 'demand') setRetry(n => n + 1)
      else if (runState.kind === 'success' && runState.result.forecastType === 'generation_availability_proxy') getSupplyMetrics(runState.result.horizonDays).then(setMetrics).catch(reason => setMetricsError(errorMessage(reason))).finally(() => setMetricsLoading(false))
    }}>Reintentar métricas</button></div>}
    {metrics && <MetricsView metrics={metrics} result={runState.kind === 'success' ? runState.result : null} />}
    {kind === 'price' && <div className="forecast-metrics"><h3>Métricas</h3><p className="section-description">Baseline determinista de referencia. El runtime B1 no publica métricas históricas en este contrato.</p></div>}
  </section>
}

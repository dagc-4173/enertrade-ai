import { ForecastSavedNotice } from './ForecastSavedNotice'
import { ModelPerformance } from './ModelPerformance'
import { ForecastInsights } from './ForecastInsights'
import { getModelMetrics } from '../../services/modelsService'
import type { PredictiveArtifactMetrics } from '../../types/models'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../services/apiClient'
import { forecastSupply, forecastDemand, forecastPrice, getSupplyMetrics, getDemandMetrics } from '../../services/forecastService'
import { getForecastAvailability } from '../../services/forecastAvailabilityService'
import type { ForecastResult, ModelMetrics } from '../../types/forecast'
import type { ForecastAvailability } from '../../types/forecastAvailability'
import { SectionHeader } from '../ui/SectionHeader'
import { StatusBadge } from '../ui/StatusBadge'
import { PreparedDatasetSelect } from '../datasets/PreparedDatasetSelect'
import { ForecastHistoryChart } from '../charts/ForecastHistoryCharts'
import type { PreparedDatasetCompatibility } from '../../types/preparedDatasets'
import { formatDateCO } from '../../utils/numberFormat'
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
function MetricsView({ metrics, result, elapsedMs }: { metrics: ModelMetrics; result: ForecastResult | null; elapsedMs?: number }) {
  if (result && 'modelId' in result && (result.modelId !== metrics.modelId || result.modelVersion !== metrics.modelVersion)) return <p role="alert">Las métricas recibidas corresponden a otra versión; no se muestran para este pronóstico.</p>
  const e = metrics.evaluation
  return <>
    <ModelPerformance name={metrics.modelId} version={metrics.modelVersion} source={metrics.forecastType === 'aggregate_demand_proxy' ? 'XM DemaSIN/Sistema · total diario' : 'XM Gene/Sistema · generación como aproximación de oferta'} unit={metrics.unit} selectedHorizon={metrics.horizonDays} evaluatedHorizon={metrics.horizonDays} elapsedMs={elapsedMs} metrics={{ MAE: e.MAE.value, RMSE: e.RMSE.value, bias: e.bias.value, WAPE_percent: e.percentageError.value, n: e.evaluable, unavailable: e.unavailable, range: e.range, evaluationType: e.type }} />
    <details><summary>Datos de entrenamiento y evaluación</summary><p>Datos de entrenamiento: {formatDateCO(metrics.training.sourceRange.start)} — {formatDateCO(metrics.training.sourceRange.end)}.</p><p>Fecha de entrenamiento: no registrada. Baseline de referencia: {metrics.baselineReference}.</p><p>Validación académica y prospectiva pendientes.</p></details>
  </>
}
function PricePerformance({ result, elapsedMs }: { result: Extract<ForecastResult, { forecastType: 'market_reference_price' }>; elapsedMs?: number }) {
 const [state, setState] = useState<{metrics?: PredictiveArtifactMetrics; error?: string}>({})
 useEffect(() => {
  const controller = new AbortController()
  getModelMetrics(result.rule.id, controller.signal).then(m => {
   if(m.id !== result.rule.id || m.version !== result.rule.version) throw new Error('Las métricas no corresponden a la regla ejecutada.')
   if(!controller.signal.aborted)setState({metrics:m})
  }).catch(() => {if(!controller.signal.aborted)setState({error:'No fue posible consultar la evaluación de B1.'})})
  return () => controller.abort()
 }, [result.rule.id, result.rule.version])
 const m=state.metrics
 return <>{!m && <p role={state.error ? 'alert' : 'status'}>{state.error ?? 'Consultando métricas de B1…'}</p>}{m && <ModelPerformance deterministic name="B1 · referencia determinista del día anterior" version={m.version} source="XM PrecBolsNaci/Sistema" unit="COP/kWh" selectedHorizon={1} evaluatedHorizon={1} elapsedMs={elapsedMs} metrics={{MAE:m.metrics.MAE.value,RMSE:m.metrics.RMSE.value,bias:m.metrics.bias.value,WAPE_percent:m.metrics.WAPE?.value,n:m.evaluable,unavailable:m.unavailable,range:m.range,evaluationType:m.evaluationType}} />}</>
}

function sourceArtifactsLabel(result: ForecastResult) {
  if (!('sourceArtifacts' in result)) return `${result.preparedDatasetId} / ${result.sourceDatasetId}`
  return result.sourceArtifacts.map(a => `#${a.preparedDatasetId} (dataset ${a.sourceDatasetId})`).join(', ')
}
function historyChartKey(result: ForecastResult) {
  const artifact = 'sourceArtifacts' in result ? result.sourceArtifacts.map(a => a.preparedDatasetId).join(',') : result.preparedDatasetId
  return `${result.forecastType}:${artifact}:${result.targetDate}`
}

export function ResultView({ result, elapsedMs }: { result: ForecastResult; elapsedMs?: number }) {
  const price = result.forecastType === 'market_reference_price'
  const status = price ? 'Determinista / baseline' : result.forecastType === 'aggregate_demand_proxy' ? 'Experimental' : result.modelStatus
  const academicValidation = !price && ('academicValidation' in result ? result.academicValidation : null)
  const priceOrigin = price ? new Date(`${result.targetDate}T00:00:00Z`) : null
  if (priceOrigin) priceOrigin.setUTCDate(priceOrigin.getUTCDate() - 1)
  return <div className="forecast-result">
    <ForecastSavedNotice history={result.history} />
    <p role="status">Resultado disponible para {formatDateCO(result.targetDate)}.</p>
    <ForecastInsights key={historyChartKey(result)} series={price ? 'price' : result.forecastType === 'aggregate_demand_proxy' ? 'daily' : 'supply'} targetDate={result.targetDate} originDate={'forecastOriginDate' in result ? result.forecastOriginDate : priceOrigin!.toISOString().slice(0,10)} rows={result.forecastType === 'aggregate_demand_proxy' ? [{period:1,value:result.prediction.demanda_kwh}] : result.forecastType === 'generation_availability_proxy' ? result.predictions.map(p=>({period:p.hora_xm,value:p.energia_kwh})) : result.predictions.map(p=>({period:p.periodo,value:p.precio_cop_kwh}))} />
    {price && <PricePerformance key={result.rule.id + result.rule.version} result={result} elapsedMs={elapsedMs} />}
    <ForecastHistoryChart key={historyChartKey(result)} result={result} />
    <details><summary>Modelo, origen y datos utilizados</summary><dl className="forecast-metadata forecast-result-metadata">
      <div><dt>{price ? 'Regla determinista' : 'Modelo'}</dt><dd>{price ? result.rule.id : result.modelId}</dd></div>
      <div><dt>Versión</dt><dd>{price ? result.rule.version : result.modelVersion}</dd></div>
      <div><dt>Estado</dt><dd>{status === 'experimental' ? 'Experimental' : status}</dd></div>
      {!price && <div><dt>Validación académica</dt><dd>{academicValidation === 'pending' ? 'Pendiente' : academicValidation ?? 'No informada'}</dd></div>}
      <div><dt>{'sourceArtifacts' in result ? 'Datasets preparados fuente' : 'Preparado / dataset fuente'}</dt><dd>{sourceArtifactsLabel(result)}</dd></div>
      <div><dt>Fecha objetivo</dt><dd>{formatDateCO(result.targetDate)}</dd></div>
      <div><dt>Última observación / origen</dt><dd>{'forecastOriginDate' in result ? formatDateCO(result.forecastOriginDate) : priceOrigin ? formatDateCO(priceOrigin.toISOString().slice(0, 10)) : 'No informado por el resultado'}</dd></div>
      <div><dt>Unidad</dt><dd>{result.unit}</dd></div>
      <div><dt>Horizonte</dt><dd>{result.forecastType === 'aggregate_demand_proxy' ? `${result.horizonDays} día${result.horizonDays === 1 ? '' : 's'}` : result.forecastType === 'generation_availability_proxy' ? `${result.horizonDays} día${result.horizonDays === 1 ? '' : 's'} · 24 periodos del día objetivo` : '1 día · 24 periodos'}</dd></div>
    </dl></details>
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

export function ForecastRunOutcome({ title, state, elapsedMs }: { title: string; state: ForecastRunState; elapsedMs?: number }) {
  return <>
    {state.kind === 'loading' && <p className="forecast-state" role="status">Cargando... Consultando {title.toLowerCase()}.</p>}
    {state.kind === 'error' && <p className="forecast-state" role="alert">No pudimos generar el pronóstico: {state.message}</p>}
    {state.kind === 'idle' && <p className="forecast-state">Sin pronóstico solicitado.</p>}
    {state.kind === 'success' && <ResultView result={state.result} elapsedMs={elapsedMs} />}
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
  if (availability.availabilityError) return <p className="forecast-availability" role="alert">Error de disponibilidad: {availability.availabilityError.message}</p>
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
  const [elapsedMs, setElapsedMs] = useState<number | undefined>(undefined)
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (kind === 'price' || availabilityState.kind !== 'success' || !availabilityState.availability.eligibleFutureTargetDates.includes(targetDate)) return
    const controller = new AbortController();
    (kind === 'supply' ? getSupplyMetrics : getDemandMetrics)(selectedHorizonDays(targetDate, availabilityState.availability), controller.signal).then(value => { if (!controller.signal.aborted) setMetrics(value) })
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
    const controller = new AbortController(), started = performance.now()
    setElapsedMs(undefined)
    request.current = controller; setRunState({ kind: 'loading' })
    try {
      const response = await config.run({ preparedDatasetId, targetDate }, controller.signal)
      if (!controller.signal.aborted) {
        setElapsedMs(performance.now() - started)
        setRunState({ kind: 'success', result: response })

      }
    } catch (reason) {
      if (!controller.signal.aborted) setRunState({ kind: 'error', message: errorMessage(reason) })
    } finally {
      if (request.current === controller) request.current = null
    }
  }
  function clear() { setRunState({ kind: 'idle' }); if (kind !== 'price') { setMetrics(null); setMetricsError(''); setMetricsLoading(true) } }
  const unavailable = availabilityState.kind !== 'success' || !availabilityState.availability.hasFutureForecastWindow || !availabilityState.availability.eligibleFutureTargetDates.includes(targetDate) ||
    (kind === 'price' && availabilityState.availability.eligiblePreparedDatasetIds !== undefined && !availabilityState.availability.eligiblePreparedDatasetIds.includes(Number(preparedId)))
  const dates = availabilityState.kind === 'success' ? availabilityState.availability.eligibleFutureTargetDates : []
  return <section className="panel forecast-panel" aria-label={config.title}>
    <SectionHeader eyebrow={config.source} title={config.title} description={config.description}>
      <StatusBadge>{kind === 'price' ? 'Regla determinista · B1' : 'Modelo experimental · Ridge'}</StatusBadge>
    </SectionHeader>
    <details open={availabilityState.kind !== 'success' || !availabilityState.availability.hasFutureForecastWindow}><summary>Disponibilidad y origen de los datos</summary><ForecastAvailabilityView state={availabilityState} /></details>
    <p className="section-description">{config.requiresPreparedDataset ? 'Elige un dataset preparado compatible y una fecha objetivo.' : 'Elige una fecha objetivo.'} Las solicitudes se realizan únicamente al pulsar Generar pronóstico.</p>
    <form onSubmit={submit}>
      <fieldset disabled={runState.kind === 'loading' || availabilityState.kind !== 'success' || !availabilityState.availability.hasFutureForecastWindow}>
        <legend>Configura tu pronóstico</legend>
        {config.requiresPreparedDataset && <PreparedDatasetSelect value={preparedId} onChange={value => { setPreparedId(value); clear() }} requirements={[profiles[kind as 'demand' | 'price']]} eligibleIds={availabilityState.kind === 'success' ? availabilityState.availability.eligiblePreparedDatasetIds : undefined} />}
        <ForecastTargetDateSelect dates={dates} value={targetDate} onChange={date => { setTargetDate(date); clear() }} />
      </fieldset>
      <p className="section-description forecast-horizon">Horizonte seleccionado: <strong>{kind !== 'price' && availabilityState.kind === 'success' && availabilityState.availability.eligibleFutureTargetDates.includes(targetDate) ? `${selectedHorizonDays(targetDate, availabilityState.availability)} días` : kind === 'price' ? '1 día' : 'Selecciona una fecha'}</strong></p>
      <button className="primary-button" disabled={runState.kind === 'loading' || unavailable} type="submit">{runState.kind === 'loading' ? 'Cargando...' : runState.kind === 'error' ? 'Reintentar consulta' : 'Generar pronóstico'}</button>
    </form>
    {kind === 'price' && <p className="section-description">Cada solicitud registra una nueva ejecución HU-09, incluso si repites la misma fecha.</p>}
    <ForecastRunOutcome title={config.title} state={runState} elapsedMs={elapsedMs} />
    {metricsLoading && <p role="status">Cargando métricas del modelo…</p>}
    {metricsError && <div role="alert"><p>{metricsError}</p><button type="button" className="secondary-button" onClick={() => {
      setMetricsError(''); setMetricsLoading(true)
      setRetry(n => n + 1)
    }}>Reintentar métricas</button></div>}
    {metrics && <MetricsView elapsedMs={elapsedMs} metrics={metrics} result={runState.kind === 'success' ? runState.result : null} />}
  </section>
}

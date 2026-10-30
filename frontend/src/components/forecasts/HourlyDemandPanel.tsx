import { ForecastSavedNotice } from './ForecastSavedNotice'
import { ModelPerformance } from './ModelPerformance'
import { ForecastInsights } from './ForecastInsights'
import { xmPeriodLabel } from '../../utils/forecastInsights'
import { HourlyRidgeResult } from './HourlyRidgeResult'
import { getRidgeAvailability, forecastHourlyRidge, type RidgeAvailability, type RidgeHourlyResult } from '../../services/hourlyRidgeService'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../services/apiClient'
import { forecastHourlyDemand, getHourlyModels, type HourlySeries, type HourlyForecast, type HourlyModel, type HourlyModelInfo } from '../../services/chronosHourlyService'
import { SectionHeader } from '../ui/SectionHeader'
import { StatusBadge } from '../ui/StatusBadge'
import { SeriesChart } from '../charts/SeriesChart'
import { formatDateCO, formatEnergyKWh, formatPriceCOPPerKWh } from '../../utils/numberFormat'

export function HourlyDemandResult({ result, series = 'demand', elapsedMs }: { result: HourlyForecast; series?: HourlySeries; elapsedMs?: number }) {
  const label = labels[series], format = series === 'price' ? formatPriceCOPPerKWh : formatEnergyKWh
  const m = result.historicalMetrics
  return <div className="forecast-result">
    <ForecastSavedNotice history={result.history} />
    <p role="status">{label.title} para {formatDateCO(result.targetDate)}.</p>
    <details><summary>Modelo, origen y trazabilidad</summary><dl className="forecast-metadata">
      <div><dt>Modelo</dt><dd>{result.model === 'chronos2' ? 'Chronos-2' : 'Chronos-Bolt Small'}</dd></div>
      <div><dt>Última observación completa</dt><dd>{formatDateCO(result.latestObservedDate)}</dd></div>
      <div><dt>Horizonte desde el último dato</dt><dd>{result.horizonDays} días · {result.generatedPeriods} periodos</dd></div>
      <div><dt>Periodos intermedios</dt><dd>{result.bridgePeriods}; se muestran los 24 del día objetivo</dd></div>
      <div><dt>Evidencia de la consulta</dt><dd>{result.trace.executionId}</dd></div>
    </dl>
    {result.warnings.map(warning => <p key={warning} className="section-description">{warning}</p>)}
    </details>
    <ModelPerformance name={result.model === 'chronos2' ? 'Chronos-2' : 'Chronos-Bolt Small'} version={result.modelVersion} source={label.source + '/Sistema'} unit={series === 'price' ? 'COP/kWh' : 'kWh'} metrics={m} evaluatedHorizon={m ? 1 : undefined} selectedHorizon={result.horizonDays} elapsedMs={elapsedMs} />
    <ForecastInsights key={result.trace.executionId} series={series} targetDate={result.targetDate} originDate={result.latestObservedDate} rows={result.predictions.map(q=>({period:q.periodo,value:q.q50,low:q.q10,high:q.q90}))} />
    <SeriesChart title={label.title} description="Mediana y cuantiles 10–90 %. No representan una garantía de cobertura futura." unit={series === 'price' ? 'COP/kWh' : 'kWh'} state={{ kind: 'success', lines: ([['q50', 'Mediana', '#1e5945', undefined], ['q10', 'Cuantil 10 %', '#8a6c3e', '5 4'], ['q90', 'Cuantil 90 %', '#8a6c3e', '5 4']] as const).map(([key, label, color, dash]) => ({ id: key, label, color, dash, points: result.predictions.map(q => ({ key: String(q.periodo), label: `P${q.periodo}`, value: q[key], detail: `${formatDateCO(result.targetDate)} · P${q.periodo} · ${xmPeriodLabel(q.periodo)}: ${format(q[key])}` })) })) }} />

  </div>
}

const message = (reason: unknown) => reason instanceof ApiError ? reason.serverMessage ?? reason.message : 'No fue posible consultar el pronóstico horario.'
const labels = {
  demand: { title: 'Demanda horaria experimental', source: 'XM DemaReal', description: 'Estimación nacional por periodo. Excluye alumbrado público; no equivale a demanda diaria DemaSIN ni a consumo individual.', button: 'Consultar demanda horaria' },
  supply: { title: 'Oferta horaria experimental', source: 'XM Gene', description: 'Generación agregada nacional como aproximación de oferta. No estima la disponibilidad ni las ofertas de un proveedor.', button: 'Consultar oferta horaria' },
  price: { title: 'Precio horario experimental', source: 'XM PrecBolsNaci', description: 'Precio de bolsa nacional de referencia en COP/kWh. No equivale a una tarifa individual ni garantiza el precio de una transacción.', button: 'Consultar precio horario' },
} as const
export function HourlyDemandPanel({ series = 'demand', initialModel = 'chronos2', hideModelSelector = false }: { series?: HourlySeries; initialModel?: HourlyModel | 'ridge'; hideModelSelector?: boolean }) {
  const label = labels[series]
  const [models, setModels] = useState<HourlyModelInfo[]>([]), [model, setModel] = useState<HourlyModel | 'ridge'>(initialModel)
  const [targetDate, setTargetDate] = useState(''), [result, setResult] = useState<HourlyForecast | null>(null)
  const [ridgeAvailability, setRidgeAvailability] = useState<RidgeAvailability | null>(null), [ridgeResult, setRidgeResult] = useState<RidgeHourlyResult | null>(null)
  const [ridgeError, setRidgeError] = useState('')
  const [elapsedMs, setElapsedMs] = useState<number | undefined>(undefined)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const [catalogLoading,setCatalogLoading] = useState(initialModel !== 'ridge'), [catalogRevision,setCatalogRevision] = useState(0)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    if (!hideModelSelector || initialModel !== 'ridge') getHourlyModels(controller.signal, series).then(v => { if (!controller.signal.aborted) setModels(v) }).catch(e => { if (!controller.signal.aborted) setError(message(e)) }).finally(() => { if (!controller.signal.aborted) setCatalogLoading(false) })
    return () => { controller.abort(); request.current?.abort() }
  }, [series, initialModel, hideModelSelector, catalogRevision])
  useEffect(() => {
    if (series === 'supply' || (hideModelSelector && initialModel !== 'ridge')) return
    const controller = new AbortController()
    getRidgeAvailability(series, controller.signal).then(a => { if (!controller.signal.aborted) setRidgeAvailability(a) }).catch(e => { if (!controller.signal.aborted) setRidgeError(message(e)) })
    return () => controller.abort()
  }, [series, initialModel, hideModelSelector])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || request.current) return
    const controller = new AbortController(), started = performance.now(); request.current = controller; setElapsedMs(undefined)
    setLoading(true); setError(''); setResult(null); setRidgeResult(null)
    try {
      if (model === 'ridge' && series !== 'supply') { const value = await forecastHourlyRidge(series, targetDate, controller.signal); if (!controller.signal.aborted) { setElapsedMs(performance.now() - started); setRidgeResult(value) } }
      else if (model !== 'ridge') { const value = await forecastHourlyDemand({ model, targetDate }, controller.signal, series); if (!controller.signal.aborted) { setElapsedMs(performance.now() - started); setResult(value) } }
    }
    catch (reason) { if (!controller.signal.aborted) setError(message(reason)) }
    finally { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setLoading(false) }
  }
  const configured = model === 'ridge' ? !!ridgeAvailability?.eligibleTargetDates.length : models.find(v => v.key === model)?.configured
  return <section className="panel forecast-panel" aria-label={label.title}>
    <SectionHeader eyebrow={`${label.source} · Modelos horarios`} title={label.title} description={label.description}><StatusBadge>Experimental</StatusBadge></SectionHeader>
    <form onSubmit={submit} className="forecast-form">
      {!hideModelSelector && <label>Modelo<select value={model} disabled={loading} onChange={e => { setModel(e.target.value as HourlyModel | 'ridge'); setResult(null); setRidgeResult(null); setTargetDate(''); setError('') }}><option value="chronos2">Chronos-2</option><option value="bolt">Chronos-Bolt Small</option>{series !== 'supply' && <option value="ridge">Ridge horario experimental</option>}</select></label>}
      <label>Fecha objetivo{model === 'ridge' ? <select required value={targetDate} disabled={loading || !configured} onChange={e => { setTargetDate(e.target.value); setRidgeResult(null) }}><option value="">Selecciona una fecha elegible</option>{ridgeAvailability?.eligibleTargetDates.map(date => <option key={date} value={date}>{formatDateCO(date)}</option>)}</select> : <input type="date" required value={targetDate} disabled={loading} onChange={e => { setTargetDate(e.target.value); setResult(null) }} />}</label>
      <button type="submit" disabled={loading || !configured || !targetDate}>{loading ? 'Generando pronóstico…' : 'Generar pronóstico'}</button>
    </form>
    {model !== 'ridge' && catalogLoading && <p role="status">Consultando catálogo de modelos…</p>}
    {model !== 'ridge' && !catalogLoading && !configured && <button type="button" className="secondary-button" onClick={() => { setError('');setCatalogLoading(true);setCatalogRevision(value => value+1) }}>Reintentar catálogo</button>}
    {model !== 'ridge' && !configured && models.length > 0 && <p role="status">El modelo seleccionado no está disponible en este servidor.</p>}
    {model === 'ridge' && <p role="status">{ridgeError || (ridgeAvailability ? `Ridge admite h${ridgeAvailability.supportedHorizons.join(', h')} desde el último día completo publicado.${!ridgeAvailability.eligibleTargetDates.length ? ' No hay fechas futuras elegibles con el origen actual.' : ''}` : 'Verificando datos y horizontes Ridge…')}</p>}
    {loading && <p role="status">La consulta puede tardar varios minutos si XM requiere reintentos. Se verifica el contexto publicado antes de generar el resultado.</p>}
    {error && <p role="alert">{error}</p>}
    {!result && !ridgeResult && model !== 'ridge' && models.find(v=>v.key===model) && <ModelPerformance name={models.find(v=>v.key===model)!.name} version={models.find(v=>v.key===model)!.revision} source={label.source + '/Sistema'} unit={series==='price' ? 'COP/kWh' : 'kWh'} metrics={models.find(v=>v.key===model)!.historicalMetrics} evaluatedHorizon={series==='demand' ? 1 : undefined} />}
    {!loading && !error && !ridgeResult && !result && <p className="forecast-state">Elige una fecha y genera el pronóstico. Aquí aparecerán la gráfica y sus resultados.</p>}
    {ridgeResult && <HourlyRidgeResult result={ridgeResult} elapsedMs={elapsedMs} />}
    {result && <HourlyDemandResult result={result} series={series} elapsedMs={elapsedMs} />}
  </section>
}

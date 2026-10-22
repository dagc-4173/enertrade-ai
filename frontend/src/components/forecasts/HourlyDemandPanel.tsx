import { HourlyRidgeResult } from './HourlyRidgeResult'
import { getRidgeAvailability, forecastHourlyRidge, type RidgeAvailability, type RidgeHourlyResult } from '../../services/hourlyRidgeService'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../services/apiClient'
import { forecastHourlyDemand, getHourlyModels, type HourlySeries, type HourlyForecast, type HourlyModel, type HourlyModelInfo } from '../../services/chronosHourlyService'
import { SectionHeader } from '../ui/SectionHeader'
import { StatusBadge } from '../ui/StatusBadge'
import { SeriesChart } from '../charts/SeriesChart'
import { formatDateCO, formatEnergyKWh, formatPriceCOPPerKWh, formatPercentCO } from '../../utils/numberFormat'

export function HourlyDemandResult({ result, series = 'demand' }: { result: HourlyForecast; series?: HourlySeries }) {
  const label = labels[series], format = series === 'price' ? formatPriceCOPPerKWh : formatEnergyKWh
  const m = result.historicalMetrics
  return <div className="forecast-result">
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
    <SeriesChart title={label.title} description="Mediana y cuantiles 10–90 %. No representan una garantía de cobertura futura." unit={series === 'price' ? 'COP/kWh' : 'kWh'} state={{ kind: 'success', lines: ([['q50', 'Mediana', '#1e5945', undefined], ['q10', 'Cuantil 10 %', '#8a6c3e', '5 4'], ['q90', 'Cuantil 90 %', '#8a6c3e', '5 4']] as const).map(([key, label, color, dash]) => ({ id: key, label, color, dash, points: result.predictions.map(q => ({ key: String(q.periodo), label: `P${q.periodo}`, value: q[key], detail: `Periodo ${q.periodo}: ${format(q[key])}` })) })) }} />
    <details><summary>Evaluación histórica de referencia</summary>{m ? <>
    <p className="section-description">{formatDateCO(m.range.start)} — {formatDateCO(m.range.end)}. Horizonte histórico de un día; no garantiza el resultado con datos atrasados.</p>
    <dl className="forecast-metadata"><div><dt>MAE</dt><dd>{format(m.MAE)}</dd></div><div><dt>RMSE</dt><dd>{format(m.RMSE)}</dd></div><div><dt>WAPE</dt><dd>{formatPercentCO(m.WAPE_percent)}</dd></div><div><dt>Cobertura histórica del intervalo nominal 80 %</dt><dd>{formatPercentCO(m.coverageQ10Q90 * 100)}</dd></div></dl>
    </> : <p role="status">Evaluación histórica específica pendiente para esta variable. No se muestran métricas de demanda.</p>}</details>
    <details><summary>Ver los 24 periodos</summary><div className="table-scroll"><table><thead><tr><th>Periodo XM</th><th>Cuantil 10 %</th><th>Mediana</th><th>Cuantil 90 %</th></tr></thead><tbody>{result.predictions.map(q => <tr key={q.periodo}><td>{q.periodo}</td><td>{format(q.q10)}</td><td>{format(q.q50)}</td><td>{format(q.q90)}</td></tr>)}</tbody></table></div></details>
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
  const [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    if (!hideModelSelector || initialModel !== 'ridge') getHourlyModels(controller.signal, series).then(v => { if (!controller.signal.aborted) setModels(v) }).catch(e => { if (!controller.signal.aborted) setError(message(e)) })
    return () => { controller.abort(); request.current?.abort() }
  }, [series, initialModel, hideModelSelector])
  useEffect(() => {
    if (series === 'supply' || (hideModelSelector && initialModel !== 'ridge')) return
    const controller = new AbortController()
    getRidgeAvailability(series, controller.signal).then(a => { if (!controller.signal.aborted) setRidgeAvailability(a) }).catch(e => { if (!controller.signal.aborted) setRidgeError(message(e)) })
    return () => controller.abort()
  }, [series, initialModel, hideModelSelector])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || request.current) return
    const controller = new AbortController(); request.current = controller
    setLoading(true); setError(''); setResult(null); setRidgeResult(null)
    try {
      if (model === 'ridge' && series !== 'supply') { const value = await forecastHourlyRidge(series, targetDate, controller.signal); if (!controller.signal.aborted) setRidgeResult(value) }
      else if (model !== 'ridge') { const value = await forecastHourlyDemand({ model, targetDate }, controller.signal, series); if (!controller.signal.aborted) setResult(value) }
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
    {model !== 'ridge' && !configured && models.length > 0 && <p role="status">El modelo seleccionado no está disponible en este servidor.</p>}
    {model === 'ridge' && <p role="status">{ridgeError || (ridgeAvailability ? `Ridge admite h${ridgeAvailability.supportedHorizons.join(', h')} desde el último día completo publicado.${!ridgeAvailability.eligibleTargetDates.length ? ' No hay fechas futuras elegibles con el origen actual.' : ''}` : 'Verificando datos y horizontes Ridge…')}</p>}
    {loading && <p role="status">La consulta puede tardar hasta dos minutos. Se verifica el contexto publicado antes de generar el resultado.</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !ridgeResult && !result && <p className="forecast-state">Elige una fecha y genera el pronóstico. Aquí aparecerán la gráfica y sus resultados.</p>}
    {ridgeResult && <HourlyRidgeResult result={ridgeResult} />}
    {result && <HourlyDemandResult result={result} series={series} />}
  </section>
}

import { EnergyHistoryTable } from './EnergyHistoryTable'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../services/apiClient'
import { getEnergyCoverage, getLiveEnergySeries } from '../../services/energySeriesService'
import type { EnergySeriesGranularity, EnergySeriesMetric, EnergySeriesResponse } from '../../types/energySeries'
import { formatDateCO, formatEnergyKWh, formatPriceCOPPerKWh } from '../../utils/numberFormat'
import { SectionHeader } from '../ui/SectionHeader'
import { SeriesChart, type ChartState } from './SeriesChart'

const labels: Record<EnergySeriesMetric, string> = { gene: 'Generación', demand: 'Demanda', price: 'Precio' }
const granularities: Record<EnergySeriesMetric, EnergySeriesGranularity[]> = { gene: ['hourly', 'daily', 'monthly'], demand: ['daily', 'monthly'], price: ['hourly', 'daily', 'monthly'] }
const errorMessage = (error: unknown) => error instanceof ApiError ? error.serverMessage ?? error.message : 'No fue posible consultar el histórico energético.'
const span = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
const labelDate = (value: string) => /^\d{4}-\d{2}$/.test(value) ? `${value.slice(5, 7)}/${value.slice(0, 4)}` : formatDateCO(value)

export function EnergyHistoryExplorer() {
  const [metric, setMetric] = useState<EnergySeriesMetric>('gene')
  const [granularity, setGranularity] = useState<EnergySeriesGranularity>('hourly')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [coverage, setCoverage] = useState<{ availableFrom: string | null; availableUntil: string | null } | null>(null)
  const [coverageError, setCoverageError] = useState('')
  const [data, setData] = useState<EnergySeriesResponse | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle')
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    request.current?.abort()
    getEnergyCoverage(metric, controller.signal).then(value => {
      if (controller.signal.aborted) return
      setCoverage(value)
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      const start = new Date(`${today}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 6)
      setFrom(start.toISOString().slice(0, 10)); setTo(today)
    }).catch(reason => { if (!controller.signal.aborted) setCoverageError(errorMessage(reason)) })
    return () => controller.abort()
  }, [metric])

  function reset() { request.current?.abort(); setData(null); setError(''); setState('idle') }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); reset()
    const days = span(from, to)
    if (!from || !to || !Number.isFinite(days) || days < 1) { setError('Selecciona una fecha inicial y una fecha final válidas.'); setState('error'); return }
    const maximum = granularity === 'hourly' ? 31 : 366
    if (maximum !== null && days > maximum) { setError(`La granularidad ${granularity === 'hourly' ? 'horaria' : 'diaria'} permite como máximo ${maximum} días inclusivos.`); setState('error'); return }
    const controller = new AbortController(); request.current?.abort(); request.current = controller; setState('loading')
    try { const value = await getLiveEnergySeries({ metric, from, to, granularity }, controller.signal); if (!controller.signal.aborted) { setData(value); setState('success') } }
    catch (reason) { if (!controller.signal.aborted) { setError(errorMessage(reason)); setState('error') } }
  }
  const chart: ChartState = state === 'loading' ? { kind: 'loading' } : state === 'error' ? { kind: 'error', message: error } : state === 'success' && data
    ? data.points.length === 0 ? { kind: 'empty', message: 'La cobertura consultada no contiene observaciones.' } : { kind: 'success', lines: [{ id: metric, label: labels[metric], color: metric === 'price' ? '#b17800' : '#00652e', points: data.points.map(point => ({ key: `${point.date}/${point.period ?? ''}`, label: point.period === undefined ? labelDate(point.date) : `${labelDate(point.date)} P${point.period}`, value: point.value, detail: `${labelDate(point.date)}${point.period === undefined ? '' : `, periodo ${point.period}`}: ${data.unit === 'COP/kWh' ? formatPriceCOPPerKWh(point.value) : formatEnergyKWh(point.value)}` })) }] }
    : { kind: 'empty', message: 'Configura un rango y consulta el histórico. No se cargan series al abrir la página.' }
  return <section className="panel energy-history">
    <SectionHeader eyebrow="C18c" title="Histórico energético" description="Consulta las observaciones publicadas por XM al pulsar Consultar histórico. Si XM falla, se identifica el respaldo local." />
    <p role="status">{coverageError || (coverage ? coverage.availableFrom && coverage.availableUntil ? `Cobertura local registrada: ${formatDateCO(coverage.availableFrom)} a ${formatDateCO(coverage.availableUntil)}. Puede contener días o periodos faltantes.` : 'No hay históricos consolidados para esta métrica.' : 'Consultando cobertura disponible…')}</p>
    <form className="energy-history__filters" onSubmit={submit}>
      <label>Métrica<select value={metric} onChange={event => { const next = event.target.value as EnergySeriesMetric; setCoverage(null); setCoverageError(''); setFrom(''); setTo(''); setMetric(next); setGranularity(granularities[next][0]); reset() }}><option value="gene">Generación</option><option value="demand">Demanda</option><option value="price">Precio</option></select></label>
      <label>Granularidad<select value={granularity} onChange={event => { setGranularity(event.target.value as EnergySeriesGranularity); reset() }}>{granularities[metric].map(value => <option key={value} value={value}>{value === 'hourly' ? 'Horaria' : value === 'daily' ? 'Diaria' : 'Mensual'}</option>)}</select></label>
      <label>Desde<input type="date" required value={from} onChange={event => { setFrom(event.target.value); reset() }} /></label>
      <label>Hasta<input type="date" required min={from || undefined} value={to} onChange={event => { setTo(event.target.value); reset() }} /></label>
      <button type="submit" className="primary-button" disabled={state === 'loading'}>{state === 'loading' ? 'Consultando…' : 'Consultar histórico'}</button>
    </form>
    {data?.freshness && <p role="status">{data.freshness.message} {data.freshness.checkedAt ? `Consulta XM: ${new Date(data.freshness.checkedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}.` : ''}</p>}
    {data?.completeness?.partial && <p role="status">Cobertura parcial: faltan {data.completeness.missingObservationCount} observaciones en {data.completeness.missingDates.length} días del intervalo solicitado. Se muestran solo datos observados; no se rellenan faltantes. Las sumas y los promedios de esos días o meses pueden estar incompletos.</p>}
    <SeriesChart title={`${labels[metric]} histórica`} description={metric === 'price' && granularity !== 'hourly' ? 'El valor mostrado es el promedio definido por el contrato C18c.' : 'Observaciones históricas disponibles para el intervalo solicitado.'} unit={metric === 'price' ? 'COP/kWh' : 'kWh'} state={chart} footer={data ? <p className="series-chart__trace">Cobertura: {data.coverage.availableFrom ? formatDateCO(data.coverage.availableFrom) : 'sin datos'} a {data.coverage.availableUntil ? formatDateCO(data.coverage.availableUntil) : 'sin datos'}. Origen: {data.freshness?.source === 'xm' ? 'consulta directa a XM' : 'consolidados locales'}. Fuentes locales: {(data.sources ?? [{ sourceDatasetId: data.sourceDatasetId, consolidatedDatasetId: data.consolidatedDatasetId, contentHash: data.contentHash }]).map(source => `dataset ${source.sourceDatasetId}, consolidado ${source.consolidatedDatasetId}, hash ${source.contentHash}`).join('; ')}.</p> : undefined} />
    {state === 'success' && data && <EnergyHistoryTable key={`${data.metric}/${data.granularity}/${data.requestedFrom}/${data.requestedTo}/${data.contentHash}/${data.freshness?.checkedAt ?? 'local'}`} data={data} />}
  </section>
}
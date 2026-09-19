import { useEffect, useState } from 'react'
import { ApiError } from '../../services/apiClient'
import { getEnergySeries } from '../../services/energySeriesService'
import type { EnergySeriesRequest, EnergySeriesResponse } from '../../types/energySeries'
import type { DemandForecast, PriceForecast, SupplyForecast } from '../../types/forecast'
import { formatDateCO, formatEnergyKWh, formatPriceCOPPerKWh } from '../../utils/numberFormat'
import { SeriesChart, type ChartState } from './SeriesChart'

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'success'; value: EnergySeriesResponse }
const offsetDate = (date: string, offset: number) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10) }
const errorMessage = (error: unknown) => error instanceof ApiError ? error.serverMessage ?? error.message : 'No fue posible cargar la serie histórica real.'

function useRealSeries({ metric, from, to, granularity }: EnergySeriesRequest): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    getEnergySeries({ metric, from, to, granularity }, controller.signal).then(value => { if (!controller.signal.aborted) setState({ kind: 'success', value }) }).catch(error => { if (!controller.signal.aborted) setState({ kind: 'error', message: errorMessage(error) }) })
    return () => controller.abort()
  }, [metric, from, to, granularity])
  return state
}

export function SupplyHistoryChart({ result }: { result: SupplyForecast }) {
  const d7 = offsetDate(result.targetDate, -7), d1 = offsetDate(result.targetDate, -1)
  const state = useRealSeries({ metric: 'gene', from: d7, to: d1, granularity: 'hourly' })
  let chart: ChartState = state.kind === 'loading' ? state : state.kind === 'error' ? state : { kind: 'empty', message: 'No hay historia suficiente para comparar D-7 y D-1.' }
  if (state.kind === 'success') {
    const build = (date: string) => state.value.points.filter(point => point.date === date && point.period !== undefined).map(point => ({ key: String(point.period), label: `P${point.period}`, value: point.value, detail: `${formatDateCO(point.date)}, periodo ${point.period}: ${formatEnergyKWh(point.value)}` }))
    const d1Points = build(d1), d7Points = build(d7)
    const forecast = result.predictions.map(row => ({ key: String(row.hora_xm), label: `P${row.hora_xm}`, value: row.energia_kwh, detail: `${formatDateCO(result.targetDate)}, periodo ${row.hora_xm}: ${formatEnergyKWh(row.energia_kwh)}` }))
    chart = d1Points.length === 24 && d7Points.length === 24 ? { kind: 'success', lines: [{ id: 'd1', label: `D-1 · ${formatDateCO(d1)}`, color: '#00652e', points: d1Points }, { id: 'd7', label: `D-7 · ${formatDateCO(d7)}`, color: '#2d4851', dash: '6 4', points: d7Points }, { id: 'forecast', label: `Pronóstico D · ${formatDateCO(result.targetDate)}`, color: '#b17800', dash: '2 3', points: forecast }] } : chart
  }
  return <SeriesChart title="Comparación de generación" description="Histórico XM de D-1 y D-7 frente al pronóstico del día objetivo, por periodo 1 a 24." unit="kWh" state={chart} />
}

export function DemandHistoryChart({ result }: { result: DemandForecast }) {
  const from = offsetDate(result.targetDate, -30), to = offsetDate(result.targetDate, -1)
  const state = useRealSeries({ metric: 'demand', from, to, granularity: 'daily' })
  let chart: ChartState = state.kind === 'loading' ? state : state.kind === 'error' ? state : { kind: 'empty', message: 'No hay observaciones recientes de demanda para comparar.' }
  if (state.kind === 'success' && state.value.points.length > 0) chart = { kind: 'success', lines: [
    { id: 'observed', label: 'Histórico XM', color: '#00652e', points: state.value.points.map(point => ({ key: point.date, label: formatDateCO(point.date), value: point.value, detail: `${formatDateCO(point.date)}: ${formatEnergyKWh(point.value)}` })) },
    { id: 'forecast', label: `Pronóstico D · ${formatDateCO(result.targetDate)}`, color: '#b17800', dash: '2 3', points: [{ key: result.targetDate, label: formatDateCO(result.targetDate), value: result.prediction.demanda_kwh, detail: `${formatDateCO(result.targetDate)}: ${formatEnergyKWh(result.prediction.demanda_kwh)}` }] },
  ] }
  return <SeriesChart title="Demanda reciente y pronóstico" description="Últimos 30 días disponibles de demanda SIN y el único valor pronosticado para el día objetivo." unit="kWh" state={chart} />
}

export function PriceHistoryChart({ result }: { result: PriceForecast }) {
  const d1 = offsetDate(result.targetDate, -1)
  const state = useRealSeries({ metric: 'price', from: d1, to: d1, granularity: 'hourly' })
  let chart: ChartState = state.kind === 'loading' ? state : state.kind === 'error' ? state : { kind: 'empty', message: 'No hay precio observado D-1 para comparar con B1.' }
  if (state.kind === 'success') {
    const observed = state.value.points.filter(point => point.period !== undefined).map(point => ({ key: String(point.period), label: `P${point.period}`, value: point.value, detail: `${formatDateCO(point.date)}, periodo ${point.period}: ${formatPriceCOPPerKWh(point.value)}` }))
    const forecast = result.predictions.map(row => ({ key: String(row.periodo), label: `P${row.periodo}`, value: row.precio_cop_kwh, detail: `${formatDateCO(result.targetDate)}, periodo ${row.periodo}: ${formatPriceCOPPerKWh(row.precio_cop_kwh)}` }))
    chart = observed.length === 24 ? { kind: 'success', lines: [{ id: 'observed', label: `Observado D-1 · ${formatDateCO(d1)}`, color: '#00652e', points: observed }, { id: 'forecast', label: `Estimado B1 · ${formatDateCO(result.targetDate)}`, color: '#b17800', dash: '6 4', points: forecast }] } : chart
  }
  return <SeriesChart title="Precio observado y estimado" description="Regla determinista B1: el precio estimado por periodo coincide con el observado del mismo periodo en D-1." unit="COP/kWh" state={chart} />
}

export function ForecastHistoryChart({ result }: { result: SupplyForecast | DemandForecast | PriceForecast }) {
  if (result.forecastType === 'generation_availability_proxy') return <SupplyHistoryChart result={result} />
  if (result.forecastType === 'aggregate_demand_proxy') return <DemandHistoryChart result={result} />
  return <PriceHistoryChart result={result} />
}
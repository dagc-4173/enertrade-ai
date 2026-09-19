import type { ReactNode } from 'react'
import { formatNumberCO } from '../../utils/numberFormat'
import './SeriesChart.css'

export interface ChartPoint { key: string; label: string; value: number; detail: string }
export interface ChartLine { id: string; label: string; color: string; dash?: string; points: ChartPoint[] }
export type ChartState =
  | { kind: 'loading' }
  | { kind: 'empty'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'success'; lines: ChartLine[] }

const width = 720
const height = 300
const padding = { top: 24, right: 22, bottom: 44, left: 76 }

function coordinates(lines: ChartLine[]) {
  const points = lines.flatMap(line => line.points)
  const values = points.map(point => point.value)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const range = maximum - minimum || Math.max(Math.abs(maximum) * 0.1, 1)
  const keys = [...new Set(points.map(point => point.key))]
  const x = (key: string) => padding.left + Math.max(0, keys.indexOf(key)) * (width - padding.left - padding.right) / Math.max(keys.length - 1, 1)
  const y = (value: number) => padding.top + (maximum - value) * (height - padding.top - padding.bottom) / range
  return { keys, minimum, maximum, x, y }
}

function StateMessage({ state }: { state: Exclude<ChartState, { kind: 'success' }> }) {
  if (state.kind === 'loading') return <div className="series-state series-state--loading" role="status"><span /><span /><span /><p>Cargando serie histórica real…</p></div>
  return <p className="series-state" role={state.kind === 'error' ? 'alert' : 'status'}>{state.message}</p>
}

export function SeriesChart({ title, description, unit, state, footer }: { title: string; description: string; unit: string; state: ChartState; footer?: ReactNode }) {
  const headingId = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-title`
  const descriptionId = `${headingId}-description`
  if (state.kind !== 'success') return <section className="series-chart" aria-labelledby={headingId}><div className="series-chart__heading"><div><h3 id={headingId}>{title}</h3><p id={descriptionId}>{description}</p></div><strong>{unit}</strong></div><StateMessage state={state} /></section>
  const populated = state.lines.filter(line => line.points.length > 0)
  if (populated.length === 0) return <section className="series-chart" aria-labelledby={headingId}><div className="series-chart__heading"><div><h3 id={headingId}>{title}</h3><p id={descriptionId}>{description}</p></div><strong>{unit}</strong></div><StateMessage state={{ kind: 'empty', message: 'No hay observaciones para graficar.' }} /></section>
  const { keys, minimum, maximum, x, y } = coordinates(populated)
  const labelIndexes = keys.length <= 6 ? keys.map((_, index) => index) : Array.from({ length: 6 }, (_, index) => Math.round(index * (keys.length - 1) / 5))
  const labels = [...new Set(labelIndexes)].map(index => keys[index]!).filter(Boolean)
  return <section className="series-chart" aria-labelledby={headingId}>
    <div className="series-chart__heading"><div><h3 id={headingId}>{title}</h3><p id={descriptionId}>{description}</p></div><strong>{unit}</strong></div>
    <svg className="series-chart__canvas" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${headingId} ${descriptionId}`}>
      <line x1={padding.left} x2={width - padding.right} y1={padding.top} y2={padding.top} className="series-chart__grid" />
      <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} className="series-chart__grid" />
      <text x={padding.left - 10} y={padding.top + 4} textAnchor="end" className="series-chart__axis">{formatNumberCO(maximum)}</text>
      <text x={padding.left - 10} y={height - padding.bottom + 4} textAnchor="end" className="series-chart__axis">{formatNumberCO(minimum)}</text>
      {labels.map(key => <text key={key} x={x(key)} y={height - 16} textAnchor="middle" className="series-chart__axis">{populated[0]?.points.find(point => point.key === key)?.label ?? key}</text>)}
      {populated.map(line => {
        const path = line.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.key)} ${y(point.value)}`).join(' ')
        return <g key={line.id}><path d={path} fill="none" stroke={line.color} strokeWidth="2.5" strokeDasharray={line.dash} aria-hidden="true" />{line.points.map(point => <circle key={point.key} cx={x(point.key)} cy={y(point.value)} r="4" fill={line.color} tabIndex={0} aria-label={`${line.label}. ${point.detail}`}><title>{`${line.label}: ${point.detail}`}</title></circle>)}</g>
      })}
    </svg>
    <ul className="series-chart__legend" aria-label="Leyenda">{populated.map(line => <li key={line.id}><span style={{ backgroundColor: line.color, borderStyle: line.dash ? 'dashed' : 'solid' }} />{line.label}</li>)}</ul>
    {footer}
  </section>
}
import { useState } from 'react'
import type { EnergySeriesResponse } from '../../types/energySeries'
import { formatDateCO, formatNumberCO } from '../../utils/numberFormat'
import './EnergyHistoryTable.css'

const PAGE_SIZE = 24

export function EnergyHistoryTable({ data }: { data: EnergySeriesResponse }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(data.points.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const start = current * PAGE_SIZE
  const hourly = data.granularity === 'hourly'
  const monthly = data.granularity === 'monthly'
  const partial = new Set(data.completeness?.missingDates ?? [])
  const incomplete = (date: string) => monthly ? [...partial].some(day => day.startsWith(date)) : partial.has(date)
  const label = (date: string) => monthly ? `${date.slice(5, 7)}/${date.slice(0, 4)}` : formatDateCO(date)

  if (!data.points.length) return null
  return <section className="history-table" aria-label="Tabla de datos históricos">
    <h3>Datos históricos consultados</h3>
    <p className="history-table__description">Los mismos valores de la gráfica, en orden cronológico. {data.freshness?.source === 'xm' ? 'Origen: consulta a XM.' : 'Origen: consolidados locales.'} Los periodos sin datos no se rellenan.</p>
    <div className="history-table__scroll" role="region" aria-label="Observaciones históricas" tabIndex={0}>
      <table>
        <caption>{data.points.length} registros · {hourly ? 'Resolución horaria' : monthly ? 'Agregación mensual' : 'Resolución diaria'}</caption>
        <thead><tr><th scope="col">{monthly ? 'Mes' : 'Fecha'}</th>{hourly && <th scope="col">Periodo XM</th>}<th scope="col" className="history-table__number">{data.metric === 'price' ? 'Precio' : data.metric === 'demand' ? 'Demanda' : 'Generación'} ({data.unit})</th><th scope="col">Cobertura</th></tr></thead>
        <tbody>{data.points.slice(start, start + PAGE_SIZE).map(point => <tr key={`${point.date}/${point.period ?? ''}`}>
          <th scope="row">{label(point.date)}</th>
          {hourly && <td>P{point.period}</td>}
          <td className="history-table__number">{formatNumberCO(point.value)}</td>
          <td>{incomplete(point.date) ? monthly ? 'Mes con faltantes' : 'Día con faltantes' : 'Sin faltantes detectados'}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <nav className="history-table__pagination" aria-label="Páginas de datos históricos">
      <p aria-live="polite">Registros {start + 1}–{Math.min(start + PAGE_SIZE, data.points.length)} de {data.points.length} · Página {current + 1} de {pages}</p>
      <div><button type="button" className="secondary-button" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button><button type="button" className="secondary-button" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Siguiente</button></div>
    </nav>
  </section>
}

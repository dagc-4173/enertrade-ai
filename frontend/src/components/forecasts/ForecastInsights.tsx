import { summarizeForecast, xmPeriodLabel, type ForecastRow } from '../../utils/forecastInsights'
import { formatDateCO, formatEnergyKWh, formatPriceCOPPerKWh } from '../../utils/numberFormat'
import './ForecastInsights.css'

export function ForecastInsights({ rows, targetDate, series, originDate }: { rows: ForecastRow[]; targetDate: string; series: 'supply' | 'demand' | 'price' | 'daily'; originDate: string }) {
  const unit = series === 'price' ? 'COP/kWh' : 'kWh', format = series === 'price' ? formatPriceCOPPerKWh : formatEnergyKWh
  const summary = summarizeForecast(rows, unit)
  const hasQuantiles = rows.some(row => row.low !== undefined || row.high !== undefined)
  return <section className="forecast-insights" aria-label="Resumen e interpretación del pronóstico">
    <h3>Resumen del día objetivo · {formatDateCO(targetDate)}</h3>
    <p className="section-description">Origen de los datos: {formatDateCO(originDate)}. {series === 'daily' ? 'Un total diario DemaSIN.' : '24 periodos XM; las horas se muestran en el calendario de Colombia.'}</p>
    {summary && <dl className="forecast-summary"><div><dt>{summary.primaryLabel}</dt><dd>{format(summary.primary)}</dd></div>{series !== 'daily' && <><div><dt>{series === 'price' ? 'Precio mínimo' : 'Mínimo por periodo'}</dt><dd>{format(summary.minimum)}</dd></div><div><dt>{series === 'price' ? 'Precio máximo' : 'Máximo por periodo'}</dt><dd>{format(summary.maximum)}</dd></div></>}</dl>}
    {hasQuantiles && <p className="forecast-insight-note">P50 es la mediana por periodo. P10 y P90 describen cuantiles experimentales, sin calibración prospectiva. La suma de medianas horarias es un resumen; no es la mediana probabilística del total diario.</p>}
    <details className="forecast-insights__table"><summary>Tabla del pronóstico por periodo</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="Tabla detallada del pronóstico"><table>
      <caption>{formatDateCO(targetDate)} · {unit}. Estimaciones para la fecha objetivo.</caption>
      <thead><tr><th scope="col">{series === 'daily' ? 'Día XM' : 'Periodo XM / hora'}</th><th scope="col">{hasQuantiles ? 'Pronóstico P50' : series === 'daily' ? 'Demanda estimada (kWh)' : series === 'price' ? 'Precio estimado (COP/kWh)' : 'Pronóstico'}</th>{hasQuantiles && <><th scope="col">P10</th><th scope="col">P90</th></>}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.period}><th scope="row">{series === 'daily' ? formatDateCO(targetDate) : `P${r.period} · ${xmPeriodLabel(r.period)}`}</th><td>{format(r.value)}</td>{hasQuantiles && <><td>{r.low === undefined ? 'No disponible' : format(r.low)}</td><td>{r.high === undefined ? 'No disponible' : format(r.high)}</td></>}</tr>)}</tbody>
    </table></div></details>
  </section>
}

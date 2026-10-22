import { useEffect, useState } from 'react'
import { getForecastAvailability } from '../services/forecastAvailabilityService'
import { getRidgeAvailability } from '../services/hourlyRidgeService'

type Item = { label: string; source: string; origin: string | null; dates: string[] }
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'success'; item: Item }
export function ForecastReadiness() {
  const [states, setStates] = useState<State[]>([{ kind: 'loading' }, { kind: 'loading' }, { kind: 'loading' }])
  const [revision, setRevision] = useState(0)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const jobs = [
      () => getForecastAvailability(controller.signal).then(rows => {
        const row = rows.find(item => item.series === 'Gene')!
        return { label: 'Oferta', source: 'Ridge · Gene · generación como aproximación de oferta', origin: row.latestObservationDate, dates: row.eligibleFutureTargetDates }
      }),
      () => getRidgeAvailability('demand', controller.signal).then(row => ({ label: 'Demanda', source: 'Ridge horario · DemaReal · excluye alumbrado público', origin: row.origin, dates: row.eligibleTargetDates })),
      () => getRidgeAvailability('price', controller.signal).then(row => ({ label: 'Precio', source: 'Ridge horario · precio de bolsa nacional', origin: row.origin, dates: row.eligibleTargetDates })),
    ]
    void Promise.all(jobs.map(async (job, index) => {
      let state: State
      try { state = { kind: 'success', item: await job() } } catch { state = { kind: 'error' } }
      if (!controller.signal.aborted) setStates(previous => previous.map((item, i) => i === index ? state : item))
    })).then(() => { if (!controller.signal.aborted) setCheckedAt(new Date().toLocaleString('es-CO')) })
    return () => controller.abort()
  }, [revision])
  return <section className="panel dashboard-readiness" aria-label="Disponibilidad de pronósticos Ridge">
    <div className="dashboard-section-heading"><div><p className="eyebrow">Datos XM y horizonte disponible</p><h2>Disponibilidad para pronosticar</h2></div>
      <button type="button" className="secondary-button" disabled={states.some(state => state.kind === 'loading')} onClick={() => { setStates([{ kind: 'loading' }, { kind: 'loading' }, { kind: 'loading' }]); setCheckedAt(null); setRevision(value => value + 1) }}>Actualizar disponibilidad</button></div>
    <p>Consulta de elegibilidad de Ridge. No ejecuta pronósticos ni certifica la disponibilidad de Chronos.</p>
    <div className="dashboard-readiness-list">{states.map((state, index) => <article key={index}>
      <h3>{['Oferta', 'Demanda', 'Precio'][index]}</h3>
      {state.kind === 'loading' && <p role="status">Consultando datos y fechas…</p>}
      {state.kind === 'error' && <p role="alert">No fue posible consultar esta variable. Puedes reintentar con Actualizar disponibilidad.</p>}
      {state.kind === 'success' && <><p>{state.item.source}</p><dl><div><dt>Último origen utilizable</dt><dd>{state.item.origin ?? 'No disponible'}</dd></div><div><dt>Fechas objetivo elegibles</dt><dd>{state.item.dates.length ? state.item.dates.join(' · ') : 'Sin fechas futuras elegibles'}</dd></div></dl></>}
    </article>)}</div>
    {checkedAt && <p className="dashboard-caption">Consulta finalizada: {checkedAt}. Las fechas disponibles dependen de la publicación y calidad de los datos.</p>}
  </section>
}

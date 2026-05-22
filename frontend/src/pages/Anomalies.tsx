import { DataTable, type DataTableColumn } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { anomalyEvents, executiveRisks } from '../data/mockData'
import type { AnomalyEvent, ExecutiveRisk } from '../types/domain'

const anomalyColumns: DataTableColumn<AnomalyEvent>[] = [
  { header: 'ID', render: (row) => <strong>{row.id}</strong> },
  { header: 'Evento', render: (row) => row.title },
  { header: 'Origen', render: (row) => row.source },
  { header: 'Score', render: (row) => row.score },
  {
    header: 'Nivel',
    render: (row) => (
      <StatusBadge tone={row.level === 'Alto' ? 'danger' : row.level === 'Medio' ? 'warning' : 'success'}>
        {row.level}
      </StatusBadge>
    ),
  },
]

const riskTone = (risk: ExecutiveRisk) =>
  risk.impact === 'Alto' ? 'danger' : risk.impact === 'Medio' ? 'warning' : 'success'

export function Anomalies() {
  return (
    <div className="page-grid">
      <section className="content-grid content-grid--wide-left">
        <div className="panel">
          <SectionHeader
            eyebrow="Centro de alertas"
            title="Anomalias detectadas"
            description="Eventos fuera de patron en precio, balance regional y confirmacion."
          />
          <DataTable
            columns={anomalyColumns}
            rows={anomalyEvents}
            getRowKey={(row) => row.id}
          />
        </div>

        <aside className="panel risk-panel">
          <SectionHeader
            eyebrow="Semaforo"
            title="Riesgo actual"
            description="Lectura rapida de criticidad operacional."
          />
          <div className="risk-meter">
            <span />
            <strong>Controlado con vigilancia</strong>
            <p>2 eventos requieren analisis antes del siguiente cierre.</p>
          </div>
        </aside>
      </section>

      <section className="content-grid">
        {anomalyEvents.map((event) => (
          <article className="panel anomaly-card" key={event.id}>
            <div className="row-between">
              <strong>{event.title}</strong>
              <StatusBadge tone={event.level === 'Alto' ? 'danger' : event.level === 'Medio' ? 'warning' : 'success'}>
                {event.level}
              </StatusBadge>
            </div>
            <p>{event.detail}</p>
            <small>{event.source} - confianza {event.score}</small>
          </article>
        ))}
      </section>

      <section className="panel">
        <SectionHeader
          eyebrow="Decisiones"
          title="Riesgos y acciones recomendadas"
          description="Priorizacion para operadores, tecnologia y gerencia."
        />
        <div className="risk-grid">
          {executiveRisks.map((risk) => (
            <article key={risk.risk}>
              <div className="row-between">
                <strong>{risk.risk}</strong>
                <StatusBadge tone={riskTone(risk)}>{risk.impact}</StatusBadge>
              </div>
              <p>{risk.action}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

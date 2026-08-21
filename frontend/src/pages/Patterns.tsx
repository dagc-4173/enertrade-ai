import { DataTable, type DataTableColumn } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { patronesIdentificados, recomendacionesAnaliticas, tarjetasPatrones } from '../data/mockData'
import type { AnalyticRecommendation, PatternResult } from '../types/domain'

const patternColumns: DataTableColumn<PatternResult>[] = [
  { header: 'ID', render: (row) => <strong>{row.id}</strong> },
  { header: 'Patron', render: (row) => row.pattern },
  { header: 'Origen', render: (row) => row.origin },
  { header: 'Variable', render: (row) => row.variable },
  { header: 'Confianza', render: (row) => row.confidence },
  {
    header: 'Relevancia',
    render: (row) => (
      <StatusBadge tone={row.relevance === 'Alta' ? 'success' : row.relevance === 'Media' ? 'info' : 'neutral'}>
        {row.relevance}
      </StatusBadge>
    ),
  },
]

const priorityTone = (recommendation: AnalyticRecommendation) =>
  recommendation.priority === 'Alta' ? 'success' : recommendation.priority === 'Media' ? 'info' : 'neutral'

export function Patterns() {
  return (
    <div className="page-grid">
      <section className="content-grid content-grid--wide-left">
        <div className="panel">
          <SectionHeader
            eyebrow="Analitica de mercado"
            title="Patrones identificados"
            description="Tendencias, recurrencias y relaciones relevantes en datos energeticos y transaccionales."
          />
          <DataTable
            columns={patternColumns}
            rows={patronesIdentificados}
            getRowKey={(row) => row.id}
          />
        </div>

        <aside className="panel analytics-panel">
          <SectionHeader
            eyebrow="Sintesis IA"
            title="Resumen analitico actual"
            description="Lectura general del comportamiento energetico y transaccional."
          />
          <div className="analytics-meter">
            <span />
            <strong>Nivel de actividad analitica: Alto</strong>
            <p>Patrones bajo seguimiento: 3 relaciones relevantes identificadas en el periodo analizado.</p>
          </div>
        </aside>
      </section>

      <section className="content-grid">
        {tarjetasPatrones.map((pattern) => (
          <article className="panel pattern-card" key={pattern.title}>
            <div className="row-between">
              <strong>{pattern.title}</strong>
              <StatusBadge tone={pattern.relevance === 'Alta' ? 'success' : 'info'}>
                {pattern.relevance}
              </StatusBadge>
            </div>
            <p>{pattern.description}</p>
            <small>Nivel de relevancia {pattern.relevance}</small>
          </article>
        ))}
      </section>

      <section className="panel">
        <SectionHeader
          eyebrow="Decisiones"
          title="Recomendaciones analiticas"
          description="Acciones sugeridas a partir de los patrones identificados."
        />
        <div className="analytics-grid">
          {recomendacionesAnaliticas.map((recommendation) => (
            <article key={recommendation.title}>
              <div className="row-between">
                <strong>{recommendation.title}</strong>
                <StatusBadge tone={priorityTone(recommendation)}>{recommendation.priority}</StatusBadge>
              </div>
              <p>{recommendation.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

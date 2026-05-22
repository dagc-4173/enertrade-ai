import { MetricCard } from '../components/cards/MetricCard'
import { ForecastChart } from '../components/charts/ForecastChart'
import { DataTable, type DataTableColumn } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  aiRecommendations,
  forecastPoints,
  marketMetrics,
  marketOffers,
  workflowSteps,
} from '../data/mockData'
import type { EnergyOffer } from '../types/domain'

const marketColumns: DataTableColumn<EnergyOffer>[] = [
  { header: 'ID', render: (row) => <strong>{row.id}</strong> },
  { header: 'Actor', render: (row) => row.actor },
  { header: 'Tipo', render: (row) => row.type },
  { header: 'Energia', render: (row) => row.energy },
  { header: 'Precio/kWh', render: (row) => row.price },
  { header: 'Estado', render: (row) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge> },
]

export function Dashboard() {
  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Dashboard principal</p>
          <h2>Vista general del mercado energetico</h2>
          <p>
            Plataforma centralizada para intercambio energetico con predicciones
            de generacion, consumo, precios dinamicos y deteccion de anomalias.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-button">
              Nueva oferta
            </button>
            <button type="button" className="secondary-button">
              Nueva demanda
            </button>
          </div>
        </div>
        <div className="ai-panel">
          <p>Motor IA transaccional</p>
          <strong>Recomendaciones y riesgo</strong>
          <div>
            {aiRecommendations.map((item) => (
              <article key={item.title}>
                <StatusBadge tone={item.tone}>{item.title}</StatusBadge>
                <span>{item.text}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="metric-grid">
        {marketMetrics.map((metric) => (
          <MetricCard key={metric.title} metric={metric} />
        ))}
      </section>

      <section className="content-grid content-grid--wide-left">
        <div className="panel">
          <SectionHeader
            eyebrow="Mercado en vivo"
            title="Ofertas y demandas activas"
            description="Lectura rapida de publicaciones relevantes para el dia."
          />
          <DataTable
            columns={marketColumns}
            rows={marketOffers.slice(0, 4)}
            getRowKey={(row) => row.id}
          />
        </div>

        <div className="panel">
          <SectionHeader
            eyebrow="Prediccion"
            title="Balance estimado"
            description="Comparacion horaria entre generacion, consumo y precio."
          />
          <ForecastChart points={forecastPoints} />
        </div>
      </section>

      <section className="panel">
        <SectionHeader
          eyebrow="Flujo principal"
          title="Recorrido del usuario"
          description="El sistema organiza el intercambio desde ingreso hasta cierre."
        />
        <div className="timeline">
          {workflowSteps.map((step, index) => (
            <article key={step.title}>
              <span>{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

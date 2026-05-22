import { MetricCard } from '../components/cards/MetricCard'
import { ForecastChart } from '../components/charts/ForecastChart'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  aiRecommendations,
  forecastPoints,
  techServices,
  techStats,
  techTrace,
} from '../data/mockData'

export function Predictions() {
  return (
    <div className="page-grid">
      <section className="metric-grid metric-grid--three">
        {techStats.map((metric) => (
          <MetricCard key={metric.title} metric={metric} />
        ))}
      </section>

      <section className="content-grid content-grid--wide-left">
        <div className="panel">
          <SectionHeader
            eyebrow="Modelos IA"
            title="Generacion, consumo y precios dinamicos"
            description="Pronostico operativo para anticipar desbalances y ajustar precios."
          />
          <ForecastChart points={forecastPoints} />
        </div>

        <aside className="panel">
          <SectionHeader
            eyebrow="Lectura IA"
            title="Recomendaciones"
            description="Acciones sugeridas por el motor transaccional."
          />
          <div className="stack-list">
            {aiRecommendations.map((item) => (
              <article key={item.title}>
                <StatusBadge tone={item.tone}>{item.title}</StatusBadge>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="content-grid">
        <div className="panel">
          <SectionHeader
            eyebrow="Servicios criticos"
            title="Estado de componentes"
            description="Salud operativa de APIs y modelos conectados."
          />
          <div className="stack-list">
            {techServices.map((service) => (
              <article key={service.name}>
                <div className="row-between">
                  <strong>{service.name}</strong>
                  <StatusBadge tone={service.tone}>{service.status}</StatusBadge>
                </div>
                <p>{service.note}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <SectionHeader
            eyebrow="Trazabilidad"
            title="Versiones y datos"
            description="Control del origen de predicciones y precios."
          />
          <div className="stack-list">
            {techTrace.map((trace) => (
              <article key={trace.item}>
                <div className="row-between">
                  <strong>{trace.item}</strong>
                  <StatusBadge>{trace.status}</StatusBadge>
                </div>
                <p>{trace.value}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

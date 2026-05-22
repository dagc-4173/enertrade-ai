import { MetricCard } from '../components/cards/MetricCard'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  executiveDecisions,
  executiveHighlights,
  executiveStats,
  techTrace,
  userEnergyCards,
} from '../data/mockData'

export function Profile() {
  return (
    <div className="page-grid">
      <section className="profile-hero panel">
        <div>
          <p className="eyebrow">Perfil institucional</p>
          <h2>Usuario demo EnerTrade AI</h2>
          <p>
            Vista consolidada para consultar permisos, indicadores personales,
            trazabilidad tecnica y lectura ejecutiva del mercado.
          </p>
        </div>
        <div className="profile-card">
          <strong>Gerente general</strong>
          <span>Acceso ejecutivo, mercado, riesgos y decisiones</span>
          <StatusBadge tone="success">Sesion activa</StatusBadge>
        </div>
      </section>

      <section className="metric-grid metric-grid--three">
        {userEnergyCards.map((metric) => (
          <MetricCard key={metric.title} metric={metric} />
        ))}
      </section>

      <section className="content-grid">
        <div className="panel">
          <SectionHeader
            eyebrow="Resumen ejecutivo"
            title="Indicadores de negocio"
            description="Lectura sintetica para la direccion."
          />
          <div className="metric-grid metric-grid--compact">
            {executiveStats.map((metric) => (
              <MetricCard key={metric.title} metric={metric} />
            ))}
          </div>
        </div>

        <aside className="panel">
          <SectionHeader
            eyebrow="Trazabilidad"
            title="Versiones activas"
            description="Control de modelos y datos usados en la plataforma."
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
        </aside>
      </section>

      <section className="content-grid">
        <div className="panel">
          <SectionHeader
            eyebrow="Mercado"
            title="Lectura financiera"
          />
          <div className="match-grid">
            {executiveHighlights.map((item) => (
              <MetricCard key={item.title} metric={item} />
            ))}
          </div>
        </div>

        <div className="panel">
          <SectionHeader
            eyebrow="Decisiones"
            title="Acciones estrategicas"
          />
          <div className="stack-list">
            {executiveDecisions.map((decision) => (
              <article key={decision}>
                <p>{decision}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

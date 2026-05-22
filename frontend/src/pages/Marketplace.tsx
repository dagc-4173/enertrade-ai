import { MetricCard } from '../components/cards/MetricCard'
import { DataTable, type DataTableColumn } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  marketOffers,
  smartMatches,
  userEnergyCards,
} from '../data/mockData'
import type { EnergyOffer } from '../types/domain'

const columns: DataTableColumn<EnergyOffer>[] = [
  { header: 'Operacion', render: (row) => row.id },
  { header: 'Actor', render: (row) => row.actor },
  { header: 'Tipo', render: (row) => row.type },
  { header: 'Energia', render: (row) => row.energy },
  { header: 'Precio', render: (row) => `${row.price} COP` },
  { header: 'Zona', render: (row) => row.zone },
  { header: 'Estado', render: (row) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge> },
]

export function Marketplace() {
  return (
    <div className="page-grid">
      <section className="metric-grid metric-grid--three">
        {userEnergyCards.map((metric) => (
          <MetricCard key={metric.title} metric={metric} />
        ))}
      </section>

      <section className="content-grid content-grid--wide-left">
        <div className="panel">
          <SectionHeader
            eyebrow="Mercado P2P"
            title="Ofertas y demandas"
            description="Publicaciones disponibles para compra, venta y validacion."
          >
            <div className="filter-row">
              <button type="button">Todas</button>
              <button type="button">Ventas</button>
              <button type="button">Compras</button>
            </div>
          </SectionHeader>
          <DataTable columns={columns} rows={marketOffers} getRowKey={(row) => row.id} />
        </div>

        <aside className="panel form-panel">
          <SectionHeader
            eyebrow="Publicar"
            title="Nueva oferta o demanda"
            description="Captura operativa para simular una publicacion energetica."
          />
          <form>
            <label>
              Tipo de operacion
              <select defaultValue="Venta">
                <option>Venta</option>
                <option>Compra</option>
              </select>
            </label>
            <label>
              Cantidad kWh
              <input defaultValue="86" inputMode="decimal" />
            </label>
            <label>
              Precio COP/kWh
              <input defaultValue="412" inputMode="decimal" />
            </label>
            <label>
              Franja horaria
              <input defaultValue="14:00 - 18:00" />
            </label>
            <button type="button" className="primary-button">
              Simular publicacion
            </button>
          </form>
        </aside>
      </section>

      <section className="panel">
        <SectionHeader
          eyebrow="Emparejamiento inteligente"
          title="Coincidencias sugeridas"
          description="Ranking por afinidad entre energia disponible, precio, zona y riesgo."
        />
        <div className="match-grid">
          {smartMatches.map((match) => (
            <article key={match.buyer} className="match-card">
              <div>
                <strong>{match.buyer}</strong>
                <StatusBadge tone={match.tone}>{match.state}</StatusBadge>
              </div>
              <p>{match.price} COP/kWh</p>
              <span>Afinidad {match.fit}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

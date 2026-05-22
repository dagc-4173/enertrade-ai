import { MetricCard } from '../components/cards/MetricCard'
import { DataTable, type DataTableColumn } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  operatorStats,
  recentTransactions,
  validationQueue,
} from '../data/mockData'
import type { Transaction, ValidationCase } from '../types/domain'

const transactionColumns: DataTableColumn<Transaction>[] = [
  { header: 'ID', render: (row) => <strong>{row.id}</strong> },
  { header: 'Tipo', render: (row) => row.type },
  { header: 'Energia', render: (row) => row.amount },
  { header: 'Total', render: (row) => row.total },
  { header: 'Estado', render: (row) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge> },
  { header: 'Nota', render: (row) => row.note },
]

const validationColumns: DataTableColumn<ValidationCase>[] = [
  { header: 'Caso', render: (row) => row.id },
  { header: 'Actor', render: (row) => row.actor },
  { header: 'Tipo', render: (row) => row.type },
  {
    header: 'Riesgo',
    render: (row) => (
      <StatusBadge tone={row.risk === 'Alto' ? 'danger' : row.risk === 'Medio' ? 'warning' : 'success'}>
        {row.risk}
      </StatusBadge>
    ),
  },
  { header: 'Accion', render: (row) => row.action },
]

export function Transactions() {
  return (
    <div className="page-grid">
      <section className="metric-grid metric-grid--three">
        {operatorStats.map((metric) => (
          <MetricCard key={metric.title} metric={metric} />
        ))}
      </section>

      <section className="panel">
        <SectionHeader
          eyebrow="Operaciones"
          title="Transacciones recientes"
          description="Seguimiento de compras, ventas y cierres automaticos."
        />
        <DataTable
          columns={transactionColumns}
          rows={recentTransactions}
          getRowKey={(row) => row.id}
        />
      </section>

      <section className="content-grid">
        <div className="panel">
          <SectionHeader
            eyebrow="Validaciones"
            title="Cola operativa"
            description="Casos que requieren aprobacion, revision o escalamiento."
          />
          <DataTable
            columns={validationColumns}
            rows={validationQueue}
            getRowKey={(row) => row.id}
          />
        </div>

        <aside className="panel action-panel">
          <SectionHeader
            eyebrow="Decision operativa"
            title="Acciones sugeridas"
          />
          <div className="stack-list">
            <article>
              <StatusBadge tone="danger">Bloqueo temporal</StatusBadge>
              <p>Detener publicaciones con desviacion extrema de precio.</p>
            </article>
            <article>
              <StatusBadge tone="success">Aprobacion automatica</StatusBadge>
              <p>Aprobar ofertas con riesgo bajo y documentos completos.</p>
            </article>
            <article>
              <StatusBadge tone="warning">Escalamiento</StatusBadge>
              <p>Enviar incidencias repetitivas al equipo tecnico e IA.</p>
            </article>
          </div>
        </aside>
      </section>
    </div>
  )
}

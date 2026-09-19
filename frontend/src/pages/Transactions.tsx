import { SectionHeader } from '../components/ui/SectionHeader'

export function Transactions() {
  return (
    <div className="page-grid">
      <section className="panel">
        <SectionHeader
          eyebrow="Transacciones"
          title="No disponible en el prototipo actual"
          description="El sistema no implementa cierres ni transacciones. Las ofertas y demandas propias se gestionan en Mercado."
        />
      </section>
    </div>
  )
}

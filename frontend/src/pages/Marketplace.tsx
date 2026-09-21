import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../services/apiClient'
import { createDemand, createOffer, getMyDemands, getMyOffers } from '../services/marketplaceService'
import { suggestMatches } from '../services/matchingService'
import type { EnergyDemandDto, EnergyOfferDto } from '../types/marketplace'
import type { MatchingResult } from '../types/matching'
import { formatCopPerKwh, formatDeliveryDate, formatEnergy, formatEnergyKWh } from '../utils/numberFormat'
import { DataTable } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import './Marketplace.css'

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'La sesión es requerida o expiró. Inicia sesión nuevamente.'
    return error.serverMessage ?? 'No fue posible completar la solicitud.'
  }
  return 'No fue posible completar la solicitud. Intenta nuevamente.'
}

function parsePositiveValue(value: FormDataEntryValue | null) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function OfferForm({ onCreated }: { onCreated: (offer: EnergyOfferDto) => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const form = event.currentTarget
    const data = new FormData(form)
    const quantityKwh = parsePositiveValue(data.get('quantityKwh'))
    const pricePerKwh = parsePositiveValue(data.get('pricePerKwh'))
    const deliveryDate = String(data.get('deliveryDate') ?? '')
    if (quantityKwh === null || pricePerKwh === null || !deliveryDate) {
      setError('Ingresa una cantidad, un precio y una fecha de entrega válidos.')
      setConfirmation('')
      return
    }
    setSubmitting(true)
    setError('')
    setConfirmation('')
    try {
      const offer = await createOffer({ quantityKwh, pricePerKwh, deliveryDate })
      onCreated(offer)
      form.reset()
      setConfirmation('Oferta publicada correctamente.')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return <form className="marketplace-form" onSubmit={submit} aria-busy={submitting}>
    <label>
      Cantidad de energía (kWh)
      <input name="quantityKwh" type="number" min="0.01" step="0.01" required disabled={submitting} />
    </label>
    <label>
      Precio (COP/kWh)
      <input name="pricePerKwh" type="number" min="0.00001" step="0.00001" required disabled={submitting} />
    </label>
    <label>
      Fecha de entrega
      <input name="deliveryDate" type="date" required disabled={submitting} />
    </label>
    {error && <p className="marketplace-error" role="alert">{error}</p>}
    {confirmation && <p className="marketplace-status" role="status">{confirmation}</p>}
    <button type="submit" className="primary-button" disabled={submitting}>
      {submitting ? 'Publicando…' : 'Publicar oferta'}
    </button>
  </form>
}

function DemandForm({ onCreated }: { onCreated: (demand: EnergyDemandDto) => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const form = event.currentTarget
    const data = new FormData(form)
    const quantityKwh = parsePositiveValue(data.get('quantityKwh'))
    const maxPricePerKwh = parsePositiveValue(data.get('maxPricePerKwh'))
    const deliveryDate = String(data.get('deliveryDate') ?? '')
    if (quantityKwh === null || maxPricePerKwh === null || !deliveryDate) {
      setError('Ingresa una cantidad, un precio máximo y una fecha de entrega válidos.')
      setConfirmation('')
      return
    }
    setSubmitting(true)
    setError('')
    setConfirmation('')
    try {
      const demand = await createDemand({ quantityKwh, maxPricePerKwh, deliveryDate })
      onCreated(demand)
      form.reset()
      setConfirmation('Demanda publicada correctamente.')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return <form className="marketplace-form" onSubmit={submit} aria-busy={submitting}>
    <label>
      Cantidad de energía (kWh)
      <input name="quantityKwh" type="number" min="0.01" step="0.01" required disabled={submitting} />
    </label>
    <label>
      Precio máximo (COP/kWh)
      <input name="maxPricePerKwh" type="number" min="0.00001" step="0.00001" required disabled={submitting} />
    </label>
    <label>
      Fecha de entrega
      <input name="deliveryDate" type="date" required disabled={submitting} />
    </label>
    {error && <p className="marketplace-error" role="alert">{error}</p>}
    {confirmation && <p className="marketplace-status" role="status">{confirmation}</p>}
    <button type="submit" className="primary-button" disabled={submitting}>
      {submitting ? 'Publicando…' : 'Publicar demanda'}
    </button>
  </form>
}

const offerColumns = [
  { header: 'Cantidad', render: (row: EnergyOfferDto) => formatEnergy(row.quantityKwh) },
  { header: 'Precio', render: (row: EnergyOfferDto) => formatCopPerKwh(row.pricePerKwh) },
  { header: 'Fecha de entrega', render: (row: EnergyOfferDto) => formatDeliveryDate(row.deliveryDate) },
  { header: 'Estado', render: () => <StatusBadge tone="success">Activa</StatusBadge> },
]

const demandColumns = [
  { header: 'Cantidad', render: (row: EnergyDemandDto) => formatEnergy(row.quantityKwh) },
  { header: 'Precio máximo', render: (row: EnergyDemandDto) => formatCopPerKwh(row.maxPricePerKwh) },
  { header: 'Fecha de entrega', render: (row: EnergyDemandDto) => formatDeliveryDate(row.deliveryDate) },
  { header: 'Estado', render: () => <StatusBadge tone="success">Activa</StatusBadge> },
]

const compatibilityTone = (value: string) => value === 'FULL' ? 'success' : value === 'PARTIAL' ? 'warning' : 'neutral'

export function MatchingContent({ state, onSuggest }: { state: { kind: 'idle' | 'loading' } | { kind: 'error'; message: string } | { kind: 'success'; result: MatchingResult }; onSuggest: () => void }) {
  return <section className="panel marketplace-section" aria-label="Emparejamientos sugeridos">
    <SectionHeader eyebrow="Emparejamiento" title="Emparejamientos sugeridos" description="Los emparejamientos se generan sobre las publicaciones activas disponibles." />
    <button type="button" className="secondary-button" onClick={onSuggest} disabled={state.kind === 'loading'}>{state.kind === 'loading' ? 'Generando sugerencias…' : 'Sugerir emparejamientos'}</button>
    {state.kind === 'idle' && <p className="marketplace-empty">Solicita sugerencias para consultar las publicaciones activas disponibles.</p>}
    {state.kind === 'error' && <p className="marketplace-error" role="alert">{state.message}</p>}
    {state.kind === 'success' && <div className="stack-list">
      <p className="marketplace-status">Estado: {state.result.status}. Coincidencias sugeridas: {state.result.summary.suggestedMatches}.</p>
      {state.result.status === 'no_matches' && <p className="marketplace-empty">No se encontraron emparejamientos compatibles.</p>}
      {state.result.demands.map(demand => <article key={demand.demandId}><div className="row-between"><strong>Demanda {demand.demandId}</strong><StatusBadge tone={compatibilityTone(demand.compatibility)}>{demand.compatibility}</StatusBadge></div><p>Cantidad sugerida: {formatEnergyKWh(Number(demand.suggestedQuantityKwh))}. Pendiente: {formatEnergyKWh(Number(demand.unmatchedQuantityKwh))}.</p></article>)}
      {state.result.trace.persistence === 'failed' && <p className="marketplace-error" role="alert">Las sugerencias se generaron, pero no fue posible conservar su trazabilidad.</p>}
    </div>}
  </section>
}

export function Marketplace() {
  const [offers, setOffers] = useState<EnergyOfferDto[]>([])
  const [demands, setDemands] = useState<EnergyDemandDto[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [matching, setMatching] = useState<{ kind: 'idle' | 'loading' } | { kind: 'error'; message: string } | { kind: 'success'; result: MatchingResult }>({ kind: 'idle' })

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getMyOffers(controller.signal), getMyDemands(controller.signal)])
      .then(([loadedOffers, loadedDemands]) => {
        if (controller.signal.aborted) return
        setOffers(loadedOffers)
        setDemands(loadedDemands)
      })
      .catch(reason => {
        if (!controller.signal.aborted) setLoadError(errorMessage(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  async function suggest() {
    if (matching.kind === 'loading') return
    setMatching({ kind: 'loading' })
    try { setMatching({ kind: 'success', result: await suggestMatches() }) }
    catch (reason) { setMatching({ kind: 'error', message: errorMessage(reason) }) }
  }

  return <div className="page-grid marketplace-page">
    <section className="panel marketplace-intro">
      <SectionHeader
        eyebrow="Mercado energético"
        title="Mercado energético simulado"
        description="Registro y consulta de ofertas y demandas asociadas al usuario autenticado."
      />
    </section>

    <MatchingContent state={matching} onSuggest={() => { void suggest() }} />

    {loading && <p role="status">Cargando tus publicaciones…</p>}
    {loadError && <div className="panel" role="alert">
      <p className="marketplace-error">{loadError}</p>
      <button type="button" className="secondary-button" onClick={() => { setLoading(true); setLoadError(''); setReload(value => value + 1) }}>Reintentar carga</button>
    </div>}

    {!loading && !loadError && <div className="marketplace-columns">
      <section className="panel marketplace-section" aria-label="Ofertas">
        <SectionHeader eyebrow="Publicación" title="Ofertas" description="Energía que deseas poner a disposición." />
        <OfferForm onCreated={offer => setOffers(current => [offer, ...current])} />
        {offers.length === 0
          ? <p className="marketplace-empty">No tienes ofertas registradas.</p>
          : <DataTable columns={offerColumns} rows={offers} getRowKey={row => row.id} />}
      </section>

      <section className="panel marketplace-section" aria-label="Demandas">
        <SectionHeader eyebrow="Publicación" title="Demandas" description="Energía que deseas adquirir." />
        <DemandForm onCreated={demand => setDemands(current => [demand, ...current])} />
        {demands.length === 0
          ? <p className="marketplace-empty">No tienes demandas registradas.</p>
          : <DataTable columns={demandColumns} rows={demands} getRowKey={row => row.id} />}
      </section>
    </div>}
  </div>
}

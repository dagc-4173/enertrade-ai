import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../services/apiClient'
import { cancelDemand, cancelOffer, createDemand, createOffer, getMyDemands, getMyOffers, listMarketDemands, listMarketOffers, updateDemand, updateOffer } from '../services/marketplaceService'
import { suggestMatches } from '../services/matchingService'
import { createTransaction } from '../services/transactionService'
import type { EnergyDemandDto, EnergyOfferDto, MarketDemand, MarketOffer } from '../types/marketplace'
import type { MatchingResult } from '../types/matching'
import { formatCopPerKwh, formatDeliveryDate, formatEnergy, formatEnergyKWh } from '../utils/numberFormat'
import { DataTable } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import './Marketplace.css'

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'La sesión es requerida o expiró. Inicia sesión nuevamente.'
    if (error.serverMessage) return error.serverMessage
    if (error.status !== null) return error.code ? `La API rechazó la solicitud (${error.code}, HTTP ${error.status}).` : `La API rechazó la solicitud (HTTP ${error.status}).`
    if (error.kind === 'network') return 'No fue posible comunicarse con la API. Verifica que el backend esté disponible.'
    return 'La API devolvió una respuesta que no pudo procesarse.'
  }
  return 'No fue posible completar la solicitud. Intenta nuevamente.'
}

function parsePositiveValue(value: FormDataEntryValue | null) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function CompatibilityAction({ ownOffer, ownDemand, externalOffer, externalDemand, onSelect }: { ownOffer?: EnergyOfferDto; ownDemand?: EnergyDemandDto; externalOffer?: MarketOffer; externalDemand?: MarketDemand; onSelect: () => void }) {
  const own = ownOffer ?? ownDemand!
  const external = externalOffer ?? externalDemand!
  const quantityCompatible = own.quantityKwh >= Number(external.availableQuantityKwh)
  const dateCompatible = own.deliveryDate === external.deliveryDate
  const priceCompatible = ownOffer
    ? ownOffer.pricePerKwh <= Number(externalDemand!.maxPricePerKwh)
    : ownDemand!.maxPricePerKwh >= Number(externalOffer!.pricePerKwh)
  const compatible = quantityCompatible && dateCompatible && priceCompatible
  const priceMessage = ownOffer
    ? `Tu oferta es de ${formatCopPerKwh(ownOffer.pricePerKwh)} y la demanda acepta máximo ${formatCopPerKwh(Number(externalDemand!.maxPricePerKwh))}.`
    : `Tu demanda acepta máximo ${formatCopPerKwh(ownDemand!.maxPricePerKwh)} y la oferta cuesta ${formatCopPerKwh(Number(externalOffer!.pricePerKwh))}.`
  const incompatibilityMessage = !compatible
    ? !priceCompatible ? `Esta combinación no puede proponerse porque ${ownOffer ? 'el precio de tu oferta supera el máximo de la demanda.' : 'el precio de la oferta supera el máximo de tu demanda.'}`
      : !dateCompatible ? 'Esta combinación no puede proponerse porque las fechas de entrega no coinciden.'
        : 'Esta combinación no puede proponerse porque la cantidad disponible no cubre la publicación propia.'
    : null
  return <div className="marketplace-compatibility"><strong>{ownOffer ? 'Tu oferta' : 'Tu demanda'}: {quantityCompatible ? 'cantidad compatible' : 'cantidad no compatible'}, {dateCompatible ? 'fecha compatible' : 'fecha no compatible'}, {priceCompatible ? 'precio compatible' : 'precio no compatible'}.</strong>{!priceCompatible && <span>{priceMessage}</span>}{incompatibilityMessage && <span className="marketplace-incompatibility">{incompatibilityMessage}</span>}<button className={`secondary-button${compatible ? '' : ' marketplace-disabled-action'}`} type="button" disabled={!compatible} aria-disabled={!compatible} title={compatible ? undefined : incompatibilityMessage ?? undefined} onClick={onSelect}>{ownOffer ? 'Proponer con mi oferta' : 'Proponer con mi demanda'}</button></div>
}

function ActiveMarket({ offers, demands, ownOffers, ownDemands, onRefresh }: { offers: MarketOffer[]; demands: MarketDemand[]; ownOffers: EnergyOfferDto[]; ownDemands: EnergyDemandDto[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<{ offerId: string; demandId: string; max: number } | null>(null)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const select = (offer: { id: string; availableQuantityKwh: string }, demand: { id: string; availableQuantityKwh: string }) => { const max = Math.min(Number(offer.availableQuantityKwh), Number(demand.availableQuantityKwh)); setSelected({ offerId: offer.id, demandId: demand.id, max }); setQuantity(String(max)); setError(''); setStatus('') }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const amount = Number(quantity); if (!selected || !Number.isFinite(amount) || amount <= 0 || amount > selected.max) { setError('La cantidad debe ser positiva y no superar el saldo compatible.'); return } setSubmitting(true); setError(''); try { await createTransaction({ offerId: selected.offerId, demandId: selected.demandId, quantityKwh: amount }); setStatus('Propuesta de transacción energética simulada creada.'); setSelected(null); onRefresh() } catch (reason) { setError(errorMessage(reason)) } finally { setSubmitting(false) } }
  return <section className="panel marketplace-section" aria-label="Mercado activo"><SectionHeader eyebrow="Mercado activo" title="Publicaciones disponibles" description="Saldos de publicaciones activas de otros usuarios. Las sugerencias de matching siguen siendo informativas." />
    {status && <p className="marketplace-status" role="status">{status}</p>}{error && <p className="marketplace-error" role="alert">{error}</p>}
    {selected && <form className="marketplace-form" onSubmit={submit}><label>Cantidad a transaccionar (kWh)<input type="number" min="0.01" step="0.01" value={quantity} onChange={event => setQuantity(event.target.value)} disabled={submitting} required /></label><div className="marketplace-actions"><button className="primary-button" disabled={submitting}>{submitting ? 'Creando…' : 'Crear propuesta'}</button><button type="button" className="secondary-button" onClick={() => setSelected(null)} disabled={submitting}>Cancelar</button></div></form>}
    <div className="marketplace-columns"><div><h3>Ofertas activas</h3>{offers.length === 0 ? <p className="marketplace-empty">No hay ofertas externas disponibles.</p> : <div className="marketplace-list">{offers.map(offer => <article className="marketplace-item" key={offer.id}><strong>{formatEnergyKWh(Number(offer.availableQuantityKwh))} disponibles</strong><span>{formatCopPerKwh(Number(offer.pricePerKwh))}</span><span>Entrega: {formatDeliveryDate(offer.deliveryDate)}</span>{ownDemands.filter(demand => demand.status === 'ACTIVE').map(demand => <CompatibilityAction key={demand.id} ownDemand={demand} externalOffer={offer} onSelect={() => select(offer, { id: demand.id, availableQuantityKwh: String(demand.quantityKwh) })} />)}</article>)}</div>}</div><div><h3>Demandas activas</h3>{demands.length === 0 ? <p className="marketplace-empty">No hay demandas externas disponibles.</p> : <div className="marketplace-list">{demands.map(demand => <article className="marketplace-item" key={demand.id}><strong>{formatEnergyKWh(Number(demand.availableQuantityKwh))} pendientes</strong><span>Máximo: {formatCopPerKwh(Number(demand.maxPricePerKwh))}</span><span>Entrega: {formatDeliveryDate(demand.deliveryDate)}</span>{ownOffers.filter(offer => offer.status === 'ACTIVE').map(offer => <CompatibilityAction key={offer.id} ownOffer={offer} externalDemand={demand} onSelect={() => select({ id: offer.id, availableQuantityKwh: String(offer.quantityKwh) }, demand)} />)}</article>)}</div>}</div></div>
  </section>
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

function PublicationActions({ type, publication, onChanged }: { type: 'offer' | 'demand'; publication: EnergyOfferDto | EnergyDemandDto; onChanged: (value: EnergyOfferDto | EnergyDemandDto) => void }) {
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  if (publication.status !== 'ACTIVE') return null
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const quantityKwh = parsePositiveValue(data.get('quantityKwh'))
    const price = parsePositiveValue(data.get('pricePerKwh'))
    const deliveryDate = String(data.get('deliveryDate') ?? '')
    if (quantityKwh === null || price === null || !deliveryDate) { setError('Completa valores positivos y una fecha válida.'); return }
    setSubmitting(true); setError('')
    try {
      const updated = type === 'offer'
        ? await updateOffer(publication.id, { quantityKwh, pricePerKwh: price, deliveryDate })
        : await updateDemand(publication.id, { quantityKwh, maxPricePerKwh: price, deliveryDate })
      onChanged(updated); setEditing(false)
    } catch (reason) { setError(errorMessage(reason)) } finally { setSubmitting(false) }
  }
  async function cancel() {
    if (!window.confirm('Esta publicación dejará de estar disponible en el mercado.')) return
    setSubmitting(true); setError('')
    try { onChanged(type === 'offer' ? await cancelOffer(publication.id) : await cancelDemand(publication.id)) }
    catch (reason) { setError(errorMessage(reason)) } finally { setSubmitting(false) }
  }
  if (!editing) return <div className="marketplace-actions"><button className="secondary-button" type="button" onClick={() => setEditing(true)} disabled={submitting}>Editar</button><button className="secondary-button" type="button" onClick={() => { void cancel() }} disabled={submitting}>Cancelar publicación</button>{error && <p className="marketplace-error" role="alert">{error}</p>}</div>
  const price = type === 'offer' ? (publication as EnergyOfferDto).pricePerKwh : (publication as EnergyDemandDto).maxPricePerKwh
  return <form className="marketplace-form" onSubmit={save}><label>Cantidad<input name="quantityKwh" type="number" min="0.01" step="0.01" defaultValue={publication.quantityKwh} required disabled={submitting} /></label><label>{type === 'offer' ? 'Precio (COP/kWh)' : 'Precio máximo (COP/kWh)'}<input name="pricePerKwh" type="number" min="0.00001" step="0.00001" defaultValue={price} required disabled={submitting} /></label><label>Entrega<input name="deliveryDate" type="date" defaultValue={publication.deliveryDate} required disabled={submitting} /></label>{error && <p className="marketplace-error" role="alert">{error}</p>}<div className="marketplace-actions"><button className="primary-button" disabled={submitting}>{submitting ? 'Guardando…' : 'Guardar cambios'}</button><button className="secondary-button" type="button" onClick={() => setEditing(false)} disabled={submitting}>Cancelar edición</button></div></form>
}

function publicationStatus(status: EnergyOfferDto['status']) {
  if (status === 'FULFILLED') return <StatusBadge tone="success">Completada</StatusBadge>
  if (status === 'CANCELLED') return <StatusBadge tone="neutral">Cancelada</StatusBadge>
  return <StatusBadge tone="success">Activa</StatusBadge>
}

function offerColumns(onChanged: (value: EnergyOfferDto) => void) {
  return [
  { header: 'Cantidad', render: (row: EnergyOfferDto) => formatEnergy(row.quantityKwh) },
  { header: 'Precio', render: (row: EnergyOfferDto) => formatCopPerKwh(row.pricePerKwh) },
  { header: 'Fecha de entrega', render: (row: EnergyOfferDto) => formatDeliveryDate(row.deliveryDate) },
  { header: 'Estado', render: (row: EnergyOfferDto) => publicationStatus(row.status) },
  { header: 'Acciones', render: (row: EnergyOfferDto) => <PublicationActions type="offer" publication={row} onChanged={value => onChanged(value as EnergyOfferDto)} /> },
]}

function demandColumns(onChanged: (value: EnergyDemandDto) => void) {
  return [
  { header: 'Cantidad', render: (row: EnergyDemandDto) => formatEnergy(row.quantityKwh) },
  { header: 'Precio máximo', render: (row: EnergyDemandDto) => formatCopPerKwh(row.maxPricePerKwh) },
  { header: 'Fecha de entrega', render: (row: EnergyDemandDto) => formatDeliveryDate(row.deliveryDate) },
  { header: 'Estado', render: (row: EnergyDemandDto) => publicationStatus(row.status) },
  { header: 'Acciones', render: (row: EnergyDemandDto) => <PublicationActions type="demand" publication={row} onChanged={value => onChanged(value as EnergyDemandDto)} /> },
]}

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
  const [marketOffers, setMarketOffers] = useState<MarketOffer[]>([])
  const [marketDemands, setMarketDemands] = useState<MarketDemand[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [matching, setMatching] = useState<{ kind: 'idle' | 'loading' } | { kind: 'error'; message: string } | { kind: 'success'; result: MatchingResult }>({ kind: 'idle' })

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getMyOffers(controller.signal), getMyDemands(controller.signal), listMarketOffers(controller.signal), listMarketDemands(controller.signal)])
      .then(([loadedOffers, loadedDemands, loadedMarketOffers, loadedMarketDemands]) => {
        if (controller.signal.aborted) return
        setOffers(loadedOffers)
        setDemands(loadedDemands)
        setMarketOffers(loadedMarketOffers)
        setMarketDemands(loadedMarketDemands)
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

  function replaceOffer(offer: EnergyOfferDto) { setOffers(current => current.map(value => value.id === offer.id ? offer : value)); setMatching({ kind: 'idle' }); setReload(value => value + 1) }
  function replaceDemand(demand: EnergyDemandDto) { setDemands(current => current.map(value => value.id === demand.id ? demand : value)); setMatching({ kind: 'idle' }); setReload(value => value + 1) }

  return <div className="page-grid marketplace-page">
    <section className="panel marketplace-intro">
      <SectionHeader
        eyebrow="Mercado energético"
        title="Mercado energético simulado"
        description="Publica energía propia, consulta saldos externos y crea propuestas de intercambio simulado."
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
          : <DataTable columns={offerColumns(replaceOffer)} rows={offers} getRowKey={row => row.id} />}
      </section>

      <section className="panel marketplace-section" aria-label="Demandas">
        <SectionHeader eyebrow="Publicación" title="Demandas" description="Energía que deseas adquirir." />
        <DemandForm onCreated={demand => setDemands(current => [demand, ...current])} />
        {demands.length === 0
          ? <p className="marketplace-empty">No tienes demandas registradas.</p>
          : <DataTable columns={demandColumns(replaceDemand)} rows={demands} getRowKey={row => row.id} />}
      </section>
    </div>}
    {!loading && !loadError && <ActiveMarket offers={marketOffers} demands={marketDemands} ownOffers={offers} ownDemands={demands} onRefresh={() => setReload(value => value + 1)} />}
  </div>
}

import { useState, useEffect, useRef } from 'react'
import type { EnergyOfferDto, EnergyDemandDto, MarketOffer, MarketDemand } from '../types/marketplace'
import { createTransactionBatch } from '../services/transactionService'
import { errorMessage } from '../utils/marketplaceActions'
import { formatDeliveryDate, formatEnergyKWh, formatCopPerKwh } from '../utils/numberFormat'
import { LocalizedDecimalInput } from './forms/LocalizedDecimalInput'
import { hourLabel } from '../utils/hourlyMarket'
import { parseLocalizedDecimal, formatLocalizedDecimal } from '../utils/localizedDecimal'

import type { MatchingNegotiationSelection, NegotiationTerm as Term } from '../utils/matchingNegotiation'
export function HourlyMarket({ offers, demands, ownOffers, ownDemands, onRefresh, onNavigate, initialSelection }: { offers: MarketOffer[]; demands: MarketDemand[]; ownOffers: EnergyOfferDto[]; ownDemands: EnergyDemandDto[]; onRefresh: () => void; onNavigate?: () => void; initialSelection?: MatchingNegotiationSelection }) {
  const [kind, setKind] = useState<'offer' | 'demand'>(initialSelection?.kind ?? 'offer')
  const [publicationId, setPublicationId] = useState(initialSelection?.publicationId ?? '')
  const [ownPublicationId, setOwnPublicationId] = useState(initialSelection?.ownPublicationId ?? '')
  const [terms, setTerms] = useState<Term[]>(initialSelection ? [initialSelection.term] : [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (initialSelection) { heading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); heading.current?.focus({ preventScroll: true }) } }, [initialSelection])
  const external = (kind === 'offer' ? offers : demands).filter(row => row.hour != null && row.publicationId)
  const groups = [...new Map(external.map(row => [row.publicationId!, row])).values()]
  const rows = external.filter(row => row.publicationId === publicationId).sort((a, b) => a.hour! - b.hour!)
  const own = (kind === 'offer' ? ownDemands : ownOffers).filter(row => row.hour != null && row.status === 'ACTIVE' && row.availableQuantityKwh > 0 && row.deliveryDate === rows[0]?.deliveryDate)
  const ownGroups = [...new Map(own.map(row => [row.publicationId!, row])).values()]
  const selectionEligible = terms.every(term => rows.some(row => row.id === term.externalId) && own.some(row => row.id === term.ownId && row.publicationId === ownPublicationId))
  function reset() { setTerms([]); setError(''); setNotice('') }
  async function submit() {
    if (!selectionEligible) { setError('Las publicaciones seleccionadas deben estar verificadas y activas. Actualiza la selección.'); return }
    const proposals = terms.map(term => ({ offerId: kind === 'offer' ? term.externalId : term.ownId, demandId: kind === 'offer' ? term.ownId : term.externalId, quantityKwh: parseLocalizedDecimal(term.quantity, 'quantity').numberValue ?? 0, pricePerKwh: parseLocalizedDecimal(term.price, 'price').numberValue ?? 0 }))
    if (!proposals.length || proposals.some(row => row.quantityKwh <= 0 || row.pricePerKwh <= 0)) { setError('Completa cantidad y precio de cada hora seleccionada.'); return }
    setBusy(true); setError(''); setNotice('')
    try { const created = await createTransactionBatch(proposals); setTerms([]); setNotice(`${created.length} negociaciones horarias registradas.`); onRefresh() } catch (reason) { setError(errorMessage(reason)); onRefresh() } finally { setBusy(false) }
  }
  return <section className="panel marketplace-section" aria-label="Mercado horario"><h2 ref={heading} tabIndex={-1}>Mercado por hora</h2>{initialSelection && <p role="status">Coincidencia preparada. Revisa cantidad y precio antes de enviar la propuesta.</p>}
    <label>Consultar<select value={kind} disabled={busy} onChange={event => { setKind(event.target.value as 'offer' | 'demand'); setPublicationId(''); setOwnPublicationId(''); reset() }}><option value="offer">Ofertas externas</option><option value="demand">Demandas externas</option></select></label>
    <label>Publicación diaria<select value={publicationId} disabled={busy} onChange={event => { setPublicationId(event.target.value); setOwnPublicationId(''); reset() }}><option value="">Selecciona una publicación</option>{groups.map(row => <option key={row.publicationId} value={row.publicationId!}>{formatDeliveryDate(row.deliveryDate)} · Ref. {row.publicationId!.slice(0, 8)}</option>)}</select></label>
    <label>{kind === 'offer' ? 'Mi demanda' : 'Mi oferta'}<select value={ownPublicationId} disabled={busy} onChange={event => { setOwnPublicationId(event.target.value); reset() }}><option value="">Selecciona tu publicación del mismo día</option>{ownGroups.map(row => <option key={row.publicationId} value={row.publicationId!}>Ref. {row.publicationId!.slice(0, 8)}</option>)}</select></label>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Seleccionar</th><th>Hora</th><th>Saldo externo</th><th>Precio externo</th><th>Mi saldo</th><th>Cantidad propuesta</th><th>Precio propuesto</th></tr></thead><tbody>{rows.map(row => {
      const mine = own.find(value => value.publicationId === ownPublicationId && value.hour === row.hour)
      const term = terms.find(value => value.externalId === row.id)
      const max = Math.min(Number(row.availableQuantityKwh), mine?.availableQuantityKwh ?? 0)
      const externalPrice = 'pricePerKwh' in row ? row.pricePerKwh : row.maxPricePerKwh
      return <tr key={row.id}><td><input type="checkbox" aria-label={`Negociar ${hourLabel(row.hour)}`} checked={Boolean(term)} disabled={busy || (!term && (!mine || max <= 0))} onChange={() => { if (term) setTerms(current => current.filter(value => value.externalId !== row.id)); else if (mine) setTerms(current => [...current, { externalId: row.id, ownId: mine.id, hour: row.hour!, quantity: formatLocalizedDecimal(max, 'quantity'), price: formatLocalizedDecimal('pricePerKwh' in mine ? mine.pricePerKwh : mine.maxPricePerKwh, 'price') }]) }} /></td><td>{hourLabel(row.hour)}</td><td>{formatEnergyKWh(Number(row.availableQuantityKwh))}</td><td>{formatCopPerKwh(Number(externalPrice))}</td><td>{mine ? formatEnergyKWh(mine.availableQuantityKwh) : 'Sin franja compatible'}</td><td>{term && <LocalizedDecimalInput aria-label={`Cantidad propuesta ${hourLabel(row.hour)}`} mode="quantity" value={term.quantity} disabled={busy} onValueChange={value => setTerms(current => current.map(item => item === term ? { ...item, quantity: value.displayValue } : item))} />}</td><td>{term && <LocalizedDecimalInput aria-label={`Precio propuesto ${hourLabel(row.hour)}`} mode="price" value={term.price} disabled={busy} onValueChange={value => setTerms(current => current.map(item => item === term ? { ...item, price: value.displayValue } : item))} />}</td></tr>
    })}</tbody></table></div>
    {!groups.length && <p>No hay publicaciones horarias externas disponibles.</p>}
    {!selectionEligible && <p role="alert">La selección ya no está habilitada: verifica ambas publicaciones y selecciona de nuevo.</p>}
    <p>{terms.length} horas seleccionadas. Cada hora tendrá una negociación independiente. La selección no reserva energía.</p>
    <p>Total propuesto: {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(terms.reduce((total, term) => total + (parseLocalizedDecimal(term.quantity, 'quantity').numberValue ?? 0) * (parseLocalizedDecimal(term.price, 'price').numberValue ?? 0), 0))}</p>
    <button type="button" className="primary-button" disabled={busy || !terms.length || !selectionEligible} onClick={() => { void submit() }}>{busy ? 'Registrando…' : 'Proponer horas seleccionadas'}</button>
    {error && <p role="alert" className="marketplace-error">{error}</p>}{notice && <p role="status">{notice}</p>}{notice && onNavigate && <button type="button" className="secondary-button" onClick={onNavigate}>Ver mis transacciones</button>}
  </section>
}

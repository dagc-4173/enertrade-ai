import type { EnergyOfferDto, EnergyDemandDto, MarketOffer, MarketDemand } from '../types/marketplace'
import type { MatchingSuggestion } from '../types/matching'
import { formatLocalizedDecimal } from './localizedDecimal'

export type NegotiationTerm = { externalId: string; ownId: string; hour: number; quantity: string; price: string }
export type MatchingNegotiationSelection = { kind: 'offer' | 'demand'; publicationId: string; ownPublicationId: string; term: NegotiationTerm }
export function matchingNegotiationSelection(match: MatchingSuggestion, ownOffers: EnergyOfferDto[], ownDemands: EnergyDemandDto[], offers: MarketOffer[], demands: MarketDemand[]): MatchingNegotiationSelection | null {
  const ownOffer = ownOffers.find(row => row.id === match.offerId)
  const ownDemand = ownDemands.find(row => row.id === match.demandId)
  if (Boolean(ownOffer) === Boolean(ownDemand)) return null
  const mine = ownDemand ?? ownOffer!
  const external = ownDemand ? offers.find(row => row.id === match.offerId) : demands.find(row => row.id === match.demandId)
  if (!external || !mine.publicationId || !external.publicationId || mine.status !== 'ACTIVE' || external.status !== 'ACTIVE' || mine.hour == null || mine.hour !== external.hour || mine.hour !== match.hour || mine.deliveryDate !== external.deliveryDate || mine.deliveryDate !== match.deliveryDate) return null
  const amount = Number(match.suggestedQuantityKwh)
  const price = Number(match.offerPricePerKwh)
  if (!Number.isFinite(amount) || amount <= 0 || amount > mine.availableQuantityKwh || amount > Number(external.availableQuantityKwh) || !Number.isFinite(price) || price <= 0) return null
  return { kind: ownDemand ? 'offer' : 'demand', publicationId: external.publicationId, ownPublicationId: mine.publicationId, term: { externalId: external.id, ownId: mine.id, hour: mine.hour, quantity: formatLocalizedDecimal(amount, 'quantity'), price: formatLocalizedDecimal(price, 'price') } }
}

import type { EnergyDemandDto, EnergyMarketStatus, EnergyOfferDto, MarketDemand, MarketOffer } from '../types/marketplace'

export const publicationFilters: Array<{ value: EnergyMarketStatus | 'ALL'; label: string }> = [
  { value: 'ACTIVE', label: 'Activas' },
  { value: 'FULFILLED', label: 'Completadas' },
  { value: 'EXPIRED', label: 'Vencidas' },
  { value: 'CANCELLED', label: 'Canceladas' },
  { value: 'ALL', label: 'Todas' },
]

export function filteredPublications<T extends EnergyOfferDto | EnergyDemandDto>(publications: T[], filter: EnergyMarketStatus | 'ALL') {
  return publications.filter(publication => filter === 'ALL' || publication.status === filter).toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export function publicationEmptyLabel(type: 'ofertas' | 'demandas', filter: EnergyMarketStatus | 'ALL') {
  const status = publicationFilters.find(item => item.value === filter)?.label.toLowerCase() ?? 'registradas'
  return filter === 'ALL' ? `No tienes ${type} registradas.` : `No tienes ${type} ${status}.`
}

export function marketFingerprint(offers: MarketOffer[], demands: MarketDemand[]) {
  const offerEntries = offers.map(offer => `o:${offer.id}:${offer.availableQuantityKwh}:${offer.pricePerKwh}:${offer.deliveryDate}:${offer.status}`).toSorted()
  const demandEntries = demands.map(demand => `d:${demand.id}:${demand.availableQuantityKwh}:${demand.maxPricePerKwh}:${demand.deliveryDate}:${demand.status}`).toSorted()
  return [...offerEntries, ...demandEntries].join('|')
}
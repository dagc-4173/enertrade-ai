import { ApiError } from '../services/apiClient'
import type { EnergyDemandDto, MarketOffer } from '../types/marketplace'
import type { EnergyTransaction } from '../types/transactions'

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

export type SelectedProposal = { offer: MarketOffer; demand: EnergyDemandDto; max: number }

export function availablePublicationQuantity(publicationId: string, originalQuantityKwh: number, transactions: EnergyTransaction[], field: 'offerId' | 'demandId') {
  const reserved = transactions
    .filter(transaction => transaction[field] === publicationId && (transaction.status === 'PENDING_ACCEPTANCE' || transaction.status === 'CONFIRMED'))
    .reduce((total, transaction) => total + Number(transaction.quantityKwh), 0)
  return Math.max(0, originalQuantityKwh - reserved)
}

export function selectProposal(offer: MarketOffer, demand: EnergyDemandDto): SelectedProposal {
  return { offer, demand, max: Math.min(Number(offer.availableQuantityKwh), demand.quantityKwh) }
}
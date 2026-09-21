import { ApiError } from '../services/apiClient'
import type { EnergyDemandDto, MarketOffer } from '../types/marketplace'

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

export function selectProposal(offer: MarketOffer, demand: EnergyDemandDto): SelectedProposal {
  return { offer, demand, max: Math.min(Number(offer.availableQuantityKwh), demand.quantityKwh) }
}
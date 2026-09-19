export type MatchingStatus = 'matched' | 'partial' | 'no_matches'
export type MatchingCompatibility = 'FULL' | 'PARTIAL' | 'NO_MATCH'
export type MatchingReason = 'SAME_DELIVERY_DATE' | 'PRICE_COMPATIBLE' | 'INSUFFICIENT_QUANTITY' | 'NO_COMPATIBLE_OFFERS'
export type MatchingWarning = 'NO_ACTIVE_OFFERS' | 'NO_ACTIVE_DEMANDS' | 'PARTIAL_MATCHES'

export interface MatchingSuggestion {
  offerId: string
  demandId: string
  suggestedQuantityKwh: string
  offerPricePerKwh: string
  maxDemandPricePerKwh: string
  deliveryDate: string
}

export interface MatchingDemandSummary {
  demandId: string
  requestedQuantityKwh: string
  suggestedQuantityKwh: string
  unmatchedQuantityKwh: string
  compatibility: MatchingCompatibility
  reasons: MatchingReason[]
}

export interface MatchingResult {
  status: MatchingStatus
  matches: MatchingSuggestion[]
  demands: MatchingDemandSummary[]
  summary: { offersConsidered: number; demandsConsidered: number; suggestedMatches: number; matchedQuantityKwh: string; unmatchedDemandKwh: string }
  warnings: MatchingWarning[]
  trace: { executionId: string; persistence: 'persisted' | 'failed' }
}
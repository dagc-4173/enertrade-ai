export type TransactionStatus = 'PENDING_ACCEPTANCE' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED'
export type TransactionRole = 'BUYER' | 'SELLER'
export type ProposalOwnership = 'CREATED_BY_ME' | 'RECEIVED' | 'LEGACY_UNKNOWN'

export interface EnergyTransaction {
  id: string
  offerId: string
  demandId: string
  quantityKwh: string
  pricePerKwh: string
  totalAmountCop: string
  deliveryDate: string
  status: TransactionStatus
  sellerAcceptedAt: string | null
  buyerAcceptedAt: string | null
  createdAt: string
  updatedAt: string
  confirmedAt: string | null
  cancelledAt: string | null
  matchingExecutionId: string | null
  role: TransactionRole
  proposalOwnership: ProposalOwnership
}
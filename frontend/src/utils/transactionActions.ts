import type { EnergyTransaction } from '../types/transactions'

export function canEdit(transaction: EnergyTransaction) {
  return transaction.status === 'PENDING_ACCEPTANCE' && transaction.proposalOwnership === 'CREATED_BY_ME' && transaction.sellerAcceptedAt === null && transaction.buyerAcceptedAt === null
}

export function canCancel(transaction: EnergyTransaction) {
  return canEdit(transaction)
}

export function canReject(transaction: EnergyTransaction) {
  return transaction.status === 'PENDING_ACCEPTANCE' && (transaction.proposalOwnership === 'RECEIVED' || transaction.proposalOwnership === 'LEGACY_UNKNOWN')
}

export function canAccept(transaction: EnergyTransaction) {
  return transaction.status === 'PENDING_ACCEPTANCE' && (transaction.role === 'SELLER' ? transaction.sellerAcceptedAt === null : transaction.buyerAcceptedAt === null)
}
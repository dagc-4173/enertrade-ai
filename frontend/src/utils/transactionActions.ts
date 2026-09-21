import type { EnergyTransaction } from '../types/transactions'

export function canEdit(transaction: EnergyTransaction) {
  return transaction.status === 'PENDING_ACCEPTANCE' && transaction.proposalOwnership === 'CREATED_BY_ME'
}

export function canCancel(transaction: EnergyTransaction) {
  return canEdit(transaction)
}

export function canReject(transaction: EnergyTransaction) {
  return transaction.status === 'PENDING_ACCEPTANCE' && transaction.proposalOwnership === 'RECEIVED'
}

export function canAccept(transaction: EnergyTransaction) {
  return transaction.status === 'PENDING_ACCEPTANCE' && (transaction.role === 'SELLER' ? transaction.sellerAcceptedAt === null : transaction.buyerAcceptedAt === null)
}
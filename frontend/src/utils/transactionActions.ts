import type { EnergyTransaction } from '../types/transactions'

export function hasRevisions(transaction: EnergyTransaction) {
  return transaction.latestRevisionSequence !== null
}

export function canEdit(transaction: EnergyTransaction) {
  return !hasRevisions(transaction) && transaction.status === 'PENDING_ACCEPTANCE' && transaction.proposalOwnership === 'CREATED_BY_ME'
}

export function canCancel(transaction: EnergyTransaction) {
  return transaction.status === 'PENDING_ACCEPTANCE' && transaction.proposalOwnership === 'CREATED_BY_ME'
}

export function canReject(transaction: EnergyTransaction) {
  return hasRevisions(transaction)
    ? transaction.status === 'PENDING_ACCEPTANCE' && transaction.latestRevisionProposedByRole !== transaction.role
    : transaction.status === 'PENDING_ACCEPTANCE' && transaction.proposalOwnership === 'RECEIVED'
}

export function canAccept(transaction: EnergyTransaction) {
  return transaction.status === 'PENDING_ACCEPTANCE' && (transaction.role === 'SELLER' ? transaction.sellerAcceptedAt === null : transaction.buyerAcceptedAt === null)
}

export function canCounter(transaction: EnergyTransaction) {
  return hasRevisions(transaction) && transaction.status === 'PENDING_ACCEPTANCE' && transaction.latestRevisionProposedByRole !== transaction.role
}
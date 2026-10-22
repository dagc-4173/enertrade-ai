import type { EnergyTransaction } from '../types/transactions'
import { canAccept, canCounter, canReject } from './transactionActions'
export type AttentionFilter = 'ALL' | 'MINE' | 'WAITING' | 'FINISHED'
export function transactionAttention(item: EnergyTransaction): Exclude<AttentionFilter, 'ALL'> {
  if (item.status !== 'PENDING_ACCEPTANCE') return 'FINISHED'
  return canAccept(item) || canCounter(item) || canReject(item) ? 'MINE' : 'WAITING'
}
export function attentionLabel(item: EnergyTransaction) {
  const attention = transactionAttention(item)
  return attention === 'MINE' ? 'Requiere tu respuesta' : attention === 'WAITING' ? 'Esperando contraparte' : 'Negociación finalizada'
}
export function matchesTransactionFilter(item: EnergyTransaction, status: string | undefined) {
  if (status === 'PAID') return item.status === 'CONFIRMED' && item.paymentStatus === 'PAID'
  return status === 'UNPAID' ? item.status === 'CONFIRMED' && item.paymentStatus === 'UNPAID' : !status || item.status === status
}
export function filterTransactions(items: EnergyTransaction[], status: string | undefined, attention: AttentionFilter, date: string) {
  return items.filter(item => matchesTransactionFilter(item, status) && (attention === 'ALL' || transactionAttention(item) === attention) && (!date || item.deliveryDate === date))
}

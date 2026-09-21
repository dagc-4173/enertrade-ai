import { ApiError, apiRequest, postJson } from './apiClient'
import type { EnergyTransaction, ProposalOwnership, TransactionRevision, TransactionStatus } from '../types/transactions'

const statuses: TransactionStatus[] = ['PENDING_ACCEPTANCE', 'CONFIRMED', 'REJECTED', 'CANCELLED']
const ownerships: ProposalOwnership[] = ['CREATED_BY_ME', 'RECEIVED', 'LEGACY_UNKNOWN']
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
function transaction(value: unknown): value is EnergyTransaction {
  return object(value) && ['id', 'offerId', 'demandId', 'quantityKwh', 'pricePerKwh', 'totalAmountCop', 'deliveryDate'].every(key => typeof value[key] === 'string') && statuses.includes(value.status as TransactionStatus) && ownerships.includes(value.proposalOwnership as ProposalOwnership) && (value.role === 'BUYER' || value.role === 'SELLER') && date(value.createdAt) && date(value.updatedAt) && (value.sellerAcceptedAt === null || date(value.sellerAcceptedAt)) && (value.buyerAcceptedAt === null || date(value.buyerAcceptedAt)) && (value.latestRevisionSequence === null || Number.isInteger(value.latestRevisionSequence)) && (value.latestRevisionProposedByRole === null || value.latestRevisionProposedByRole === 'BUYER' || value.latestRevisionProposedByRole === 'SELLER') && !('proposedByUserId' in value) && !('sellerUserId' in value) && !('buyerUserId' in value)
}
function revision(value: unknown): value is TransactionRevision {
  return object(value) && Number.isInteger(value.sequence) && ['quantityKwh', 'pricePerKwh', 'totalAmountCop'].every(key => typeof value[key] === 'string') && (value.proposedByRole === 'BUYER' || value.proposedByRole === 'SELLER') && date(value.createdAt) && !('proposedByUserId' in value) && !('sellerUserId' in value) && !('buyerUserId' in value) && !('email' in value)
}
function one(response: { status: number; data: unknown }, status: number | number[]) {
  const accepted = Array.isArray(status) ? status : [status]
  if (!accepted.includes(response.status) || !object(response.data) || !transaction(response.data.transaction)) throw new ApiError('response', 'La API devolvió una transacción con formato inesperado.', response.status)
  return response.data.transaction
}
export async function createTransaction(input: { offerId: string; demandId: string; quantityKwh: number; pricePerKwh: number; matchingExecutionId?: string }) { return one(await postJson<unknown>('/transactions', input, { credentials: 'include' }), [200, 201]) }
export async function listMyTransactions(status?: TransactionStatus, signal?: AbortSignal) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : ''
  const response = await apiRequest<unknown>(`/transactions/mine${suffix}`, { credentials: 'include', signal })
  if (response.status !== 200 || !object(response.data) || !Array.isArray(response.data.transactions) || !response.data.transactions.every(transaction)) throw new ApiError('response', 'La API devolvió un listado de transacciones con formato inesperado.', response.status)
  return response.data.transactions
}
export async function getTransaction(id: string) { return one(await apiRequest<unknown>(`/transactions/${encodeURIComponent(id)}`, { credentials: 'include' }), 200) }
export async function updateTransaction(id: string, input: { quantityKwh: number }) { return one(await apiRequest<unknown>(`/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', json: { quantityKwh: input.quantityKwh }, credentials: 'include' }), 200) }
export async function counterTransaction(id: string, input: { quantityKwh: number; pricePerKwh: number }) { return one(await postJson<unknown>(`/transactions/${encodeURIComponent(id)}/counter`, input, { credentials: 'include' }), 200) }
export async function listTransactionRevisions(id: string, signal?: AbortSignal) {
  const response = await apiRequest<unknown>(`/transactions/${encodeURIComponent(id)}/revisions`, { credentials: 'include', signal })
  if (response.status !== 200 || !object(response.data) || !Array.isArray(response.data.revisions) || !response.data.revisions.every(revision)) throw new ApiError('response', 'La API devolvió revisiones con formato inesperado.', response.status)
  return response.data.revisions
}
export async function acceptTransaction(id: string) { return one(await postJson<unknown>(`/transactions/${encodeURIComponent(id)}/accept`, {}, { credentials: 'include' }), 200) }
export async function rejectTransaction(id: string) { return one(await postJson<unknown>(`/transactions/${encodeURIComponent(id)}/reject`, {}, { credentials: 'include' }), 200) }
export async function cancelTransaction(id: string) { return one(await postJson<unknown>(`/transactions/${encodeURIComponent(id)}/cancel`, {}, { credentials: 'include' }), 200) }
import { expect, test } from 'bun:test'
import { attentionLabel, filterTransactions, transactionAttention } from '../src/utils/transactionPresentation'
import type { EnergyTransaction } from '../src/types/transactions'
const base = { id: 'received', status: 'PENDING_ACCEPTANCE', role: 'BUYER', proposalOwnership: 'RECEIVED', latestRevisionSequence: 2, latestRevisionProposedByRole: 'SELLER', buyerAcceptedAt: null, sellerAcceptedAt: '2026-10-21', deliveryDate: '2026-10-22' } as EnergyTransaction

test('TX-VIEW-01: turno de respuesta sigue aceptaciones y revisión vigente en ambos roles', () => {
 expect(transactionAttention(base)).toBe('MINE')
 expect(attentionLabel(base)).toBe('Requiere tu respuesta')
 expect(transactionAttention({ ...base, role: 'SELLER' })).toBe('WAITING')
 expect(transactionAttention({ ...base, role: 'SELLER', buyerAcceptedAt: 'accepted', sellerAcceptedAt: null, latestRevisionProposedByRole: 'BUYER' })).toBe('MINE')
 for (const status of ['CONFIRMED', 'REJECTED', 'CANCELLED'] as const) expect(transactionAttention({ ...base, status })).toBe('FINISHED')
})
test('TX-VIEW-02: filtros combinados conservan fecha, estado y turno sin modificar registros', () => {
 const rows = [base, { ...base, id: 'paid', status: 'CONFIRMED' as const, deliveryDate: '2026-10-23', paymentStatus: 'PAID' as const }]
 expect(filterTransactions(rows, undefined, 'MINE', '2026-10-22')).toEqual([base])
 expect(filterTransactions(rows, 'CONFIRMED', 'MINE', '')).toEqual([])
 expect(filterTransactions(rows, 'CONFIRMED', 'FINISHED', '2026-10-23')).toEqual([rows[1]!])
 expect(rows).toHaveLength(2)
 expect(base.status).toBe('PENDING_ACCEPTANCE')
})


test('TX-VIEW-03: por pagar muestra solo acuerdos confirmados sin pago y respeta fecha', () => {
 const unpaid = { ...base, id: 'unpaid', status: 'CONFIRMED' as const, paymentStatus: 'UNPAID' as const }
 const rows = [unpaid, { ...unpaid, id: 'paid', paymentStatus: 'PAID' as const }, { ...unpaid, id: 'pending', paymentStatus: 'PENDING' as const }, { ...unpaid, id: 'cancelled', status: 'CANCELLED' as const }]
 expect(filterTransactions(rows, 'UNPAID', 'ALL', '')).toEqual([unpaid])
 expect(filterTransactions(rows, 'UNPAID', 'FINISHED', base.deliveryDate)).toEqual([unpaid])
 expect(filterTransactions(rows, 'UNPAID', 'ALL', '2026-10-23')).toEqual([])
})


test('TX-VIEW-04: pagadas incluye solo acuerdos confirmados con pago aprobado y respeta fecha', () => {
 const paid = { ...base, id: 'paid', status: 'CONFIRMED' as const, paymentStatus: 'PAID' as const }
 const rows = [paid, { ...paid, id: 'unpaid', paymentStatus: 'UNPAID' as const }, { ...paid, id: 'pending', paymentStatus: 'PENDING' as const }, { ...paid, id: 'cancelled', status: 'CANCELLED' as const }]
 expect(filterTransactions(rows, 'PAID', 'ALL', '')).toEqual([paid])
 expect(filterTransactions(rows, 'PAID', 'FINISHED', base.deliveryDate)).toEqual([paid])
 expect(filterTransactions(rows, 'PAID', 'ALL', '2026-10-23')).toEqual([])
})

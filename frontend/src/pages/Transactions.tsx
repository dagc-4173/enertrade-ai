import { useEffect, useState, type FormEvent } from 'react'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ApiError } from '../services/apiClient'
import { acceptTransaction, cancelTransaction, listMyTransactions, rejectTransaction, updateTransaction } from '../services/transactionService'
import type { EnergyTransaction, TransactionStatus } from '../types/transactions'
import { formatCurrencyCOP, formatDeliveryDate, formatEnergyKWh, formatPriceCOPPerKWh } from '../utils/numberFormat'
import { canAccept, canCancel, canEdit, canReject } from '../utils/transactionActions'
import './Transactions.css'

const filters: Array<{ label: string; value: TransactionStatus | undefined }> = [{ label: 'Todas', value: undefined }, { label: 'Pendientes', value: 'PENDING_ACCEPTANCE' }, { label: 'Confirmadas', value: 'CONFIRMED' }, { label: 'Rechazadas', value: 'REJECTED' }, { label: 'Canceladas', value: 'CANCELLED' }]
const statusLabel: Record<TransactionStatus, string> = { PENDING_ACCEPTANCE: 'Pendiente', CONFIRMED: 'Confirmada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' }
const tone = (status: TransactionStatus) => status === 'CONFIRMED' ? 'success' : status === 'PENDING_ACCEPTANCE' ? 'warning' : 'neutral'
function message(error: unknown) { return error instanceof ApiError ? error.serverMessage ?? 'No fue posible completar la operación.' : 'No fue posible completar la operación.' }
function acceptanceMessage(item: EnergyTransaction) {
  if (item.status === 'CONFIRMED') return 'Transacción energética simulada confirmada.'
  if (item.status !== 'PENDING_ACCEPTANCE') return null
  if (item.sellerAcceptedAt && !item.buyerAcceptedAt) return 'Esperando aceptación del comprador.'
  if (item.buyerAcceptedAt && !item.sellerAcceptedAt) return 'Esperando aceptación del vendedor.'
  return 'Pendiente de aceptación de comprador y vendedor.'
}
function ownershipLabel(ownership: EnergyTransaction['proposalOwnership']) { return ownership === 'CREATED_BY_ME' ? 'Propuesta creada por ti' : ownership === 'RECEIVED' ? 'Propuesta recibida' : 'Propuesta histórica' }

export function Transactions() {
  const [filter, setFilter] = useState<TransactionStatus | undefined>()
  const [items, setItems] = useState<EnergyTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQuantity, setEditQuantity] = useState('')
  useEffect(() => { const controller = new AbortController(); listMyTransactions(filter, controller.signal).then(setItems).catch(reason => { if (!controller.signal.aborted) setError(message(reason)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [filter, revision])
  function refresh() { setLoading(true); setError(''); setRevision(value => value + 1) }
  async function act(id: string, action: 'accept' | 'reject' | 'cancel') { if (busy) return; if (action === 'cancel' && !window.confirm('Esta propuesta será cancelada y la reserva de energía se liberará. El registro permanecerá en el historial.')) return; setBusy(id); setError(''); try { const result = action === 'accept' ? await acceptTransaction(id) : action === 'reject' ? await rejectTransaction(id) : await cancelTransaction(id); setNotice(result.status === 'CONFIRMED' ? 'Transacción energética simulada confirmada.' : action === 'reject' ? 'Propuesta rechazada y reserva liberada.' : action === 'cancel' ? 'Propuesta cancelada y reserva liberada.' : 'Aceptación registrada.'); refresh() } catch (reason) { setError(message(reason)) } finally { setBusy(null) } }
  async function saveEdit(event: FormEvent<HTMLFormElement>, id: string) { event.preventDefault(); const quantityKwh = Number(editQuantity); if (!Number.isFinite(quantityKwh) || quantityKwh <= 0) { setError('Ingresa una cantidad mayor que cero.'); return } setBusy(id); setError(''); try { await updateTransaction(id, { quantityKwh }); setEditingId(null); setNotice('Propuesta actualizada. Las aceptaciones deben realizarse nuevamente.'); refresh() } catch (reason) { setError(message(reason)) } finally { setBusy(null) } }
  return <div className="page-grid transactions-page"><section className="panel transactions-intro"><SectionHeader eyebrow="Transacciones" title="Mis transacciones" description="Registro de intercambios energéticos simulados. La pasarela de pagos y la liquidación financiera no forman parte de esta versión." />
    <div className="transaction-filters">{filters.map(item => <button key={item.label} type="button" className={filter === item.value ? 'primary-button' : 'secondary-button'} onClick={() => { setLoading(true); setError(''); setFilter(item.value) }}>{item.label}</button>)}</div></section>
    {notice && <p className="transaction-notice" role="status">{notice}</p>}{error && <div className="panel" role="alert"><p className="marketplace-error">{error}</p><button className="secondary-button" type="button" onClick={refresh}>Reintentar</button></div>}
    {loading && <p role="status">Cargando transacciones…</p>}
    {!loading && !error && items.length === 0 && <section className="panel"><p className="marketplace-empty">No tienes transacciones todavía.</p></section>}
    {!loading && !error && <div className="transaction-list">{items.map(item => <article className="panel transaction-item" key={item.id}><div className="row-between"><strong>Referencia {item.id.slice(0, 8)} · {item.role === 'SELLER' ? 'Vendedor' : 'Comprador'}</strong><StatusBadge tone={tone(item.status)}>{statusLabel[item.status]}</StatusBadge></div><p className="transaction-ownership">{ownershipLabel(item.proposalOwnership)}</p><p>{formatEnergyKWh(Number(item.quantityKwh))} a {formatPriceCOPPerKWh(Number(item.pricePerKwh))}</p><p>Total: {formatCurrencyCOP(Number(item.totalAmountCop))}. Entrega: {formatDeliveryDate(item.deliveryDate)}</p><p>Comprador: {item.buyerAcceptedAt ? 'Aceptado' : 'Pendiente'} · Vendedor: {item.sellerAcceptedAt ? 'Aceptado' : 'Pendiente'}</p><p>{acceptanceMessage(item)}</p><p>Creada: {new Date(item.createdAt).toLocaleString('es-CO')}{item.confirmedAt ? ` · Confirmada: ${new Date(item.confirmedAt).toLocaleString('es-CO')}` : ''}</p>{editingId === item.id ? <form className="transaction-edit-form" onSubmit={event => { void saveEdit(event, item.id) }} aria-busy={busy === item.id}><label>Cantidad (kWh)<input type="number" min="0.01" step="0.01" value={editQuantity} onChange={event => setEditQuantity(event.target.value)} disabled={busy === item.id} required /></label><p>Precio: {formatPriceCOPPerKWh(Number(item.pricePerKwh))}. Entrega: {formatDeliveryDate(item.deliveryDate)}. Total actual: {formatCurrencyCOP(Number(item.totalAmountCop))}.</p><p>El total se recalculará al guardar.</p>{(item.sellerAcceptedAt || item.buyerAcceptedAt) && <p role="alert">Al modificar la propuesta, las aceptaciones existentes se invalidarán y ambas partes deberán aceptar nuevamente.</p>}<div className="marketplace-actions"><button type="submit" className="primary-button" disabled={busy === item.id}>{busy === item.id ? 'Guardando…' : 'Guardar cambios'}</button><button type="button" className="secondary-button" onClick={() => setEditingId(null)} disabled={busy === item.id}>Cancelar edición</button></div></form> : <div className="marketplace-actions">{canAccept(item) && <button type="button" className="primary-button" disabled={busy === item.id} onClick={() => { void act(item.id, 'accept') }}>Aceptar</button>}{canReject(item) && <button type="button" className="secondary-button" disabled={busy === item.id} onClick={() => { void act(item.id, 'reject') }}>Rechazar</button>}{canEdit(item) && <button type="button" className="secondary-button" disabled={busy === item.id} onClick={() => { setEditingId(item.id); setEditQuantity(item.quantityKwh); setError('') }}>Editar propuesta</button>}{canCancel(item) && <button type="button" className="secondary-button" disabled={busy === item.id} onClick={() => { void act(item.id, 'cancel') }}>Eliminar propuesta</button>}</div>}</article>)}</div>}
  </div>
}

import { useEffect, useState, type FormEvent } from 'react'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ApiError } from '../services/apiClient'
import { acceptTransaction, cancelTransaction, counterTransaction, listMyTransactions, listTransactionRevisions, rejectTransaction, updateTransaction } from '../services/transactionService'
import type { EnergyTransaction, TransactionRevision, TransactionStatus } from '../types/transactions'
import { formatCurrencyCOP, formatDeliveryDate, formatEnergyKWh, formatPriceCOPPerKWh } from '../utils/numberFormat'
import { canAccept, canCancel, canCounter, canEdit, canReject, hasRevisions } from '../utils/transactionActions'
import './Transactions.css'

const filters: Array<{ label: string; value: TransactionStatus | undefined }> = [{ label: 'Todas', value: undefined }, { label: 'Pendientes', value: 'PENDING_ACCEPTANCE' }, { label: 'Confirmadas', value: 'CONFIRMED' }, { label: 'Rechazadas', value: 'REJECTED' }, { label: 'Canceladas', value: 'CANCELLED' }]
const statusLabel: Record<TransactionStatus, string> = { PENDING_ACCEPTANCE: 'Pendiente', CONFIRMED: 'Confirmada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' }
const tone = (status: TransactionStatus) => status === 'CONFIRMED' ? 'success' : status === 'PENDING_ACCEPTANCE' ? 'warning' : 'neutral'
const roleLabel = (role: 'BUYER' | 'SELLER') => role === 'BUYER' ? 'comprador' : 'vendedor'
function message(error: unknown) { return error instanceof ApiError ? error.serverMessage ?? 'No fue posible completar la operación.' : 'No fue posible completar la operación.' }
function acceptanceMessage(item: EnergyTransaction) {
  if (item.status === 'CONFIRMED') return 'Transacción energética simulada confirmada.'
  if (item.status !== 'PENDING_ACCEPTANCE') return null
  if (hasRevisions(item) && item.latestRevisionProposedByRole === item.role) return `Esperando respuesta del ${roleLabel(item.role === 'BUYER' ? 'SELLER' : 'BUYER')}.`
  if (item.sellerAcceptedAt && !item.buyerAcceptedAt) return 'Esperando aceptación del comprador.'
  if (item.buyerAcceptedAt && !item.sellerAcceptedAt) return 'Esperando aceptación del vendedor.'
  return 'Pendiente de aceptación de comprador y vendedor.'
}
function ownershipLabel(item: EnergyTransaction) {
  if (hasRevisions(item)) return `Negociación con revisión ${item.latestRevisionSequence}`
  return item.proposalOwnership === 'CREATED_BY_ME' ? 'Propuesta creada por ti' : item.proposalOwnership === 'RECEIVED' ? 'Propuesta recibida' : 'Propuesta histórica'
}

export function Transactions() {
  const [filter, setFilter] = useState<TransactionStatus | undefined>()
  const [items, setItems] = useState<EnergyTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQuantity, setEditQuantity] = useState('')
  const [counterId, setCounterId] = useState<string | null>(null)
  const [counterQuantity, setCounterQuantity] = useState('')
  const [counterPrice, setCounterPrice] = useState('')
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [history, setHistory] = useState<TransactionRevision[]>([])

  useEffect(() => {
    const controller = new AbortController()
    listMyTransactions(filter, controller.signal).then(setItems).catch(reason => { if (!controller.signal.aborted) setError(message(reason)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filter, refreshVersion])

  function refresh() { setLoading(true); setError(''); setRefreshVersion(value => value + 1) }
  async function act(id: string, action: 'accept' | 'reject' | 'cancel') {
    if (busy) return
    if (action === 'cancel' && !window.confirm('Esta negociación será cancelada y la reserva de energía se liberará. El historial permanecerá disponible.')) return
    setBusy(id); setError('')
    try {
      const result = action === 'accept' ? await acceptTransaction(id) : action === 'reject' ? await rejectTransaction(id) : await cancelTransaction(id)
      setNotice(result.status === 'CONFIRMED' ? 'Transacción energética simulada confirmada.' : action === 'reject' ? 'Negociación rechazada y reserva liberada.' : action === 'cancel' ? 'Negociación cancelada y reserva liberada.' : 'Aceptación registrada.')
      refresh()
    } catch (reason) { setError(message(reason)) } finally { setBusy(null) }
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); const quantityKwh = Number(editQuantity)
    if (!Number.isFinite(quantityKwh) || quantityKwh <= 0) { setError('Ingresa una cantidad mayor que cero.'); return }
    setBusy(id); setError('')
    try { await updateTransaction(id, { quantityKwh }); setEditingId(null); setNotice('Propuesta actualizada. Las aceptaciones deben realizarse nuevamente.'); refresh() } catch (reason) { setError(message(reason)) } finally { setBusy(null) }
  }
  async function saveCounter(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); const quantityKwh = Number(counterQuantity); const pricePerKwh = Number(counterPrice)
    if (!Number.isFinite(quantityKwh) || quantityKwh <= 0 || !Number.isFinite(pricePerKwh) || pricePerKwh <= 0 || !/^\d+(?:\.\d{1,5})?$/.test(counterPrice)) { setError('Ingresa cantidad positiva y precio positivo con máximo cinco decimales.'); return }
    setBusy(id); setError('')
    try { await counterTransaction(id, { quantityKwh, pricePerKwh }); setCounterId(null); setNotice('Contrapropuesta enviada.'); refresh() } catch (reason) { setError(message(reason)) } finally { setBusy(null) }
  }
  async function showHistory(id: string) {
    if (busy) return
    if (historyId === id) { setHistoryId(null); setHistory([]); return }
    setBusy(id); setError('')
    try { setHistory(await listTransactionRevisions(id)); setHistoryId(id) } catch (reason) { setError(message(reason)) } finally { setBusy(null) }
  }

  return <div className="page-grid transactions-page">
    <section className="panel transactions-intro"><SectionHeader eyebrow="Transacciones" title="Mis transacciones" description="Registro de intercambios energéticos simulados. La pasarela de pagos y la liquidación financiera no forman parte de esta versión." />
      <div className="transaction-filters">{filters.map(item => <button key={item.label} type="button" className={filter === item.value ? 'primary-button' : 'secondary-button'} onClick={() => { setLoading(true); setError(''); setFilter(item.value) }}>{item.label}</button>)}</div>
    </section>
    {notice && <p className="transaction-notice" role="status">{notice}</p>}
    {error && <div className="panel" role="alert"><p className="marketplace-error">{error}</p><button className="secondary-button" type="button" onClick={refresh}>Reintentar</button></div>}
    {loading && <p role="status">Cargando transacciones…</p>}
    {!loading && !error && items.length === 0 && <section className="panel"><p className="marketplace-empty">No tienes transacciones todavía.</p></section>}
    {!loading && !error && <div className="transaction-list">{items.map(item => <article className="panel transaction-item" key={item.id}>
      <div className="row-between"><strong>Referencia {item.id.slice(0, 8)} · {item.role === 'SELLER' ? 'Vendedor' : 'Comprador'}</strong><StatusBadge tone={tone(item.status)}>{statusLabel[item.status]}</StatusBadge></div>
      <p className="transaction-ownership">{ownershipLabel(item)}</p>
      {hasRevisions(item) && <><h3>Término vigente</h3><p>Cantidad: {formatEnergyKWh(Number(item.quantityKwh))}</p><p>Precio: {formatPriceCOPPerKWh(Number(item.pricePerKwh))}</p><p>Total: {formatCurrencyCOP(Number(item.totalAmountCop))}</p><p>Propuesto por {roleLabel(item.latestRevisionProposedByRole!)}.</p></>}
      {!hasRevisions(item) && <p>{formatEnergyKWh(Number(item.quantityKwh))} a {formatPriceCOPPerKWh(Number(item.pricePerKwh))}</p>}
      <p>Entrega: {formatDeliveryDate(item.deliveryDate)}</p><p>Comprador: {item.buyerAcceptedAt ? 'Aceptado' : 'Pendiente'} · Vendedor: {item.sellerAcceptedAt ? 'Aceptado' : 'Pendiente'}</p><p>{acceptanceMessage(item)}</p>
      {editingId === item.id && <form className="transaction-edit-form" onSubmit={event => { void saveEdit(event, item.id) }}><label>Cantidad (kWh)<input type="number" min="0.01" step="0.01" value={editQuantity} onChange={event => setEditQuantity(event.target.value)} disabled={busy === item.id} required /></label><div className="marketplace-actions"><button type="submit" className="primary-button" disabled={busy === item.id}>Guardar cambios</button><button type="button" className="secondary-button" onClick={() => setEditingId(null)}>Cancelar edición</button></div></form>}
      {counterId === item.id && <form className="transaction-edit-form" onSubmit={event => { void saveCounter(event, item.id) }}><label>Cantidad (kWh)<input type="number" min="0.01" step="0.01" value={counterQuantity} onChange={event => setCounterQuantity(event.target.value)} disabled={busy === item.id} required /></label><label>Precio (COP/kWh)<input type="number" min="0.00001" step="0.00001" value={counterPrice} onChange={event => setCounterPrice(event.target.value)} disabled={busy === item.id} required /></label><div className="marketplace-actions"><button type="submit" className="primary-button" disabled={busy === item.id}>Enviar contrapropuesta</button><button type="button" className="secondary-button" onClick={() => setCounterId(null)}>Cancelar</button></div></form>}
      {historyId === item.id && <ol className="transaction-history" aria-label="Historial de negociación">{history.map(entry => <li key={entry.sequence}><strong>#{entry.sequence} · {roleLabel(entry.proposedByRole)}</strong><span>{formatEnergyKWh(Number(entry.quantityKwh))} · {formatPriceCOPPerKWh(Number(entry.pricePerKwh))} · {formatCurrencyCOP(Number(entry.totalAmountCop))}</span><span>{new Date(entry.createdAt).toLocaleString('es-CO')}</span></li>)}</ol>}
      <div className="marketplace-actions">
        {hasRevisions(item) && <button type="button" className="secondary-button" onClick={() => { void showHistory(item.id) }} disabled={busy === item.id}>{historyId === item.id ? 'Ocultar historial' : 'Ver historial'}</button>}
        {canEdit(item) && <button type="button" className="secondary-button" onClick={() => { setEditingId(item.id); setEditQuantity(item.quantityKwh) }}>Editar propuesta</button>}
        {canCounter(item) && <button type="button" className="primary-button" onClick={() => { setCounterId(item.id); setCounterQuantity(item.quantityKwh); setCounterPrice(item.pricePerKwh) }}>Contraproponer</button>}
        {canAccept(item) && <button type="button" className="primary-button" onClick={() => { void act(item.id, 'accept') }}>Aceptar</button>}
        {canReject(item) && <button type="button" className="secondary-button" onClick={() => { void act(item.id, 'reject') }}>Rechazar</button>}
        {canCancel(item) && <button type="button" className="secondary-button" onClick={() => { void act(item.id, 'cancel') }}>{hasRevisions(item) ? 'Cancelar negociación' : 'Cancelar propuesta'}</button>}
      </div>
    </article>)}</div>}
  </div>
}
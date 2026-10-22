import { attentionLabel, filterTransactions, matchesTransactionFilter, transactionAttention, type AttentionFilter } from '../utils/transactionPresentation'
import {transactionNeedsPayment,transactionPaymentLabel} from '../utils/transactionPayment'
import { SimulatedPaymentPanel } from '../components/SimulatedPaymentPanel'
import { hourLabel } from '../utils/hourlyMarket'
import { Fragment, useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import { LocalizedDecimalInput } from '../components/forms/LocalizedDecimalInput'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useVisiblePolling } from '../hooks/useVisiblePolling'
import { ApiError } from '../services/apiClient'
import { acceptTransaction, cancelTransaction, counterTransaction, listMyTransactions, listTransactionRevisions, rejectTransaction, updateTransaction } from '../services/transactionService'
import type { EnergyTransaction, TransactionRevision, TransactionStatus } from '../types/transactions'
import { parseLocalizedDecimal, formatLocalizedDecimal } from '../utils/localizedDecimal'
import { formatCurrencyCOP, formatDeliveryDate, formatEnergyKWh, formatPriceCOPPerKWh } from '../utils/numberFormat'
import { canAccept, canCancel, canCounter, canEdit, canReject, hasRevisions } from '../utils/transactionActions'
import './Transactions.css'

const filters: Array<{ label: string; value: TransactionStatus | 'UNPAID' | 'PAID' | undefined }> = [
  { label: 'Todas', value: undefined }, { label: 'Por pagar', value: 'UNPAID' }, { label: 'Pagadas', value: 'PAID' }, { label: 'Pendientes', value: 'PENDING_ACCEPTANCE' }, { label: 'Confirmadas', value: 'CONFIRMED' }, { label: 'Rechazadas', value: 'REJECTED' }, { label: 'Canceladas', value: 'CANCELLED' },
]
const statusLabel: Record<TransactionStatus, string> = { PENDING_ACCEPTANCE: 'Pendiente', CONFIRMED: 'Confirmada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' }
const tone = (status: TransactionStatus) => status === 'CONFIRMED' ? 'success' : status === 'PENDING_ACCEPTANCE' ? 'warning' : 'neutral'
const roleLabel = (role: 'BUYER' | 'SELLER') => role === 'BUYER' ? 'comprador' : 'vendedor'
const number = (value: string, mode: 'quantity' | 'price') => parseLocalizedDecimal(value, mode).numberValue
function message(error: unknown) { return error instanceof ApiError ? error.serverMessage ?? 'No fue posible completar la operación.' : 'No fue posible completar la operación.' }
function acceptanceMessage(item: EnergyTransaction) { if (item.status === 'CONFIRMED') return 'Transacción energética simulada confirmada.'; if (item.status !== 'PENDING_ACCEPTANCE') return null; if (hasRevisions(item) && item.latestRevisionProposedByRole === item.role) return `Esperando respuesta del ${roleLabel(item.role === 'BUYER' ? 'SELLER' : 'BUYER')}.`; if (item.sellerAcceptedAt && !item.buyerAcceptedAt) return 'Esperando aceptación del comprador.'; if (item.buyerAcceptedAt && !item.sellerAcceptedAt) return 'Esperando aceptación del vendedor.'; return 'Pendiente de aceptación de comprador y vendedor.' }
function ownershipLabel(item: EnergyTransaction) { return hasRevisions(item) ? `Negociación con revisión ${item.latestRevisionSequence}` : item.proposalOwnership === 'CREATED_BY_ME' ? 'Propuesta creada por ti' : item.proposalOwnership === 'RECEIVED' ? 'Propuesta recibida' : 'Propuesta histórica' }

export function Transactions() {
  const [filter, setFilter] = useState<TransactionStatus | 'UNPAID' | 'PAID' | undefined>()
  const [expandedId,setExpandedId] = useState<string | null>(null)
  const [attention, setAttention] = useState<AttentionFilter>('ALL')
  const [deliveryDate, setDeliveryDate] = useState('')
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

  async function refreshTransactions(signal?: AbortSignal) {
    try {
      const loaded = await listMyTransactions(undefined, signal)
      if (signal?.aborted) return
      setItems(loaded)
      setError('')
      if (historyId) setHistory(await listTransactionRevisions(historyId, signal))
    } catch (reason) {
      if (!signal?.aborted) setError(message(reason))
    }
  }

  const refreshInitially = useEffectEvent((signal: AbortSignal) => refreshTransactions(signal))

  useEffect(() => {
    const controller = new AbortController()
    const task = window.setTimeout(() => {
      void refreshInitially(controller.signal).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 0)
    return () => { window.clearTimeout(task); controller.abort() }
  }, [refreshVersion])

  useVisiblePolling(signal => refreshTransactions(signal), 5000, true)
  const refreshPaymentRows = useEffectEvent(() => { void refreshTransactions() })
  useEffect(() => {
    const update = () => refreshPaymentRows()
    window.addEventListener('enertrade:payments-changed', update)
    return () => window.removeEventListener('enertrade:payments-changed', update)
  }, [])

  function refresh() { setLoading(true); setError(''); setRefreshVersion(value => value + 1) }
  async function act(id: string, action: 'accept' | 'reject' | 'cancel') {
    if (busy) return
    if (action === 'cancel' && !window.confirm('Esta negociación será cancelada y la reserva de energía se liberará. El historial permanecerá disponible.')) return
    setBusy(id); setError('')
    try {
      const result = action === 'accept' ? await acceptTransaction(id) : action === 'reject' ? await rejectTransaction(id) : await cancelTransaction(id)
      window.dispatchEvent(new Event('enertrade:payments-changed'))
      setNotice(result.status === 'CONFIRMED' ? 'Transacción energética simulada confirmada.' : action === 'reject' ? 'Negociación rechazada y reserva liberada.' : action === 'cancel' ? 'Negociación cancelada y reserva liberada.' : 'Aceptación registrada.')
      refresh()
    } catch (reason) { setError(message(reason)) } finally { setBusy(null) }
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault()
    const quantityKwh = number(editQuantity, 'quantity')
    if (quantityKwh === null || quantityKwh <= 0) { setError('Ingresa una cantidad válida mayor que cero.'); return }
    setBusy(id); setError('')
    try { await updateTransaction(id, { quantityKwh }); setEditingId(null); setNotice('Propuesta actualizada. Las aceptaciones deben realizarse nuevamente.'); refresh() } catch (reason) { setError(message(reason)) } finally { setBusy(null) }
  }
  async function saveCounter(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault()
    const quantityKwh = number(counterQuantity, 'quantity')
    const pricePerKwh = number(counterPrice, 'price')
    if (quantityKwh === null || quantityKwh <= 0) { setError('Ingresa una cantidad válida mayor que cero.'); return }
    if (pricePerKwh === null || pricePerKwh <= 0) { setError('Ingresa un precio válido mayor que cero.'); return }
    setBusy(id); setError('')
    try { await counterTransaction(id, { quantityKwh, pricePerKwh }); setCounterId(null); setNotice('Contrapropuesta enviada.'); refresh() } catch (reason) { setError(message(reason)) } finally { setBusy(null) }
  }
  async function showHistory(id: string) {
    if (busy) return
    if (historyId === id) { setHistoryId(null); setHistory([]); return }
    setBusy(id); setError('')
    try { setHistory(await listTransactionRevisions(id)); setHistoryId(id) } catch (reason) { setError(message(reason)) } finally { setBusy(null) }
  }

  const datedItems = items.filter(item => !deliveryDate || item.deliveryDate === deliveryDate)
  const visibleItems = filterTransactions(items, filter, attention, deliveryDate)
  const attentionOptions: { value: AttentionFilter; label: string }[] = [
    { value: 'ALL', label: 'Todas' }, { value: 'MINE', label: 'Requieren tu respuesta' },
    { value: 'WAITING', label: 'Esperando contraparte' }, { value: 'FINISHED', label: 'Finalizadas' },
  ]
  return <div className="page-grid transactions-page">
    <section className="panel transactions-intro"><SectionHeader eyebrow="Transacciones" title="Mis transacciones" description="Registro de intercambios energéticos simulados. Incluye pago simulado y comprobante. El simulador no mueve dinero real ni realiza liquidación financiera." />
      <div className="transaction-toolbar"><label>Fecha de entrega<select value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)}><option value="">Todas las fechas</option>{[...new Set(items.map(item => item.deliveryDate))].sort().reverse().map(date => <option key={date} value={date}>{formatDeliveryDate(date)}</option>)}</select></label><button type="button" className="secondary-button" disabled={loading || busy !== null} onClick={refresh}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
      <p className="transaction-filter-label">Por respuesta</p><div className="transaction-attention" role="group" aria-label="Quién debe responder">{attentionOptions.map(option => <button type="button" key={option.value} aria-pressed={attention === option.value} onClick={() => setAttention(option.value)}><strong>{loading ? '—' : datedItems.filter(item => option.value === 'ALL' || transactionAttention(item) === option.value).length}</strong><span>{option.label}</span></button>)}</div>
      <p className="transaction-filter-label">Por estado</p><div className="transaction-filters" role="group" aria-label="Estado del acuerdo">{filters.map(item => <button key={item.label} type="button" aria-pressed={filter === item.value} className={filter === item.value ? 'primary-button' : 'secondary-button'} onClick={() => setFilter(item.value)}>{item.label} <span className="filter-count">{loading ? '—' : datedItems.filter(row => (attention === 'ALL' || transactionAttention(row) === attention) && matchesTransactionFilter(row, item.value)).length}</span></button>)}</div>
    </section>
    {notice && <p className="transaction-notice" role="status">{notice}</p>}
    {error && <div className="panel" role="alert"><p className="marketplace-error">{error}</p><button className="secondary-button" type="button" onClick={refresh}>Reintentar</button></div>}
    {loading && <p role="status">Cargando transacciones…</p>}
    {!loading && !error && visibleItems.length === 0 && <section className="panel"><p className="marketplace-empty">No hay transacciones para esta selección. Prueba otra fecha o cambia los filtros.</p></section>}
    {!loading && !error && <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Hora</th><th>Rol</th><th>Condiciones vigentes</th><th>Total</th><th>Acuerdo</th><th>Pago simulado</th><th>Gestión</th></tr></thead><tbody>{visibleItems.map(item => <Fragment key={item.id}><tr className={transactionNeedsPayment(item) ? 'transaction-unpaid' : undefined}><td>{formatDeliveryDate(item.deliveryDate)}</td><td>{hourLabel(item.hour)}</td><td>{roleLabel(item.role)}</td><td><div className="transaction-terms"><strong>{formatEnergyKWh(Number(item.quantityKwh))}</strong><span>{formatPriceCOPPerKWh(Number(item.pricePerKwh))}</span></div></td><td>{formatCurrencyCOP(Number(item.totalAmountCop))}</td><td><StatusBadge tone={tone(item.status)}>{statusLabel[item.status]}</StatusBadge><span className="transaction-attention-label" data-attention={transactionAttention(item)}>{attentionLabel(item)}</span></td><td><span className="transaction-payment-label">{transactionPaymentLabel(item) ?? (item.status === 'CONFIRMED' ? 'Sin información de pago' : 'No habilitado')}</span></td><td><button type="button" className="transaction-detail-toggle" aria-expanded={expandedId === item.id} aria-controls={`detail-${item.id}`} onClick={() => setExpandedId(current => current === item.id ? null : item.id)}>{expandedId === item.id ? 'Ocultar detalle' : transactionAttention(item) === 'MINE' ? 'Revisar y responder' : 'Ver negociación'}</button></td></tr>{expandedId === item.id && <tr className="transaction-detail-row"><td colSpan={8} id={`detail-${item.id}`}><article className="transaction-item">
      <div className="row-between"><strong>Referencia {item.id.slice(0, 8)} · {item.role === 'SELLER' ? 'Vendedor' : 'Comprador'}</strong><StatusBadge tone={tone(item.status)}>{statusLabel[item.status]}</StatusBadge></div>
      <p className="transaction-ownership">{ownershipLabel(item)}</p>
      {hasRevisions(item) ? <><h3>Término vigente</h3><p>Cantidad: {formatEnergyKWh(Number(item.quantityKwh))}</p><p>Precio: {formatPriceCOPPerKWh(Number(item.pricePerKwh))}</p><p>Total: {formatCurrencyCOP(Number(item.totalAmountCop))}</p><p>Propuesto por {roleLabel(item.latestRevisionProposedByRole!)}.</p></> : <p>{formatEnergyKWh(Number(item.quantityKwh))} a {formatPriceCOPPerKWh(Number(item.pricePerKwh))}</p>}
      <p>Entrega: {formatDeliveryDate(item.deliveryDate)} · {hourLabel(item.hour)}</p><p>Comprador: {item.buyerAcceptedAt ? 'Aceptado' : 'Pendiente'} · Vendedor: {item.sellerAcceptedAt ? 'Aceptado' : 'Pendiente'}</p><p>{acceptanceMessage(item)}</p>
      {editingId === item.id && <form className="transaction-edit-form" onSubmit={event => { void saveEdit(event, item.id) }}><label>Cantidad (kWh)<LocalizedDecimalInput mode="quantity" value={editQuantity} onValueChange={value => setEditQuantity(value.displayValue)} disabled={busy === item.id} required /></label><div className="marketplace-actions"><button type="submit" className="primary-button" disabled={busy === item.id}>Guardar cambios</button><button type="button" className="secondary-button" onClick={() => setEditingId(null)}>Cancelar edición</button></div></form>}
      {counterId === item.id && <form className="transaction-edit-form" onSubmit={event => { void saveCounter(event, item.id) }}><label>Cantidad (kWh)<LocalizedDecimalInput mode="quantity" value={counterQuantity} onValueChange={value => setCounterQuantity(value.displayValue)} disabled={busy === item.id} required /></label><label>Precio (COP/kWh)<LocalizedDecimalInput mode="price" value={counterPrice} onValueChange={value => setCounterPrice(value.displayValue)} disabled={busy === item.id} required /></label><div className="marketplace-actions"><button type="submit" className="primary-button" disabled={busy === item.id}>Enviar contrapropuesta</button><button type="button" className="secondary-button" onClick={() => setCounterId(null)}>Cancelar</button></div></form>}
      {historyId === item.id && <ol className="transaction-history" aria-label="Historial de negociación">{history.map(entry => <li key={entry.sequence} className={entry.sequence === item.latestRevisionSequence ? 'transaction-current-revision' : undefined}>{entry.sequence === item.latestRevisionSequence && <span className="transaction-current-label">Condiciones vigentes</span>}<strong>#{entry.sequence} · {roleLabel(entry.proposedByRole)}</strong><span>{formatEnergyKWh(Number(entry.quantityKwh))} · {formatPriceCOPPerKWh(Number(entry.pricePerKwh))} · {formatCurrencyCOP(Number(entry.totalAmountCop))}</span><span>{new Date(entry.createdAt).toLocaleString('es-CO')}</span></li>)}</ol>}
      <div className="marketplace-actions">
        {hasRevisions(item) && <button type="button" className="secondary-button" onClick={() => { void showHistory(item.id) }} disabled={busy === item.id}>{historyId === item.id ? 'Ocultar historial' : 'Ver historial'}</button>}
        {canEdit(item) && <button type="button" className="secondary-button" onClick={() => { setEditingId(item.id); setEditQuantity(formatLocalizedDecimal(item.quantityKwh, 'quantity')) }}>Editar propuesta</button>}
        {canCounter(item) && <button type="button" disabled={busy !== null} className="secondary-button" onClick={() => { setCounterId(item.id); setCounterQuantity(formatLocalizedDecimal(item.quantityKwh, 'quantity')); setCounterPrice(formatLocalizedDecimal(item.pricePerKwh, 'price')) }}>Contraproponer</button>}
        {canAccept(item) && <button type="button" className="primary-button" disabled={busy !== null} onClick={() => { void act(item.id, 'accept') }}>Aceptar</button>}
        {canReject(item) && <button type="button" className="secondary-button transaction-destructive" disabled={busy !== null} onClick={() => { void act(item.id, 'reject') }}>Rechazar</button>}
        {canCancel(item) && <button type="button" className="secondary-button transaction-destructive" disabled={busy !== null} onClick={() => { void act(item.id, 'cancel') }}>{hasRevisions(item) ? 'Cancelar negociación' : 'Cancelar propuesta'}</button>}
      </div>
      <SimulatedPaymentPanel transaction={item} />
    </article></td></tr>}</Fragment>)}</tbody></table></div>}
  </div>
}

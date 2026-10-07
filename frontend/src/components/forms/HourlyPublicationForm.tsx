import { useEffect, useState, type FormEvent } from 'react'
import { LocalizedDecimalInput } from './LocalizedDecimalInput'
import { createHourlyPublication, getPublicationWindow } from '../../services/marketplaceService'
import { errorMessage } from '../../utils/marketplaceActions'
import { parseLocalizedDecimal } from '../../utils/localizedDecimal'
import { formatDeliveryDate } from '../../utils/numberFormat'

type Slot = { quantity: string; price: string }
import { hourLabel } from '../../utils/hourlyMarket'
export function HourlyPublicationForm({ kind, onCreated }: { kind: 'offer' | 'demand'; onCreated: () => void }) {
  const [dates, setDates] = useState<string[]>([])
  const [activeDate, setActiveDate] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Record<number, Slot>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { const controller = new AbortController(); getPublicationWindow(controller.signal).then(values => { if (!controller.signal.aborted) { setDates(values); setActiveDate(values[0]); } }).catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)) }); return () => controller.abort() }, [])
  const slots = drafts[activeDate] ?? {}
  function toggle(hour: number) { setDrafts(current => { const day = { ...current[activeDate] }; if (day[hour]) delete day[hour]; else day[hour] = { quantity: '', price: '' }; return { ...current, [activeDate]: day } }) }
  function change(hour: number, field: keyof Slot, value: string) { setDrafts(current => ({ ...current, [activeDate]: { ...current[activeDate], [hour]: { ...current[activeDate][hour], [field]: value } } })) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')
    const days = Object.entries(drafts).filter(([, hours]) => Object.keys(hours).length).map(([deliveryDate, hours]) => ({ deliveryDate, hours: Object.entries(hours).map(([hour, slot]) => ({ hour: Number(hour), quantityKwh: parseLocalizedDecimal(slot.quantity, 'quantity').numberValue ?? 0, pricePerKwh: parseLocalizedDecimal(slot.price, 'price').numberValue ?? 0 })) }))
    if (!days.length || days.some(day => day.hours.some(slot => slot.quantityKwh <= 0 || slot.pricePerKwh <= 0))) { setError('Selecciona al menos una hora y completa cantidad y precio positivos en todos los días seleccionados.'); return }
    setBusy(true)
    try { await createHourlyPublication({ kind, days }); setDrafts({}); setNotice('Publicaciones horarias registradas.'); onCreated(); setDates(await getPublicationWindow()) } catch (reason) { setError(errorMessage(reason)); getPublicationWindow().then(setDates).catch(() => {}) } finally { setBusy(false) }
  }
  return <form className="marketplace-form hourly-form" onSubmit={submit} aria-busy={busy}>
    <p>Publica solo las horas que necesitas, entre mañana y los próximos siete días. Las cantidades son kWh por franja.</p>
    <label>Día<select value={activeDate} onChange={event => setActiveDate(event.target.value)} disabled={busy || !dates.length}>{dates.map(date => <option key={date} value={date}>{formatDeliveryDate(date)} · {Object.keys(drafts[date] ?? {}).length} horas</option>)}</select></label>
    <details><summary>Copiar este día a otras fechas</summary>{dates.filter(date => date !== activeDate).map(date => <button key={date} className="secondary-button" type="button" disabled={busy || !Object.keys(slots).length} onClick={() => { if (Object.keys(drafts[date] ?? {}).length && !window.confirm('Se reemplazarán las cantidades que preparaste para ese día.')) return; setDrafts(current => ({ ...current, [date]: structuredClone(slots) })) }}>Copiar a {formatDeliveryDate(date)}</button>)}</details>
    <div className="table-wrap"><table className="data-table hourly-editor"><thead><tr><th>Publicar</th><th>Hora</th><th>Cantidad (kWh)</th><th>{kind === 'offer' ? 'Precio' : 'Máximo'} (COP/kWh)</th></tr></thead><tbody>{Array.from({ length: 24 }, (_, hour) => <tr key={hour}><td><input type="checkbox" aria-label={`Publicar ${hourLabel(hour)}`} checked={Boolean(slots[hour])} disabled={busy} onChange={() => toggle(hour)} /></td><td>{hourLabel(hour)}</td><td>{slots[hour] && <LocalizedDecimalInput mode="quantity" value={slots[hour].quantity} onValueChange={value => change(hour, 'quantity', value.displayValue)} disabled={busy} aria-label={`Cantidad ${hourLabel(hour)}`} />}</td><td>{slots[hour] && <LocalizedDecimalInput mode="price" value={slots[hour].price} onValueChange={value => change(hour, 'price', value.displayValue)} disabled={busy} aria-label={`Precio ${hourLabel(hour)}`} />}</td></tr>)}</tbody></table></div>
    <p>{Object.values(drafts).reduce((total, day) => total + Object.keys(day).length, 0)} horas preparadas. Se publican todos los días preparados juntos.</p>
    {error && <p role="alert" className="marketplace-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button className="primary-button" disabled={busy || !dates.length}>{busy ? 'Publicando…' : kind === 'offer' ? 'Publicar ofertas horarias' : 'Publicar demandas horarias'}</button>
  </form>
}

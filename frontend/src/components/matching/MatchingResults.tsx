import { StatusBadge } from '../ui/StatusBadge'
import type { MatchingDemandSummary, MatchingResult, MatchingSuggestion } from '../../types/matching'
import { formatDeliveryDate, formatEnergyKWh, formatPriceCOPPerKWh } from '../../utils/numberFormat'
import { shortReference } from '../../utils/reference'

export type MatchingPresentationState = { kind: 'idle' } | { kind: 'loading'; message: string } | { kind: 'error'; message: string } | { kind: 'success'; result: MatchingResult }

const labels = { FULL: 'Coincidencia completa', PARTIAL: 'Coincidencia parcial', NO_MATCH: 'Sin coincidencia' }
const tones = { FULL: 'success', PARTIAL: 'warning', NO_MATCH: 'neutral' } as const
const messages: Record<string, string> = {
  NO_ACTIVE_OFFERS: 'No hay ofertas activas con energía disponible.',
  NO_SAME_DELIVERY_DATE: 'No hay ofertas disponibles para la misma fecha de entrega.',
  PRICE_ABOVE_MAX: 'Hay ofertas para la fecha solicitada, pero sus precios superan el máximo de la demanda.',
  INSUFFICIENT_AVAILABLE_QUANTITY: 'No existe suficiente energía disponible que cumpla fecha y precio.',
  FULLY_MATCHED: 'La demanda quedó cubierta con las ofertas compatibles disponibles.',
  PARTIALLY_MATCHED: 'La demanda recibió una cobertura parcial.',
}

function MatchingOfferAllocation({ allocation }: { allocation: MatchingSuggestion }) {
  const margin = Number(allocation.maxDemandPricePerKwh) - Number(allocation.offerPricePerKwh)
  return <li className="matching-allocation"><strong>Oferta #{shortReference(allocation.offerId)}</strong><span>Cantidad asignada: {formatEnergyKWh(Number(allocation.suggestedQuantityKwh))}</span><span>Precio oferta: {formatPriceCOPPerKWh(Number(allocation.offerPricePerKwh))}</span><span>Máximo demanda: {formatPriceCOPPerKWh(Number(allocation.maxDemandPricePerKwh))}</span><span>Margen frente al máximo: {formatPriceCOPPerKWh(margin)}</span><span>Entrega: {formatDeliveryDate(allocation.deliveryDate)}</span></li>
}

function MatchingDemandCard({ demand, allocations }: { demand: MatchingDemandSummary; allocations: MatchingSuggestion[] }) {
  const reason = demand.reasons.map(value => messages[value]).find(Boolean)
  return <article className="matching-demand-card"><div className="row-between"><strong>Demanda #{shortReference(demand.demandId)}</strong><StatusBadge tone={tones[demand.compatibility]}>{labels[demand.compatibility]}</StatusBadge></div><div className="matching-metrics"><span>Solicitado: {formatEnergyKWh(Number(demand.requestedQuantityKwh))}</span><span>Asignado: {formatEnergyKWh(Number(demand.suggestedQuantityKwh))}</span><span>Pendiente: {formatEnergyKWh(Number(demand.unmatchedQuantityKwh))}</span><span>Cobertura: {demand.coveragePercent.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %</span></div><p>Ofertas utilizadas: {allocations.length}</p>{reason && <p className="matching-reason">Motivo: {reason}</p>}{allocations.length > 0 && <ul className="matching-allocations">{allocations.map(allocation => <MatchingOfferAllocation key={`${allocation.offerId}-${allocation.demandId}`} allocation={allocation} />)}</ul>}</article>
}

export function MatchingResults({ state, stale, onSuggest }: { state: MatchingPresentationState; stale: boolean; onSuggest: () => void }) {
  return <section className="panel marketplace-section" aria-label="Emparejamientos sugeridos"><h2>Emparejamientos sugeridos</h2><p>Las sugerencias usan saldo operativo disponible, fecha exacta y precio compatible.</p><button type="button" className="secondary-button" onClick={onSuggest} disabled={state.kind === 'loading'}>{state.kind === 'loading' ? state.message : stale ? 'Actualizar sugerencias' : 'Sugerir emparejamientos'}</button>{stale && <p className="marketplace-incompatibility" role="status">El mercado cambió desde el último emparejamiento.</p>}{state.kind === 'idle' && <p className="marketplace-empty">Solicita sugerencias para consultar las publicaciones activas disponibles.</p>}{state.kind === 'error' && <p className="marketplace-error" role="alert">{state.message}</p>}{state.kind === 'success' && <div className="matching-results"><div className="matching-summary"><span>Demandas evaluadas: {state.result.summary.demandsConsidered}</span><span>Ofertas evaluadas: {state.result.summary.offersConsidered}</span><span>Asignaciones: {state.result.summary.suggestedMatches}</span><span>Energía asignada: {formatEnergyKWh(Number(state.result.summary.matchedQuantityKwh))}</span><span>Energía pendiente: {formatEnergyKWh(Number(state.result.summary.unmatchedDemandKwh))}</span></div>{state.result.demands.map(demand => <MatchingDemandCard key={demand.demandId} demand={demand} allocations={state.result.matches.filter(match => match.demandId === demand.demandId)} />)}<p className="matching-trace">Referencia ejecución #{shortReference(state.result.trace.executionId)}</p></div>}</section>
}

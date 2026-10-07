import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { matchingNegotiationSelection } from '../src/utils/matchingNegotiation'
import { HourlyMarket } from '../src/components/HourlyMarket'
import { MatchingResults } from '../src/components/matching/MatchingResults'
import type { EnergyOfferDto, EnergyDemandDto, MarketOffer, MarketDemand } from '../src/types/marketplace'
import type { MatchingSuggestion, MatchingResult } from '../src/types/matching'

const base = { quantityKwh: 20, availableQuantityKwh: 20, confirmedQuantityKwh: 0, reservedQuantityKwh: 0, hour: 3, deliveryDate: '2026-10-07', status: 'ACTIVE' as const, createdAt: '2026-10-06', updatedAt: '2026-10-06' }
const ownOffer: EnergyOfferDto = { ...base, id: 'o', publicationId: 'op', pricePerKwh: 980.12345 }
const ownDemand: EnergyDemandDto = { ...base, id: 'd', publicationId: 'dp', maxPricePerKwh: 990 }
const offer: MarketOffer = { ...ownOffer, availableQuantityKwh: '20', pricePerKwh: '980.12345' }
const demand: MarketDemand = { ...ownDemand, availableQuantityKwh: '20', maxPricePerKwh: '990' }
const match: MatchingSuggestion = { offerId: 'o', demandId: 'd', suggestedQuantityKwh: '10.25', offerPricePerKwh: '980.12345', maxDemandPricePerKwh: '990', deliveryDate: base.deliveryDate, hour: 3 }
test('MATCH-CTA-01: comprador y vendedor abren su pareja y precargan cantidad/precio exactos', () => {
 const buyer = matchingNegotiationSelection(match, [], [ownDemand], [offer], [])!
 expect(buyer).toMatchObject({ kind: 'offer', publicationId: 'op', ownPublicationId: 'dp', term: { externalId: 'o', ownId: 'd', quantity: '10,25', price: '980,12345', hour: 3 } })
 expect(matchingNegotiationSelection(match, [ownOffer], [], [], [demand])).toMatchObject({ kind: 'demand', publicationId: 'dp', ownPublicationId: 'op' })
 const html = renderToStaticMarkup(<HourlyMarket initialSelection={buyer} offers={[offer]} demands={[]} ownOffers={[]} ownDemands={[ownDemand]} onRefresh={() => { throw new Error('No reserva al abrir') }} />)
 expect(html).toContain('Coincidencia preparada')
 expect(html).toContain('value="10,25"')
 expect(html).toContain('checked=""')
})
test('MATCH-CTA-02: terceros, saldo insuficiente, horas distintas e históricos no abren negociación', () => {
 expect(matchingNegotiationSelection(match, [], [], [offer], [demand])).toBeNull()
 expect(matchingNegotiationSelection(match, [], [{ ...ownDemand, availableQuantityKwh: 5 }], [offer], [])).toBeNull()
 expect(matchingNegotiationSelection(match, [], [ownDemand], [{ ...offer, hour: 4 }], [])).toBeNull()
 expect(matchingNegotiationSelection(match, [], [ownDemand], [{ ...offer, publicationId: null }], [])).toBeNull()
})
test('MATCH-CTA-03: botón visible por asignación y deshabilitado con explicación si está desactualizada', () => {
 const result: MatchingResult = { status: 'matched', matches: [match], demands: [{ demandId: 'd', requestedQuantityKwh: '10.25', suggestedQuantityKwh: '10.25', unmatchedQuantityKwh: '0', coveragePercent: 100, compatibility: 'FULL', reasons: ['FULLY_MATCHED'] }], summary: { offersConsidered: 1, demandsConsidered: 1, suggestedMatches: 1, matchedQuantityKwh: '10.25', unmatchedDemandKwh: '0' }, warnings: [], trace: { executionId: 'x', persistence: 'persisted' } }
 const html = renderToStaticMarkup(<MatchingResults state={{ kind: 'success', result }} stale={true} onSuggest={() => {}} negotiationAction={() => ({ onSelect: () => { throw new Error('No ejecuta al renderizar') }, unavailableReason: 'Actualiza las sugerencias antes de negociar.' })} />)
 expect(html).toContain('Ir a negociar')
 expect(html).toContain('disabled=""')
 expect(html).toContain('Actualiza las sugerencias antes de negociar.')
 const unrelated = renderToStaticMarkup(<MatchingResults state={{ kind: 'success', result }} stale={false} onSuggest={() => {}} negotiationAction={() => undefined} />)
 expect(unrelated).not.toContain('Ir a negociar')
})

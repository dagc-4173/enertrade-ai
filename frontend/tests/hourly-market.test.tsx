import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HourlyMarket } from '../src/components/HourlyMarket'
import { HourlyPublicationForm } from '../src/components/forms/HourlyPublicationForm'
import { hourLabel } from '../src/utils/hourlyMarket'
import { parseMatching } from '../src/services/matchingService'
import { formatLocalizedDecimal, parseLocalizedDecimal } from '../src/utils/localizedDecimal'
test('HOUR-UI-01: formulario ofrece tabla con 24 horas sin publicar automáticamente', () => {
 const html = renderToStaticMarkup(<HourlyPublicationForm kind="offer" onCreated={() => { throw new Error('No debe publicar al renderizar') }} />)
 expect((html.match(/type="checkbox"/g) ?? []).length).toBe(24)
 expect(html).toContain('Publicar ofertas horarias')
 expect(html).toContain('Copiar este día')
 expect(hourLabel(23)).toBe('23:00–00:00 (+1 día)')
 expect(hourLabel(null)).toContain('sin hora')
})
test('HOUR-UI-02: mercado ofrece selección de publicación propia y tabla de horas', () => {
 const html = renderToStaticMarkup(<HourlyMarket offers={[]} demands={[]} ownOffers={[]} ownDemands={[]} onRefresh={() => {}} />)
 expect(html).toContain('Mi demanda')
 expect(html).toContain('Proponer horas seleccionadas')
 expect(html).toContain('Cantidad propuesta')
 expect(html).toContain('selección no reserva energía')
})
test('HOUR-UI-03: precarga de términos conserva decimales es-CO', () => {
 expect(parseLocalizedDecimal(formatLocalizedDecimal(10.25, 'quantity'), 'quantity').numberValue).toBe(10.25)
 expect(parseLocalizedDecimal(formatLocalizedDecimal(950.12345, 'price'), 'price').numberValue).toBe(950.12345)
})
test('HOUR-UI-04: diagnóstico de hora incompatible es un contrato válido', () => {
 expect(parseMatching({ status: 'no_matches', matches: [], demands: [{ demandId: 'd', requestedQuantityKwh: '10', suggestedQuantityKwh: '0', unmatchedQuantityKwh: '10', coveragePercent: 0, compatibility: 'NO_MATCH', reasons: ['NO_SAME_DELIVERY_HOUR'] }], summary: { offersConsidered: 1, demandsConsidered: 1, suggestedMatches: 0, matchedQuantityKwh: '0', unmatchedDemandKwh: '10' }, warnings: [], trace: { executionId: 'x', persistence: 'persisted' } }).demands[0].reasons).toEqual(['NO_SAME_DELIVERY_HOUR'])
})

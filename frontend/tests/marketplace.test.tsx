import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { CompatibilityAction, Marketplace, PublicationActions, PublicationQuantity, PublicationStatus } from '../src/pages/Marketplace'
import { canAccept, canCancel, canCounter, canEdit, canReject } from '../src/utils/transactionActions'
import { availablePublicationQuantity, errorMessage, selectProposal } from '../src/utils/marketplaceActions'
import { ApiError } from '../src/services/apiClient'
import { createDemand, createOffer, getMyDemands, getMyOffers, updateDemand } from '../src/services/marketplaceService'
import { acceptTransaction, cancelTransaction, counterTransaction, createTransaction, listMyTransactions, listTransactionRevisions, rejectTransaction, updateTransaction } from '../src/services/transactionService'
import { formatCopPerKwh, formatEnergy } from '../src/utils/numberFormat'
import { formatLocalizedDecimal, parseLocalizedDecimal } from '../src/utils/localizedDecimal'
import { filteredPublications, marketFingerprint, publicationEmptyLabel } from '../src/utils/marketplaceSync'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const date = '2026-09-18'
const offer = { id: 'offer-1', quantityKwh: 9851831.89, confirmedQuantityKwh: 0, reservedQuantityKwh: 0, availableQuantityKwh: 9851831.89, pricePerKwh: 412.5, deliveryDate: date, status: 'ACTIVE', createdAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z' }
const demand = { id: 'demand-1', quantityKwh: 252444558.83, confirmedQuantityKwh: 0, reservedQuantityKwh: 0, availableQuantityKwh: 252444558.83, maxPricePerKwh: 960.71104, deliveryDate: date, status: 'ACTIVE', createdAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z' }
const transaction = { id: 'transaction-1', offerId: 'external-offer', demandId: 'own-demand', quantityKwh: '21000', pricePerKwh: '950', totalAmountCop: '19950000', deliveryDate: '2026-09-25', status: 'PENDING_ACCEPTANCE', role: 'BUYER', proposalOwnership: 'RECEIVED' as const, sellerAcceptedAt: null, buyerAcceptedAt: null, createdAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z', confirmedAt: null, cancelledAt: null, matchingExecutionId: null, latestRevisionSequence: null, latestRevisionProposedByRole: null }
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function respond(body: unknown, status = 200) {
  return spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

test('carga ofertas y demandas reales con cookies y conserva listados vacíos', async () => {
  const fetch = respond({ offers: [], demands: [] })
  expect(await getMyOffers()).toEqual([])
  expect(await getMyDemands()).toEqual([])
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/offers/mine')
  expect(fetch.mock.calls[1]?.[0]).toBe('http://enertrade.test/demands/mine')
  expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('include')
})

test('servicios preservan DTOs numéricos de oferta y demanda', async () => {
  respond({ offer }, 201); expect(await createOffer({ quantityKwh: offer.quantityKwh, pricePerKwh: offer.pricePerKwh, deliveryDate: date })).toEqual(offer)
  respond({ demand }, 201); expect(await createDemand({ quantityKwh: demand.quantityKwh, maxPricePerKwh: demand.maxPricePerKwh, deliveryDate: date })).toEqual(demand)
})

test('formularios envían números y nunca userId', async () => {
  const fetch = spyOn(globalThis, 'fetch')
    .mockImplementationOnce(async () => new Response(JSON.stringify({ offer }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    .mockImplementationOnce(async () => new Response(JSON.stringify({ demand }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
  await createOffer({ quantityKwh: 9851831.89, pricePerKwh: 412.5, deliveryDate: date })
  const offerBody = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
  expect(offerBody).toEqual({ quantityKwh: 9851831.89, pricePerKwh: 412.5, deliveryDate: date })
  expect(offerBody.userId).toBeUndefined()
  await createDemand({ quantityKwh: 252444558.83, maxPricePerKwh: 960.71104, deliveryDate: date })
  const demandBody = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))
  expect(demandBody).toEqual({ quantityKwh: 252444558.83, maxPricePerKwh: 960.71104, deliveryDate: date })
  expect(demandBody.userId).toBeUndefined()
})

test('formatos numéricos es-CO cumplen precisión de energía y precio', () => {
  expect(formatEnergy(9851831.89)).toBe('9.851.831,89 kWh')
  expect(formatCopPerKwh(960.71104)).toBe('960,71104 COP/kWh')
})

test('decimales localizados separan display es-CO y payload canónico', () => {
  expect(parseLocalizedDecimal('50.325', 'quantity')).toMatchObject({ canonicalValue: '50325', numberValue: 50325 })
  expect(parseLocalizedDecimal('50.325,75', 'quantity')).toMatchObject({ canonicalValue: '50325.75', numberValue: 50325.75 })
  expect(parseLocalizedDecimal('50.325,123', 'quantity').numberValue).toBeNull()
  expect(parseLocalizedDecimal('1.125,12345', 'price')).toMatchObject({ canonicalValue: '1125.12345', numberValue: 1125.12345 })
  expect(parseLocalizedDecimal('1.125,123456', 'price').numberValue).toBeNull()
  expect(formatLocalizedDecimal('50325.75', 'quantity')).toBe('50.325,75')
  expect(formatLocalizedDecimal(1125.12345, 'price')).toBe('1.125,12345')
})

test('filtros de publicaciones conservan estado, conteos y orden reciente', () => {
  const publications = [
    { ...offer, id: 'active-old', updatedAt: '2026-09-17T00:00:00.000Z' },
    { ...offer, id: 'active-new', updatedAt: '2026-09-18T00:00:00.000Z' },
    { ...offer, id: 'fulfilled-1', status: 'FULFILLED' as const },
    { ...offer, id: 'fulfilled-2', status: 'FULFILLED' as const },
    { ...offer, id: 'fulfilled-3', status: 'FULFILLED' as const },
    { ...offer, id: 'expired', status: 'EXPIRED' as const },
    { ...offer, id: 'cancelled', status: 'CANCELLED' as const },
  ]
  expect(filteredPublications(publications, 'ACTIVE').map(value => value.id)).toEqual(['active-new', 'active-old'])
  expect(filteredPublications(publications, 'FULFILLED')).toHaveLength(3)
  expect(filteredPublications(publications, 'EXPIRED')).toHaveLength(1)
  expect(filteredPublications(publications, 'CANCELLED')).toHaveLength(1)
  expect(filteredPublications(publications, 'ALL')).toHaveLength(7)
  expect(publicationEmptyLabel('ofertas', 'ACTIVE')).toBe('No tienes ofertas activas.')
})

test('fingerprint detecta cambios de dominio del mercado sin ejecutar matching', () => {
  const marketOffers = [{ id: 'market-offer', availableQuantityKwh: '100', pricePerKwh: '450', deliveryDate: date, status: 'ACTIVE' as const }]
  const marketDemands = [{ id: 'market-demand', availableQuantityKwh: '100', maxPricePerKwh: '500', deliveryDate: date, status: 'ACTIVE' as const }]
  expect(marketFingerprint(marketOffers, marketDemands)).not.toBe(marketFingerprint([{ ...marketOffers[0], pricePerKwh: '451' }], marketDemands))
})

test('la página no ejecuta POST automáticamente y no muestra resultados mock de matching', () => {
  const fetch = spyOn(globalThis, 'fetch')
  const html = renderToStaticMarkup(<Marketplace />)
  expect(fetch).not.toHaveBeenCalled()
  expect(html).toContain('Mercado energético simulado')
  expect(html).toContain('Cargando tus publicaciones…')
  const source = readFileSync(new URL('../src/pages/Marketplace.tsx', import.meta.url), 'utf8')
  expect(source).toContain('Publicar oferta')
  expect(source).toContain('Publicar demanda')
  expect(source).toContain('setOffers(current => [offer, ...current])')
  expect(source).toContain('setDemands(current => [demand, ...current])')
  expect(source).toContain('publicationEmptyLabel')
  expect(html).toContain('Emparejamientos sugeridos')
  expect(html).toContain('Solicita sugerencias')
  expect(source).toContain('Mercado activo')
  expect(source).toContain('listMarketOffers')
  expect(source).toContain('listMarketDemands')
  expect(source).toContain('Crear negociación')
  expect(source).toContain('Precio propuesto (COP/kWh)')
  expect(source).toContain('useVisiblePolling')
  expect(source).toContain('marketFingerprint')
  expect(source).toContain('matchingStale')
  expect(readFileSync(new URL('../src/components/matching/MatchingResults.tsx', import.meta.url), 'utf8')).toContain('Actualizar sugerencias')
  expect(source).not.toContain('suggestMatches(controller.signal)')
  expect(source).not.toMatch(/Pagar|Checkout|Tarjeta|Pago exitoso|Liquidado/)
})

test('las acciones de publicaciones usan botones iguales y permanecen visibles al desplazar la tabla', () => {
  const page = readFileSync(new URL('../src/pages/Marketplace.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/pages/Marketplace.css', import.meta.url), 'utf8')
  expect(page).toContain('publication-action-button')
  expect(page).toContain('>Cancelar</button>')
  expect(page).not.toContain('Cancelar publicación')
  expect(css).toContain('.publication-actions-cell')
  expect(css).toContain('position: sticky')
  expect(css).toContain('.publication-actions')
  expect(css).toContain('flex-direction: column')
  expect(css).toContain('.publication-action-button')
  expect(css).toContain('min-height: 42px')
})

test('el contrato frontend conserva publicaciones vencidas para el historial', async () => {
  const expired = { ...offer, status: 'EXPIRED' as const }
  respond({ offers: [expired] })
  await expect(getMyOffers()).resolves.toEqual([expired])
})

test('GET /mine normaliza saldos decimales en cadena y rechaza DTO incompleto', async () => {
  const stringOffer = { ...offer, quantityKwh: '100000', confirmedQuantityKwh: '50000', reservedQuantityKwh: '0', availableQuantityKwh: '50000', pricePerKwh: '450' }
  respond({ offers: [stringOffer] })
  await expect(getMyOffers()).resolves.toEqual([{ ...offer, quantityKwh: 100000, confirmedQuantityKwh: 50000, reservedQuantityKwh: 0, availableQuantityKwh: 50000, pricePerKwh: 450 }])
  const stringDemand = { ...demand, quantityKwh: '100000', confirmedQuantityKwh: '50000', reservedQuantityKwh: '0', availableQuantityKwh: '50000', maxPricePerKwh: '500' }
  respond({ demands: [stringDemand] })
  await expect(getMyDemands()).resolves.toEqual([{ ...demand, quantityKwh: 100000, confirmedQuantityKwh: 50000, reservedQuantityKwh: 0, availableQuantityKwh: 50000, maxPricePerKwh: 500 }])
  respond({ offers: [{ ...stringOffer, availableQuantityKwh: undefined }] })
  await expect(getMyOffers()).rejects.toMatchObject({ kind: 'response', status: 200 })
})

test('mis ofertas y demandas muestran saldo derivado con formato es-CO', () => {
  const partialOffer = renderToStaticMarkup(<PublicationQuantity type="offer" publication={{ ...offer, quantityKwh: 100_000, confirmedQuantityKwh: 50_000, availableQuantityKwh: 50_000 }} />)
  expect(partialOffer).toContain('50.000,00 kWh disponibles')
  expect(partialOffer).toContain('Publicada: 100.000,00 kWh')
  expect(partialOffer).toContain('Confirmada: 50.000,00 kWh')
  const reservedDemand = renderToStaticMarkup(<PublicationQuantity type="demand" publication={{ ...demand, quantityKwh: 100_000, confirmedQuantityKwh: 30_000, reservedQuantityKwh: 20_000, availableQuantityKwh: 50_000 }} />)
  expect(reservedDemand).toContain('50.000,00 kWh pendientes')
  expect(reservedDemand).toContain('Solicitada: 100.000,00 kWh')
  expect(reservedDemand).toContain('Reservada: 20.000,00 kWh')
  const reservedOffer = renderToStaticMarkup(<PublicationQuantity type="offer" publication={{ ...offer, quantityKwh: 100_000, confirmedQuantityKwh: 50_000, reservedQuantityKwh: 50_000, availableQuantityKwh: 0 }} />)
  expect(reservedOffer).toContain('0,00 kWh disponibles')
  expect(reservedOffer).toContain('Reservada: 50.000,00 kWh')
})

test('demanda completamente cubierta muestra Completada, saldo cero y no acciones', () => {
  const fulfilled = { ...demand, quantityKwh: 50_000, confirmedQuantityKwh: 50_000, availableQuantityKwh: 0, status: 'FULFILLED' as const }
  expect(renderToStaticMarkup(<PublicationStatus status={fulfilled.status} />)).toContain('Completada')
  expect(renderToStaticMarkup(<PublicationQuantity type="demand" publication={fulfilled} />)).toContain('0,00 kWh pendientes')
  expect(renderToStaticMarkup(<PublicationActions type="demand" publication={fulfilled} onChanged={() => {}} />)).toBe('')
})

test('los errores 401 del backend se conservan como ApiError seguro', async () => {
  respond({ error: 'UNAUTHENTICATED', message: 'Debes iniciar sesión.' }, 401)
  await expect(getMyOffers()).rejects.toMatchObject({ kind: 'http', status: 401, serverMessage: 'Debes iniciar sesión.' })
})

test('rechaza DTOs inesperados del backend', async () => {
  respond({ offers: [{ ...offer, userId: 'secret' }] })
  await expect(getMyOffers()).rejects.toBeInstanceOf(ApiError)
})

test('demanda ACTIVE se actualiza por PATCH con el contrato esperado', async () => {
  const updated = { ...demand, id: 'own-demand', quantityKwh: 21_000, maxPricePerKwh: 1_000, deliveryDate: '2026-09-25' }
  const fetch = respond({ demand: updated })
  expect(await updateDemand('own-demand', { quantityKwh: 21_000, maxPricePerKwh: 1_000, deliveryDate: '2026-09-25' })).toEqual(updated)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/demands/own-demand')
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH', credentials: 'include' })
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ quantityKwh: 21_000, maxPricePerKwh: 1_000, deliveryDate: '2026-09-25' })
})

test('compatibilidad 900 frente a 950 deja el CTA de negociación habilitado y sin POST', () => {
  const fetch = spyOn(globalThis, 'fetch')
  const html = renderToStaticMarkup(<CompatibilityAction ownDemand={{ ...demand, id: 'own-demand', quantityKwh: 21_000, maxPricePerKwh: 900, deliveryDate: '2026-09-25' }} externalOffer={{ id: 'external-offer', availableQuantityKwh: '21000', pricePerKwh: '950', deliveryDate: '2026-09-25', status: 'ACTIVE' }} onSelect={() => { throw new Error('No debe seleccionarse una combinación incompatible.') }} />)
  expect(html).toContain('precio no compatible')
  expect(html).toContain('El precio no cumple el criterio de matching automático, pero puedes iniciar una negociación.')
  expect(html).not.toMatch(/disabled=""[^>]*>Negociar con mi demanda/)
  expect(html).toContain('Negociar con mi demanda')
  expect(fetch).not.toHaveBeenCalled()
})

test('fecha distinta deshabilita la negociación aunque exista saldo y precio compatible', () => {
  const html = renderToStaticMarkup(<CompatibilityAction ownDemand={{ ...demand, id: 'own-demand', quantityKwh: 21_000, maxPricePerKwh: 1_000, deliveryDate: '2026-09-25' }} externalOffer={{ id: 'external-offer', availableQuantityKwh: '21000', pricePerKwh: '950', deliveryDate: '2026-09-26', status: 'ACTIVE' }} onSelect={() => { throw new Error('No debe negociar con fechas distintas.') }} />)
  expect(html).toContain('La negociación no está disponible porque las fechas de entrega no coinciden.')
  expect(html).toMatch(/disabled=""[^>]*>Negociar con mi demanda/)
})

test('compatibilidad de precio y fecha habilita cantidades parciales negociables', async () => {
  const html = renderToStaticMarkup(<CompatibilityAction ownDemand={{ ...demand, id: 'own-demand', quantityKwh: 21_000, maxPricePerKwh: 1_000, deliveryDate: '2026-09-25' }} externalOffer={{ id: 'external-offer', availableQuantityKwh: '21000', pricePerKwh: '950', deliveryDate: '2026-09-25', status: 'ACTIVE' }} onSelect={() => {}} />)
  expect(html).toContain('Cantidad negociable hasta 21.000,00 kWh.')
  expect(html).toContain('precio compatible')
  expect(html).not.toMatch(/disabled=""[^>]*>Negociar con mi demanda/)
  const fetch = respond({ transaction }, 201)
  expect(await createTransaction({ offerId: 'external-offer', demandId: 'own-demand', quantityKwh: 21_000, pricePerKwh: 435 })).toMatchObject({ status: 'PENDING_ACCEPTANCE', offerId: 'external-offer', demandId: 'own-demand' })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/transactions')
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ offerId: 'external-offer', demandId: 'own-demand', quantityKwh: 21_000, pricePerKwh: 435 })
})

test('una demanda mayor que la oferta disponible sigue siendo parcialmente negociable', () => {
  const html = renderToStaticMarkup(<CompatibilityAction ownDemand={{ ...demand, id: 'own-demand', quantityKwh: 30_000, maxPricePerKwh: 1_000, deliveryDate: '2026-09-25' }} externalOffer={{ id: 'external-offer', availableQuantityKwh: '8000', pricePerKwh: '950', deliveryDate: '2026-09-25', status: 'ACTIVE' }} onSelect={() => {}} />)
  expect(html).toContain('Cantidad negociable hasta 8.000,00 kWh.')
  expect(html).not.toMatch(/disabled=""[^>]*>Proponer con mi demanda/)
  expect(html).not.toContain('cantidad no compatible')
})

test('el saldo propio descuenta reservas pendientes y confirmadas antes de calcular el máximo', () => {
  const transactions = [
    { ...transaction, offerId: 'own-offer', quantityKwh: '10000', status: 'CONFIRMED' as const },
    { ...transaction, offerId: 'own-offer', quantityKwh: '5000', status: 'PENDING_ACCEPTANCE' as const },
    { ...transaction, offerId: 'own-offer', quantityKwh: '4000', status: 'CANCELLED' as const },
  ]
  expect(availablePublicationQuantity('own-offer', 30_000, transactions, 'offerId')).toBe(15_000)
})

test('seleccionar propuesta con mi demanda no hace POST y conserva IDs y máximo correctos', () => {
  const fetch = spyOn(globalThis, 'fetch')
  const selection = selectProposal({ id: 'external-offer', availableQuantityKwh: '15000', pricePerKwh: '950', deliveryDate: '2026-09-25', status: 'ACTIVE' }, { ...demand, id: 'own-demand', quantityKwh: 21_000, maxPricePerKwh: 1_000, deliveryDate: '2026-09-25' })
  expect(selection).toMatchObject({ max: 15_000, offer: { id: 'external-offer' }, demand: { id: 'own-demand' } })
  expect(fetch).not.toHaveBeenCalled()
})

test('GET /transactions/mine incluye pendiente bajo Todas y Pendientes', async () => {
  let fetch = respond({ transactions: [transaction] })
  expect(await listMyTransactions()).toEqual([transaction])
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/transactions/mine')
  fetch.mockRestore()
  fetch = respond({ transactions: [transaction] })
  expect(await listMyTransactions('PENDING_ACCEPTANCE')).toEqual([transaction])
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/transactions/mine?status=PENDING_ACCEPTANCE')
})

test('contrato transaccional exige ownership permitido y no expone autor', async () => {
  respond({ transactions: [{ ...transaction, proposalOwnership: 'UNKNOWN' }] })
  await expect(listMyTransactions()).rejects.toBeInstanceOf(ApiError)
  respond({ transactions: [{ ...transaction, proposedByUserId: 'secret' }] })
  await expect(listMyTransactions()).rejects.toBeInstanceOf(ApiError)
})

test('PATCH /transactions sólo envía quantityKwh y acepta respuesta 200', async () => {
  const updated = { ...transaction, proposalOwnership: 'CREATED_BY_ME' as const, quantityKwh: '12000', totalAmountCop: '10800000' }
  const fetch = respond({ transaction: updated })
  expect(await updateTransaction('transaction-1', { quantityKwh: 12_000 })).toEqual(updated)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/transactions/transaction-1')
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH', credentials: 'include' })
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ quantityKwh: 12_000 })
})

test('PATCH rechazado conserva el mensaje del backend para el formulario', async () => {
  respond({ error: 'TRANSACTION_NOT_PENDING', message: 'La transacción ya no admite edición.' }, 409)
  await expect(updateTransaction('transaction-1', { quantityKwh: 12_000 })).rejects.toMatchObject({ code: 'TRANSACTION_NOT_PENDING', serverMessage: 'La transacción ya no admite edición.' })
})

test('respuestas válidas de editar, aceptar, rechazar y cancelar conservan el DTO participante', async () => {
  let fetch = respond({ transaction: { ...transaction, proposalOwnership: 'CREATED_BY_ME' } })
  expect(await updateTransaction('transaction-1', { quantityKwh: 12_000 })).toMatchObject({ role: 'BUYER', proposalOwnership: 'CREATED_BY_ME' })
  fetch.mockRestore()
  fetch = respond({ transaction })
  expect(await acceptTransaction('transaction-1')).toMatchObject({ role: 'BUYER', proposalOwnership: 'RECEIVED' })
  fetch.mockRestore()
  fetch = respond({ transaction })
  expect(await rejectTransaction('transaction-1')).toMatchObject({ role: 'BUYER', proposalOwnership: 'RECEIVED' })
  fetch.mockRestore()
  respond({ transaction: { ...transaction, proposalOwnership: 'CREATED_BY_ME' } })
  expect(await cancelTransaction('transaction-1')).toMatchObject({ role: 'BUYER', proposalOwnership: 'CREATED_BY_ME' })
})

test('counter e historial usan contratos C21b sin identidades privadas', async () => {
  const negotiated = { ...transaction, latestRevisionSequence: 2, latestRevisionProposedByRole: 'SELLER' as const }
  let fetch = respond({ transaction: negotiated })
  expect(await counterTransaction('transaction-1', { quantityKwh: 20_000, pricePerKwh: 435 })).toMatchObject({ latestRevisionSequence: 2, latestRevisionProposedByRole: 'SELLER' })
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/transactions/transaction-1/counter')
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ quantityKwh: 20_000, pricePerKwh: 435 })
  fetch.mockRestore()
  fetch = respond({ revisions: [{ sequence: 1, quantityKwh: '21000', pricePerKwh: '420', totalAmountCop: '8820000', proposedByRole: 'BUYER', createdAt: '2026-09-17T00:00:00.000Z' }, { sequence: 2, quantityKwh: '20000', pricePerKwh: '435', totalAmountCop: '8700000', proposedByRole: 'SELLER', createdAt: '2026-09-17T01:00:00.000Z' }] })
  expect(await listTransactionRevisions('transaction-1')).toMatchObject([{ sequence: 1, proposedByRole: 'BUYER' }, { sequence: 2, proposedByRole: 'SELLER' }])
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/transactions/transaction-1/revisions')
})

test('permisos separan creador, receptor, aceptación previa y legado', () => {
  const created = { ...transaction, role: 'SELLER' as const, proposalOwnership: 'CREATED_BY_ME' as const }
  expect(canEdit(created)).toBe(true)
  expect(canCancel(created)).toBe(true)
  expect(canAccept(created)).toBe(true)
  expect(canReject(created)).toBe(false)
  const received = { ...transaction, proposalOwnership: 'RECEIVED' as const }
  expect(canEdit(received)).toBe(false)
  expect(canCancel(received)).toBe(false)
  expect(canAccept(received)).toBe(true)
  expect(canReject(received)).toBe(true)
  const accepted = { ...created, sellerAcceptedAt: '2026-09-18T00:00:00.000Z' }
  expect(canEdit(accepted)).toBe(true)
  expect(canCancel(accepted)).toBe(true)
  const confirmed = { ...created, status: 'CONFIRMED' as const, sellerAcceptedAt: '2026-09-18T00:00:00.000Z', buyerAcceptedAt: '2026-09-18T00:00:00.000Z' }
  expect(canEdit(confirmed)).toBe(false)
  expect(canCancel(confirmed)).toBe(false)
  expect(canAccept(confirmed)).toBe(false)
  expect(canReject(confirmed)).toBe(false)
  const legacy = { ...transaction, proposalOwnership: 'LEGACY_UNKNOWN' as const }
  expect(canEdit(legacy)).toBe(false)
  expect(canCancel(legacy)).toBe(false)
  expect(canReject(legacy)).toBe(false)
  const receivedRevision = { ...transaction, latestRevisionSequence: 3, latestRevisionProposedByRole: 'SELLER' as const }
  expect(canAccept(receivedRevision)).toBe(true)
  expect(canCounter(receivedRevision)).toBe(true)
  expect(canReject(receivedRevision)).toBe(true)
  expect(canEdit(receivedRevision)).toBe(false)
  const authoredRevision = { ...receivedRevision, latestRevisionProposedByRole: 'BUYER' as const, buyerAcceptedAt: '2026-09-18T00:00:00.000Z' }
  expect(canCounter(authoredRevision)).toBe(false)
  expect(canReject(authoredRevision)).toBe(false)
  expect(canCancel({ ...authoredRevision, proposalOwnership: 'CREATED_BY_ME' })).toBe(true)
})

test('el éxito muestra los datos de la propuesta y el acceso a Transacciones', () => {
  const source = readFileSync(new URL('../src/pages/Marketplace.tsx', import.meta.url), 'utf8')
  expect(source).toContain('Propuesta seleccionada')
  expect(source).toContain('Estado: Pendiente')
  expect(source).toContain('Ver mis transacciones')
  expect(source).toContain('setSelected(null)')
})

test('la UI C21b precarga el precio propio y presenta término, acciones e historial sin IDs', () => {
  const marketplaceSource = readFileSync(new URL('../src/pages/Marketplace.tsx', import.meta.url), 'utf8')
  const transactionsSource = readFileSync(new URL('../src/pages/Transactions.tsx', import.meta.url), 'utf8')
  expect(marketplaceSource).toContain('select(offer, demand, demand.maxPricePerKwh)')
  expect(marketplaceSource).toContain('}, offer.pricePerKwh)')
  expect(marketplaceSource).toContain('Precio propuesto (COP/kWh)')
  expect(transactionsSource).toContain('Término vigente')
  expect(transactionsSource).toContain('Contraproponer')
  expect(transactionsSource).toContain('Ver historial')
  expect(transactionsSource).toContain('Cancelar negociación')
  expect(transactionsSource).not.toContain('proposedByUserId')
  expect(transactionsSource).not.toContain('sellerUserId')
  expect(transactionsSource).not.toContain('buyerUserId')
})

test('errores reales de edición o propuesta conservan mensaje, código y estado seguro', async () => {
  respond({ error: 'PUBLICATION_TRANSACTION_LOCKED', message: 'La demanda tiene una reserva o transacción confirmada y no puede editarse.' }, 409)
  await expect(updateDemand('own-demand', { quantityKwh: 21_000, maxPricePerKwh: 1_000, deliveryDate: '2026-09-25' })).rejects.toMatchObject({ status: 409, code: 'PUBLICATION_TRANSACTION_LOCKED', serverMessage: 'La demanda tiene una reserva o transacción confirmada y no puede editarse.' })
  expect(errorMessage(new ApiError('http', 'HTTP 409', 409, 'PRICE_NOT_COMPATIBLE', 'El precio de la oferta supera el máximo de la demanda.'))).toBe('El precio de la oferta supera el máximo de la demanda.')
})

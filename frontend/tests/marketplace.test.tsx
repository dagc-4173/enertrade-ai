import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { Marketplace } from '../src/pages/Marketplace'
import { ApiError } from '../src/services/apiClient'
import { createDemand, createOffer, getMyDemands, getMyOffers } from '../src/services/marketplaceService'
import { formatCopPerKwh, formatEnergy } from '../src/utils/numberFormat'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const date = '2026-09-18'
const offer = { id: 'offer-1', quantityKwh: 9851831.89, pricePerKwh: 412.5, deliveryDate: date, status: 'ACTIVE', createdAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z' }
const demand = { id: 'demand-1', quantityKwh: 252444558.83, maxPricePerKwh: 960.71104, deliveryDate: date, status: 'ACTIVE', createdAt: '2026-09-17T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z' }
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
  expect(source).toContain('No tienes ofertas registradas.')
  expect(source).toContain('No tienes demandas registradas.')
  expect(html).toContain('Emparejamientos sugeridos')
  expect(html).toContain('Solicita sugerencias')
  expect(source).not.toMatch(/marketOffers|userEnergyCards|smartMatches/)
})

test('los errores 401 del backend se conservan como ApiError seguro', async () => {
  respond({ error: 'UNAUTHENTICATED', message: 'Debes iniciar sesión.' }, 401)
  await expect(getMyOffers()).rejects.toMatchObject({ kind: 'http', status: 401, serverMessage: 'Debes iniciar sesión.' })
})

test('rechaza DTOs inesperados del backend', async () => {
  respond({ offers: [{ ...offer, userId: 'secret' }] })
  await expect(getMyOffers()).rejects.toBeInstanceOf(ApiError)
})

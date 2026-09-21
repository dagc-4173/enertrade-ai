import { ApiError, apiRequest, postJson } from './apiClient'
import type {
  CreateDemandInput,
  CreateOfferInput,
  EnergyDemandDto,
  EnergyOfferDto,
  MarketDemand,
  MarketOffer,
} from '../types/marketplace'

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const positiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

function base(value: unknown): value is Record<string, unknown> {
  return object(value) && text(value.id) && positiveNumber(value.quantityKwh) && date(value.deliveryDate) &&
    value.status === 'ACTIVE' && text(value.createdAt) && Number.isFinite(Date.parse(value.createdAt)) &&
    text(value.updatedAt) && Number.isFinite(Date.parse(value.updatedAt)) && !('userId' in value)
}

function offer(value: unknown): value is EnergyOfferDto {
  return base(value) && positiveNumber(value.pricePerKwh)
}

function demand(value: unknown): value is EnergyDemandDto {
  return base(value) && positiveNumber(value.maxPricePerKwh)
}

function envelope<T>(response: { status: number; data: unknown }, key: string, check: (value: unknown) => value is T, expectedStatus: number): T {
  if (response.status !== expectedStatus || !object(response.data) || !check(response.data[key])) {
    throw new ApiError('response', 'La API devolvió una publicación energética con formato inesperado.', response.status)
  }
  return response.data[key]
}

function list<T>(response: { status: number; data: unknown }, key: string, check: (value: unknown) => value is T): T[] {
  if (response.status !== 200 || !object(response.data) || !Array.isArray(response.data[key]) || !response.data[key].every(check)) {
    throw new ApiError('response', 'La API devolvió un listado energético con formato inesperado.', response.status)
  }
  return response.data[key]
}

export async function createOffer(input: CreateOfferInput, signal?: AbortSignal) {
  return envelope(
    await postJson<unknown>('/offers', {
      quantityKwh: input.quantityKwh,
      pricePerKwh: input.pricePerKwh,
      deliveryDate: input.deliveryDate,
    }, { credentials: 'include', signal }),
    'offer',
    offer,
    201,
  )
}

export function getMyOffers(signal?: AbortSignal) {
  return apiRequest<unknown>('/offers/mine', { credentials: 'include', signal }).then(response => list(response, 'offers', offer))
}

export async function createDemand(input: CreateDemandInput, signal?: AbortSignal) {
  return envelope(
    await postJson<unknown>('/demands', {
      quantityKwh: input.quantityKwh,
      maxPricePerKwh: input.maxPricePerKwh,
      deliveryDate: input.deliveryDate,
    }, { credentials: 'include', signal }),
    'demand',
    demand,
    201,
  )
}

export function getMyDemands(signal?: AbortSignal) {
  return apiRequest<unknown>('/demands/mine', { credentials: 'include', signal }).then(response => list(response, 'demands', demand))
}

function publicMarketBase(value: unknown): value is Record<string, unknown> {
  return object(value) && text(value.id) && text(value.availableQuantityKwh) && positiveNumber(Number(value.availableQuantityKwh)) && date(value.deliveryDate) && value.status === 'ACTIVE' && !('userId' in value) && !('email' in value)
}

const marketOffer = (value: unknown): value is MarketOffer => publicMarketBase(value) && text(value.pricePerKwh) && positiveNumber(Number(value.pricePerKwh))
const marketDemand = (value: unknown): value is MarketDemand => publicMarketBase(value) && text(value.maxPricePerKwh) && positiveNumber(Number(value.maxPricePerKwh))

export function listMarketOffers(signal?: AbortSignal) {
  return apiRequest<unknown>('/market/offers', { credentials: 'include', signal }).then(response => list(response, 'offers', marketOffer))
}

export function listMarketDemands(signal?: AbortSignal) {
  return apiRequest<unknown>('/market/demands', { credentials: 'include', signal }).then(response => list(response, 'demands', marketDemand))
}

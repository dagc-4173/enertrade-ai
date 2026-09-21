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
function decimal(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
const positiveNumber = (value: unknown): value is number => (decimal(value) ?? 0) > 0
const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

type PublicationBase = Pick<EnergyOfferDto, 'id' | 'quantityKwh' | 'confirmedQuantityKwh' | 'reservedQuantityKwh' | 'availableQuantityKwh' | 'deliveryDate' | 'status' | 'createdAt' | 'updatedAt'>

function base(value: unknown): PublicationBase | null {
  if (!object(value) || !text(value.id) || !date(value.deliveryDate) ||
    (value.status !== 'ACTIVE' && value.status !== 'FULFILLED' && value.status !== 'CANCELLED' && value.status !== 'EXPIRED') ||
    !text(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) || !text(value.updatedAt) || !Number.isFinite(Date.parse(value.updatedAt)) || 'userId' in value) return null
  const quantityKwh = decimal(value.quantityKwh)
  const confirmedQuantityKwh = decimal(value.confirmedQuantityKwh)
  const reservedQuantityKwh = decimal(value.reservedQuantityKwh)
  const availableQuantityKwh = decimal(value.availableQuantityKwh)
  if (quantityKwh === null || quantityKwh <= 0 || confirmedQuantityKwh === null || confirmedQuantityKwh < 0 || reservedQuantityKwh === null || reservedQuantityKwh < 0 || availableQuantityKwh === null || availableQuantityKwh < 0) return null
  return { id: value.id, quantityKwh, confirmedQuantityKwh, reservedQuantityKwh, availableQuantityKwh, deliveryDate: value.deliveryDate, status: value.status, createdAt: value.createdAt, updatedAt: value.updatedAt }
}

function offer(value: unknown): EnergyOfferDto | null {
  const parsed = base(value)
  const pricePerKwh = object(value) ? decimal(value.pricePerKwh) : null
  return parsed && pricePerKwh !== null && pricePerKwh > 0 ? { ...parsed, pricePerKwh } : null
}

function demand(value: unknown): EnergyDemandDto | null {
  const parsed = base(value)
  const maxPricePerKwh = object(value) ? decimal(value.maxPricePerKwh) : null
  return parsed && maxPricePerKwh !== null && maxPricePerKwh > 0 ? { ...parsed, maxPricePerKwh } : null
}

function envelope<T>(response: { status: number; data: unknown }, key: string, parse: (value: unknown) => T | null, expectedStatus: number): T {
  const parsed = object(response.data) ? parse(response.data[key]) : null
  if (response.status !== expectedStatus || parsed === null) {
    throw new ApiError('response', 'La API devolvió una publicación energética con formato inesperado.', response.status)
  }
  return parsed
}

function list<T>(response: { status: number; data: unknown }, key: string, parse: (value: unknown) => T | null): T[] {
  if (response.status !== 200 || !object(response.data) || !Array.isArray(response.data[key])) {
    throw new ApiError('response', 'La API devolvió un listado energético con formato inesperado.', response.status)
  }
  const parsed: T[] = []
  for (const value of response.data[key]) {
    const item = parse(value)
    if (item === null) throw new ApiError('response', 'La API devolvió un listado energético con formato inesperado.', response.status)
    parsed.push(item)
  }
  return parsed
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

export async function updateOffer(id: string, input: CreateOfferInput) {
  return envelope(await apiRequest<unknown>(`/offers/${encodeURIComponent(id)}`, { method: 'PATCH', json: input, credentials: 'include' }), 'offer', offer, 200)
}

export async function cancelOffer(id: string) {
  return envelope(await postJson<unknown>(`/offers/${encodeURIComponent(id)}/cancel`, {}, { credentials: 'include' }), 'offer', offer, 200)
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

export async function updateDemand(id: string, input: CreateDemandInput) {
  return envelope(await apiRequest<unknown>(`/demands/${encodeURIComponent(id)}`, { method: 'PATCH', json: input, credentials: 'include' }), 'demand', demand, 200)
}

export async function cancelDemand(id: string) {
  return envelope(await postJson<unknown>(`/demands/${encodeURIComponent(id)}/cancel`, {}, { credentials: 'include' }), 'demand', demand, 200)
}

function publicMarketBase(value: unknown): value is Record<string, unknown> {
  return object(value) && text(value.id) && text(value.availableQuantityKwh) && positiveNumber(Number(value.availableQuantityKwh)) && date(value.deliveryDate) && value.status === 'ACTIVE' && !('userId' in value) && !('email' in value)
}

const positiveDecimalText = (value: unknown): value is string => typeof value === 'string' && (decimal(value) ?? 0) > 0
const marketOffer = (value: unknown): value is MarketOffer => publicMarketBase(value) && positiveDecimalText(value.pricePerKwh)
const marketDemand = (value: unknown): value is MarketDemand => publicMarketBase(value) && positiveDecimalText(value.maxPricePerKwh)
const parseMarketOffer = (value: unknown): MarketOffer | null => marketOffer(value) ? value : null
const parseMarketDemand = (value: unknown): MarketDemand | null => marketDemand(value) ? value : null

export function listMarketOffers(signal?: AbortSignal) {
  return apiRequest<unknown>('/market/offers', { credentials: 'include', signal }).then(response => list(response, 'offers', parseMarketOffer))
}

export function listMarketDemands(signal?: AbortSignal) {
  return apiRequest<unknown>('/market/demands', { credentials: 'include', signal }).then(response => list(response, 'demands', parseMarketDemand))
}

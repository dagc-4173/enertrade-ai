import type { PublicationVerification } from '../services/publicationVerificationService'

export type EnergyMarketStatus = 'ACTIVE' | 'BLOCKED' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED'

export interface EnergyOfferDto {
  id: string
  quantityKwh: number
  confirmedQuantityKwh: number
  reservedQuantityKwh: number
  availableQuantityKwh: number
  pricePerKwh: number
  hour?: number | null
  publicationId?: string | null
  verification?: PublicationVerification | null
  deliveryDate: string
  status: EnergyMarketStatus
  createdAt: string
  updatedAt: string
}

export interface EnergyDemandDto {
  id: string
  quantityKwh: number
  confirmedQuantityKwh: number
  reservedQuantityKwh: number
  availableQuantityKwh: number
  maxPricePerKwh: number
  hour?: number | null
  publicationId?: string | null
  verification?: PublicationVerification | null
  deliveryDate: string
  status: EnergyMarketStatus
  createdAt: string
  updatedAt: string
}

export interface CreateOfferInput {
  quantityKwh: number
  pricePerKwh: number
  hour?: number | null
  publicationId?: string | null
  verification?: PublicationVerification | null
  deliveryDate: string
}

export interface CreateDemandInput {
  quantityKwh: number
  maxPricePerKwh: number
  hour?: number | null
  publicationId?: string | null
  verification?: PublicationVerification | null
  deliveryDate: string
}

export interface MarketOffer {
  id: string
  availableQuantityKwh: string
  pricePerKwh: string
  hour?: number | null
  publicationId?: string | null
  verification?: PublicationVerification | null
  deliveryDate: string
  status: 'ACTIVE'
}

export interface MarketDemand {
  id: string
  availableQuantityKwh: string
  maxPricePerKwh: string
  hour?: number | null
  publicationId?: string | null
  verification?: PublicationVerification | null
  deliveryDate: string
  status: 'ACTIVE'
}

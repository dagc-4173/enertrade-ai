export type EnergyMarketStatus = 'ACTIVE'

export interface EnergyOfferDto {
  id: string
  quantityKwh: number
  pricePerKwh: number
  deliveryDate: string
  status: EnergyMarketStatus
  createdAt: string
  updatedAt: string
}

export interface EnergyDemandDto {
  id: string
  quantityKwh: number
  maxPricePerKwh: number
  deliveryDate: string
  status: EnergyMarketStatus
  createdAt: string
  updatedAt: string
}

export interface CreateOfferInput {
  quantityKwh: number
  pricePerKwh: number
  deliveryDate: string
}

export interface CreateDemandInput {
  quantityKwh: number
  maxPricePerKwh: number
  deliveryDate: string
}

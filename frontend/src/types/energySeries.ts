export type EnergySeriesMetric = 'gene' | 'demand' | 'price'
export type EnergySeriesGranularity = 'hourly' | 'daily' | 'monthly'
export type EnergySeriesUnit = 'kWh' | 'COP/kWh'

export interface EnergySeriesRequest {
  metric: EnergySeriesMetric
  from: string
  to: string
  granularity: EnergySeriesGranularity
}

export interface EnergySeriesPoint {
  date: string
  period?: number
  value: number
}

export interface EnergySeriesResponse extends EnergySeriesRequest {
  unit: EnergySeriesUnit
  requestedFrom: string
  requestedTo: string
  returnedFrom: string | null
  returnedTo: string | null
  coverage: { availableFrom: string; availableUntil: string }
  pointCount: number
  sourceDatasetId: number
  consolidatedDatasetId: number
  contentHash: string
  points: EnergySeriesPoint[]
}
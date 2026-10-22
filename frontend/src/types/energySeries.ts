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
  freshness?: { source: 'xm' | 'local'; checkedAt: string | null; message: string }
  unit: EnergySeriesUnit
  requestedFrom: string
  requestedTo: string
  returnedFrom: string | null
  returnedTo: string | null
  coverage: { availableFrom: string | null; availableUntil: string | null }
  completeness?: { partial: boolean; missingDates: string[]; missingObservationCount: number }
  sources?: { consolidatedDatasetId: number; sourceDatasetId: number; contentHash: string }[]
  pointCount: number
  sourceDatasetId: number | null
  consolidatedDatasetId: number | null
  contentHash: string
  points: EnergySeriesPoint[]
}
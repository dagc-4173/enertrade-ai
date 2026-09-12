export interface ExternalDataset {
  id: string
  name: string
  unit: string
  granularity: 'hourly' | 'daily'
  maxInclusiveDays: number
  supportsFilters: boolean
}

export interface ExternalProvider {
  id: string
  name: string
  datasets: ExternalDataset[]
}

export interface ExternalQuery {
  provider: string
  dataset: string
  startDate: string
  endDate: string
}

export interface ExternalRecord {
  date: string
  hour: number | null
  value: number
}

export interface ExternalResult extends ExternalQuery {
  unit: string
  granularity: 'hourly' | 'daily'
  records: ExternalRecord[]
}

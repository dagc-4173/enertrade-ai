export type ForecastSeries = 'Gene' | 'DemaSIN' | 'PrecBolsNaci'

export interface ForecastAvailability {
  series: ForecastSeries
  latestObservationDate: string
  currentDate: string
  nextForecastDate: string
  supportedHorizonDays: 1 | 7
  modelMinTargetDate: string
  modelMaxTargetDate: string
  effectiveFutureMinDate: string | null
  effectiveFutureMaxDate: string | null
  hasFutureForecastWindow: boolean
  dataFreshnessDays: number
}
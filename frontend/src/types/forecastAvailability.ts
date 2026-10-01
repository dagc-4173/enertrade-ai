export type ForecastSeries = 'Gene' | 'DemaSIN' | 'PrecBolsNaci'

export interface ForecastAvailability {
  series: ForecastSeries
  latestObservationDate: string
  latestReceivedDate: string
  latestIndividuallyUsableDate: string
  semanticExcludedDates: string[]
  eligibleFutureTargetDates: string[]
  currentDate: string
  nextForecastDate: string
  supportedHorizonDays: 1 | 6 | 7
  supportedHorizonMinDays?: 1
  supportedHorizonMaxDays?: 6
  modelMinTargetDate: string
  modelMaxTargetDate: string
  effectiveFutureMinDate: string | null
  effectiveFutureMaxDate: string | null
  hasFutureForecastWindow: boolean
  dataFreshnessDays: number
}
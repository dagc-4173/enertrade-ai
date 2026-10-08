export type ForecastSeries = 'Gene' | 'DemaSIN' | 'PrecBolsNaci'
export type AvailabilityReason = 'AVAILABLE' | 'SOURCE_DATA_STALE' | 'INCOMPLETE_SOURCE_DAY' | 'NO_BUILDABLE_ORIGIN' | 'MODEL_HORIZON_LIMIT'

export interface AvailableForecastAvailability {
  series: ForecastSeries
  latestObservationDate: string
  latestReceivedDate: string
  latestIndividuallyUsableDate: string
  semanticExcludedDates: string[]
  eligibleFutureTargetDates: string[]
  currentDate: string
  nextForecastDate: string
  supportedHorizonDays: 1 | 6 | 7
  modelMaxHorizonDays?: 1 | 6 | 7
  productMaxHorizonDays?: 7
  candidateFutureTargetDates?: string[]
  availabilityReason?: AvailabilityReason
  availabilityError?: never
  eligiblePreparedDatasetIds?: number[]
  supportedHorizonMinDays?: 1
  supportedHorizonMaxDays?: 6
  modelMinTargetDate: string
  modelMaxTargetDate: string
  effectiveFutureMinDate: string | null
  effectiveFutureMaxDate: string | null
  hasFutureForecastWindow: boolean
  dataFreshnessDays: number
}

export type ForecastAvailability = AvailableForecastAvailability | (
  Omit<AvailableForecastAvailability, 'latestObservationDate' | 'latestReceivedDate' | 'latestIndividuallyUsableDate' | 'nextForecastDate' | 'modelMinTargetDate' | 'modelMaxTargetDate' | 'dataFreshnessDays' | 'availabilityError'> & {
    latestObservationDate: null
    latestReceivedDate: null
    latestIndividuallyUsableDate: null
    nextForecastDate: null
    modelMinTargetDate: null
    modelMaxTargetDate: null
    dataFreshnessDays: null
    availabilityError: { code: string; message: string }
  }
)
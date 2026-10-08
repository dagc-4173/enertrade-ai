import type { ForecastAvailability } from '../types/forecastAvailability'
import { formatDateCO } from './numberFormat'

export function addCalendarDays(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }

export function lastForecastDate(availability: ForecastAvailability) { return addCalendarDays(availability.latestObservationDate, availability.supportedHorizonDays) }

export function effectiveRange(availability: ForecastAvailability) { return availability.hasFutureForecastWindow && availability.effectiveFutureMinDate && availability.effectiveFutureMaxDate ? { min: availability.effectiveFutureMinDate, max: availability.effectiveFutureMaxDate } : null }

export function selectedHorizonDays(targetDate: string, availability: ForecastAvailability) { if (availability.series === 'PrecBolsNaci') return 1; const origin = addCalendarDays(availability.modelMinTargetDate, -1); return (Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${origin}T00:00:00Z`)) / 86_400_000 }

export function horizonMessage(availability: ForecastAvailability) {
  return availability.series === 'Gene'
    ? `Los modelos experimentales de Oferta admiten hasta ${availability.supportedHorizonDays} días de horizonte. La última observación disponible es ${formatDateCO(availability.latestObservationDate)}. El rango pronosticable actual es ${formatDateCO(availability.nextForecastDate)} a ${formatDateCO(lastForecastDate(availability))}.`
    : availability.series === 'DemaSIN'
    ? `Los modelos experimentales de Demanda admiten hasta 6 días de horizonte. Selecciona un target futuro elegible.`
    : `El modelo admite un horizonte de ${availability.supportedHorizonDays} día. La última observación disponible es ${formatDateCO(availability.latestObservationDate)}. La próxima fecha pronosticable es ${formatDateCO(availability.nextForecastDate)}.`
}

export function exceedsSupportedHorizon(targetDate: string, availability: ForecastAvailability) {
  const range = effectiveRange(availability)
  return !range || targetDate < range.min || targetDate > range.max || !availability.eligibleFutureTargetDates.includes(targetDate)
}
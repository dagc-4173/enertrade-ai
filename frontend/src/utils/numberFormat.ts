const numberFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})

const energyFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const priceFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 5,
})

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('es-CO', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatNumberCO(value: number) {
  return numberFormatter.format(value)
}

export function formatEnergyKWh(value: number) {
  return `${energyFormatter.format(value)} kWh`
}

export function formatPriceCOPPerKWh(value: number) {
  return `${priceFormatter.format(value)} COP/kWh`
}

export function formatCurrencyCOP(value: number) {
  return currencyFormatter.format(value)
}

export function formatPercentCO(value: number) {
  return percentFormatter.format(value / 100)
}

export function formatDateCO(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`))
}

export const formatEnergy = formatEnergyKWh
export const formatCopPerKwh = formatPriceCOPPerKWh
export const formatDeliveryDate = formatDateCO

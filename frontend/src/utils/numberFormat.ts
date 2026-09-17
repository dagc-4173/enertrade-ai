const energyFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const copPerKwhFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 5,
})

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatEnergy(value: number) {
  return `${energyFormatter.format(value)} kWh`
}

export function formatCopPerKwh(value: number) {
  return `$${copPerKwhFormatter.format(value)} COP/kWh`
}

export function formatDeliveryDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`))
}

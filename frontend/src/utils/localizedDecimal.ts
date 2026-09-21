export type DecimalMode = 'quantity' | 'price'

export type LocalizedDecimalValue = {
  displayValue: string
  canonicalValue: string | null
  numberValue: number | null
}

const decimalPlaces: Record<DecimalMode, number> = { quantity: 2, price: 5 }

function validDisplay(value: string, maxDecimals: number) {
  const trimmed = value.trim()
  if (!trimmed) return true
  const parts = trimmed.split(',')
  if (parts.length > 2 || !/^\d{1,3}(?:\.\d{3})*$|^\d+$/.test(parts[0] ?? '')) return false
  return parts.length === 1 || /^\d{0,}$/.test(parts[1] ?? '') && (parts[1] ?? '').length <= maxDecimals
}

export function parseLocalizedDecimal(displayValue: string, mode: DecimalMode): LocalizedDecimalValue {
  const normalized = displayValue.trim()
  const maxDecimals = decimalPlaces[mode]
  if (!validDisplay(normalized, maxDecimals) || !normalized || normalized.endsWith(',')) return { displayValue, canonicalValue: null, numberValue: null }
  const canonicalValue = normalized.replaceAll('.', '').replace(',', '.')
  const numberValue = Number(canonicalValue)
  return Number.isFinite(numberValue) ? { displayValue, canonicalValue, numberValue } : { displayValue, canonicalValue: null, numberValue: null }
}

export function formatLocalizedDecimal(canonicalValue: string | number, mode: DecimalMode) {
  const raw = String(canonicalValue).trim()
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return raw
  const [integer, decimal = ''] = raw.split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const maxDecimals = decimalPlaces[mode]
  return decimal ? `${grouped},${decimal.slice(0, maxDecimals)}` : grouped
}
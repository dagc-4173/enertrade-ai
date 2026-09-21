import type { InputHTMLAttributes } from 'react'
import { formatLocalizedDecimal, parseLocalizedDecimal, type DecimalMode, type LocalizedDecimalValue } from '../../utils/localizedDecimal'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'value' | 'onChange'> & {
  mode: DecimalMode
  value: string
  onValueChange: (value: LocalizedDecimalValue) => void
}

export function LocalizedDecimalInput({ mode, value, onValueChange, onBlur, ...props }: Props) {
  return <input {...props} type="text" inputMode="decimal" value={value} onChange={event => onValueChange(parseLocalizedDecimal(event.target.value, mode))} onBlur={event => {
    const parsed = parseLocalizedDecimal(event.target.value, mode)
    if (parsed.canonicalValue) onValueChange({ ...parsed, displayValue: formatLocalizedDecimal(parsed.canonicalValue, mode) })
    onBlur?.(event)
  }} />
}
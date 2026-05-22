import type { ReactNode } from 'react'
import type { StatusTone } from '../../types/domain'

interface StatusBadgeProps {
  children: ReactNode
  tone?: StatusTone
}

export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>
}

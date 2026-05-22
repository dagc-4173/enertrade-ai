import type { ReactNode } from 'react'

interface SectionHeaderProps {
  eyebrow: string
  title: string
  description?: string
  children?: ReactNode
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  children,
}: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {children ? <div className="section-actions">{children}</div> : null}
    </div>
  )
}

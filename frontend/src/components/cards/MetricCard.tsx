import type { MetricCardData } from '../../types/domain'

interface MetricCardProps {
  metric: MetricCardData
}

export function MetricCard({ metric }: MetricCardProps) {
  const tone = metric.tone ?? 'neutral'

  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div>
        <p>{metric.title}</p>
        <strong>{metric.value}</strong>
      </div>
      {metric.delta ? <span>{metric.delta}</span> : null}
      <small>{metric.helper}</small>
    </article>
  )
}

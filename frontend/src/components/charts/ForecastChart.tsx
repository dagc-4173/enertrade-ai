import type { CSSProperties } from 'react'
import type { ForecastPoint } from '../../types/domain'

interface ForecastChartProps {
  points: ForecastPoint[]
}

function getBarStyle(value: number): CSSProperties {
  return { height: `${Math.max(value, 8)}%` }
}

export function ForecastChart({ points }: ForecastChartProps) {
  const maxPrice = Math.max(...points.map((point) => point.price))

  return (
    <div className="forecast-chart" aria-label="Prediccion de energia y precio">
      <div className="forecast-bars">
        {points.map((point) => (
          <div className="forecast-column" key={point.label}>
            <div className="forecast-track">
              <span
                className="forecast-bar forecast-bar--generation"
                style={getBarStyle(point.generation)}
                title={`Generacion ${point.generation}%`}
              />
              <span
                className="forecast-bar forecast-bar--consumption"
                style={getBarStyle(point.consumption)}
                title={`Consumo ${point.consumption}%`}
              />
            </div>
            <strong>${point.price}</strong>
            <small>{point.label}</small>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span>
          <i className="legend-dot legend-dot--generation" />
          Generacion
        </span>
        <span>
          <i className="legend-dot legend-dot--consumption" />
          Consumo
        </span>
        <span>Precio max: ${maxPrice} COP/kWh</span>
      </div>
    </div>
  )
}

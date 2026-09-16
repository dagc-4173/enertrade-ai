import { ForecastPanel } from '../components/forecasts/ForecastPanel'

export function Predictions() {
  return <div className="page-grid">
    <ForecastPanel kind="supply" />
    <ForecastPanel kind="demand" />
    <ForecastPanel kind="price" />
  </div>
}

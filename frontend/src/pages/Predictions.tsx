import { ForecastPanel } from '../components/forecasts/ForecastPanel'
import { EnergyHistoryExplorer } from '../components/charts/EnergyHistoryExplorer'

export function Predictions() {
  return <div className="page-grid">
    <ForecastPanel kind="supply" />
    <ForecastPanel kind="demand" />
    <ForecastPanel kind="price" />
    <EnergyHistoryExplorer />
  </div>
}

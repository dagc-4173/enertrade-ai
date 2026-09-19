import { useEffect, useState } from 'react'
import { MetricCard } from '../components/cards/MetricCard'
import { DatasetRegistration } from '../components/datasets/DatasetRegistration'
import { ExternalDataSources } from '../components/external-data/ExternalDataSources'
import { DataTable, type DataTableColumn } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { getCapabilityVersions } from '../services/capabilityVersionsService'
import { getIndicators } from '../services/indicatorsService'
import { ApiError } from '../services/apiClient'
import type { CapabilityVersion } from '../types/capabilities'
import type { IndicatorsResponse } from '../types/indicators'
import type { MetricCardData } from '../types/domain'
import { formatNumberCO } from '../utils/numberFormat'

export type DashboardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; indicators: IndicatorsResponse; capabilities: CapabilityVersion[] }

const capabilityLabels: Record<CapabilityVersion['capability'], string> = {
  supply_forecast: 'Pronóstico de oferta',
  demand_forecast: 'Pronóstico de demanda',
  price_estimation: 'Estimación de precio',
  matching: 'Emparejamiento',
  pattern_recognition: 'Reconocimiento de patrones',
}
const capabilityTypes: Record<CapabilityVersion['artifactType'], string> = {
  ml_model: 'Modelo de ML',
  deterministic_rule: 'Regla determinista',
  deterministic_method: 'Método determinista',
}
const capabilityColumns: DataTableColumn<CapabilityVersion>[] = [
  { header: 'Capacidad', render: row => <strong>{capabilityLabels[row.capability]}</strong> },
  { header: 'Tipo', render: row => capabilityTypes[row.artifactType] },
  { header: 'Artefacto', render: row => row.id },
  { header: 'Versión', render: row => row.version },
  { header: 'Estado', render: () => <StatusBadge tone="success">Activa</StatusBadge> },
]

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.serverMessage ?? error.message : 'No fue posible cargar el Dashboard.'
}
function metrics(data: IndicatorsResponse): MetricCardData[] {
  const { indicators } = data
  return [
    { title: 'Pronósticos registrados', value: formatNumberCO(indicators.forecasts.total), helper: `Oferta: ${formatNumberCO(indicators.forecasts.supply)}. Demanda: ${formatNumberCO(indicators.forecasts.demand)}.`, tone: 'info' },
    { title: 'Estimaciones de precio', value: formatNumberCO(indicators.priceEstimates), helper: 'Ejecuciones de precio registradas.', tone: 'info' },
    { title: 'Sugerencias de matching', value: formatNumberCO(indicators.matchingSuggestions), helper: 'Coincidencias generadas por ejecuciones completadas.', tone: 'info' },
    { title: 'Patrones identificados', value: formatNumberCO(indicators.patternsIdentified), helper: 'Patrones en análisis completados o parciales.', tone: 'info' },
    { title: 'Errores registrados', value: formatNumberCO(indicators.errors.total), helper: 'Fallos de capacidades registrados.', tone: indicators.errors.total === 0 ? 'success' : 'warning' },
    { title: 'Tiempo de respuesta promedio', value: indicators.averageResponseTimeMs === null ? 'No disponible' : `${formatNumberCO(indicators.averageResponseTimeMs)} ms`, helper: indicators.averageResponseTimeMs === null ? 'No hay muestra de trazas.' : `Muestra: ${formatNumberCO(data.sample.traceCount)} trazas.`, tone: 'neutral' },
    { title: 'Capacidades activas', value: `${formatNumberCO(indicators.capabilities.active)}/${formatNumberCO(indicators.capabilities.total)}`, helper: `${formatNumberCO(indicators.capabilities.byArtifactType.mlModel)} ML, ${formatNumberCO(indicators.capabilities.byArtifactType.deterministicRule)} regla, ${formatNumberCO(indicators.capabilities.byArtifactType.deterministicMethod)} método.`, tone: 'success' },
  ]
}

export function Dashboard() {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getIndicators(controller.signal), getCapabilityVersions(controller.signal)])
      .then(([indicators, capabilities]) => { if (!controller.signal.aborted) setState({ kind: 'success', indicators, capabilities }) })
      .catch(error => { if (!controller.signal.aborted) setState({ kind: 'error', message: errorMessage(error) }) })
    return () => controller.abort()
  }, [retry])

  return <DashboardContent state={state} onRetry={() => { setState({ kind: 'loading' }); setRetry(value => value + 1) }} />
}

export function DashboardContent({ state, onRetry }: { state: DashboardState; onRetry: () => void }) {
  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Dashboard principal</p>
          <h2>Estado del motor energético</h2>
          <p>
            Indicadores agregados de ejecuciones, capacidades activas y fuentes de datos disponibles.
          </p>
        </div>
        <div className="ai-panel">
          <p>Estado de consulta</p>
          <strong>{state.kind === 'loading' ? 'Cargando indicadores' : state.kind === 'error' ? 'No disponible' : 'Datos verificados'}</strong>
          <div><article><span>El Dashboard no incluye recomendaciones ni series temporales sin un contrato backend que las respalde.</span></article></div>
        </div>
      </section>

      <DatasetRegistration />
      <ExternalDataSources />

      {state.kind === 'loading' && <p role="status">Cargando indicadores y capacidades…</p>}
      {state.kind === 'error' && <section className="panel" role="alert"><p>{state.message}</p><button type="button" className="secondary-button" onClick={onRetry}>Reintentar carga</button></section>}
      {state.kind === 'success' && <>
        <section className="metric-grid">{metrics(state.indicators).map(metric => <MetricCard key={metric.title} metric={metric} />)}</section>
        {state.indicators.warnings.length > 0 && <section className="panel" aria-label="Advertencias de indicadores"><p>No hay registros funcionales suficientes para algunos indicadores.</p></section>}
        <section className="panel">
          <SectionHeader eyebrow="Capacidades" title="Artefactos activos" description="Tipos y versiones reportados por el backend." />
          <DataTable columns={capabilityColumns} rows={state.capabilities} getRowKey={row => row.capability} />
        </section>
      </>}
    </div>
  )
}

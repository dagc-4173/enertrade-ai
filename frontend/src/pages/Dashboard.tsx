import { authStore } from '../auth/authStore'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { MetricCard } from '../components/cards/MetricCard'
import { ArtifactDisclosure } from '../components/capabilities/ArtifactDisclosure'
import { ForecastReadiness } from '../components/ForecastReadiness'
import './Dashboard.css'
import { StatusBadge } from '../components/ui/StatusBadge'
import { getCapabilityVersions } from '../services/capabilityVersionsService'
import { getHealth } from '../services/healthService'
import { getIndicators } from '../services/indicatorsService'
import { ApiError } from '../services/apiClient'
import type { CapabilityVersion } from '../types/capabilities'
import type { HealthResponse } from '../types/health'
import type { IndicatorsResponse } from '../types/indicators'
import type { MetricCardData, StatusTone } from '../types/domain'
import { formatNumberCO, formatPercentCO } from '../utils/numberFormat'

export type HealthState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; health: HealthResponse }

export type IndicatorsState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; indicators: IndicatorsResponse }

export type CapabilitiesState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; capabilities: CapabilityVersion[] }

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.serverMessage ?? error.message : fallback
}

function healthStatusLabel(state: HealthState): string {
  if (state.kind === 'loading') return 'Verificando estado operativo…'
  if (state.kind === 'error') return 'No disponible'
  return state.health.status === 'ok' ? 'Operativo' : 'Degradado'
}
function healthTone(state: HealthState): StatusTone {
  if (state.kind === 'loading') return 'neutral'
  if (state.kind === 'error') return 'danger'
  return state.health.status === 'ok' ? 'success' : 'warning'
}
function apiAvailabilityLabel(state: HealthState): string {
  if (state.kind === 'success') return 'Disponible'
  return state.kind === 'loading' ? 'Verificando…' : 'No disponible'
}
function databaseAvailabilityLabel(state: HealthState): string {
  if (state.kind === 'loading') return 'Verificando…'
  if (state.kind === 'error') return 'No disponible'
  return state.health.dependencies.database === 'ok' ? 'Disponible' : 'No disponible'
}

function metrics(data: IndicatorsResponse): MetricCardData[] {
  const { indicators } = data
  const { executions } = indicators
  const successRateValue = executions.successRate === null ? 'No disponible' : formatPercentCO(executions.successRate)
  const executionsHelper = `${formatNumberCO(executions.succeeded)} exitosas · ${formatNumberCO(executions.empty)} sin resultados · ${formatNumberCO(executions.failed)} fallidas.`
  return [
    { title: 'Pronósticos registrados', value: formatNumberCO(indicators.forecasts.total), helper: `Oferta: ${formatNumberCO(indicators.forecasts.supply)}. Demanda: ${formatNumberCO(indicators.forecasts.demand)}.`, tone: 'info' },
    { title: 'Estimaciones de precio', value: formatNumberCO(indicators.priceEstimates), helper: 'Ejecuciones de precio registradas.', tone: 'info' },
    { title: 'Sugerencias de matching', value: formatNumberCO(indicators.matchingSuggestions), helper: 'Coincidencias generadas por ejecuciones completadas.', tone: 'info' },
    { title: 'Patrones identificados', value: formatNumberCO(indicators.patternsIdentified), helper: 'Patrones en análisis completados o parciales.', tone: 'info' },
    { title: 'Solicitudes registradas', value: formatNumberCO(executions.total), helper: 'Incluye consultas técnicas; no mide precisión predictiva.', tone: 'neutral' },
    { title: 'Ejecuciones completadas correctamente', value: successRateValue, helper: executionsHelper, tone: executions.total === 0 ? 'neutral' : executions.failed === 0 ? 'success' : 'warning' },
    { title: 'Ejecuciones fallidas', value: formatNumberCO(executions.failed), helper: 'Fallos de capacidades registrados.', tone: executions.failed === 0 ? 'success' : 'warning' },
    { title: 'Tiempo de respuesta promedio', value: indicators.averageResponseTimeMs === null ? 'No disponible' : `${formatNumberCO(indicators.averageResponseTimeMs)} ms`, helper: indicators.averageResponseTimeMs === null ? 'No hay muestra de trazas.' : `Muestra: ${formatNumberCO(data.sample.traceCount)} trazas.`, tone: 'neutral' },
    { title: 'Artefactos activos del catálogo', value: `${formatNumberCO(indicators.capabilities.active)}/${formatNumberCO(indicators.capabilities.total)}`, helper: `${formatNumberCO(indicators.capabilities.byArtifactType.mlModel)} ML, ${formatNumberCO(indicators.capabilities.byArtifactType.deterministicRule)} regla, ${formatNumberCO(indicators.capabilities.byArtifactType.deterministicMethod)} método.`, tone: 'success' },
  ]
}

export function Dashboard() {
  const { user } = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot)
  const isAdmin = user?.role === 'ADMIN'
  const [healthState, setHealthState] = useState<HealthState>({ kind: 'loading' })
  const [healthRetry, setHealthRetry] = useState(0)
  const [indicatorsState, setIndicatorsState] = useState<IndicatorsState>({ kind: 'loading' })
  const [indicatorsRetry, setIndicatorsRetry] = useState(0)
  const [capabilitiesState, setCapabilitiesState] = useState<CapabilitiesState>({ kind: 'loading' })
  const [capabilitiesRetry, setCapabilitiesRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal)
      .then(health => { if (!controller.signal.aborted) setHealthState({ kind: 'success', health }) })
      .catch(error => { if (!controller.signal.aborted) setHealthState({ kind: 'error', message: errorMessage(error, 'No fue posible consultar el estado operativo.') }) })
    return () => controller.abort()
  }, [healthRetry])

  useEffect(() => {
    const controller = new AbortController()
    if (!isAdmin) return
    getIndicators(controller.signal)
      .then(indicators => { if (!controller.signal.aborted) setIndicatorsState({ kind: 'success', indicators }) })
      .catch(error => { if (!controller.signal.aborted) setIndicatorsState({ kind: 'error', message: errorMessage(error, 'No fue posible cargar los indicadores.') }) })
    return () => controller.abort()
  }, [indicatorsRetry, isAdmin])

  useEffect(() => {
    const controller = new AbortController()
    if (!isAdmin) return
    getCapabilityVersions(controller.signal)
      .then(capabilities => { if (!controller.signal.aborted) setCapabilitiesState({ kind: 'success', capabilities }) })
      .catch(error => { if (!controller.signal.aborted) setCapabilitiesState({ kind: 'error', message: errorMessage(error, 'No fue posible cargar las capacidades activas.') }) })
    return () => controller.abort()
  }, [capabilitiesRetry, isAdmin])

  return <DashboardContent isAdmin={isAdmin}
    healthState={healthState} indicatorsState={indicatorsState} capabilitiesState={capabilitiesState}
    onRetryHealth={() => { setHealthState({ kind: 'loading' }); setHealthRetry(value => value + 1) }}
    onRetryIndicators={() => { setIndicatorsState({ kind: 'loading' }); setIndicatorsRetry(value => value + 1) }}
    onRetryCapabilities={() => { setCapabilitiesState({ kind: 'loading' }); setCapabilitiesRetry(value => value + 1) }}
  />
}

export function DashboardContent({ isAdmin = true, healthState, indicatorsState, capabilitiesState, onRetryHealth, onRetryIndicators, onRetryCapabilities }: {
  isAdmin?: boolean
  healthState: HealthState
  indicatorsState: IndicatorsState
  capabilitiesState: CapabilitiesState
  onRetryHealth: () => void
  onRetryIndicators: () => void
  onRetryCapabilities: () => void
}) {
  return (
    <div className="page-grid dashboard-workspace">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Dashboard principal</p>
          <h2>Estado del motor energético</h2>
          <p>
            Acumulado de registros disponibles. La finalización de una solicitud no acredita precisión predictiva ni validación académica.
          </p>
        </div>
        <div className="ai-panel">
          <p>Estado del servicio</p>
          <strong>{healthStatusLabel(healthState)}</strong>
          <div>
            <article><span>API</span><StatusBadge tone={healthTone(healthState)}>{apiAvailabilityLabel(healthState)}</StatusBadge></article>
            <article><span>Base de datos</span><StatusBadge tone={healthTone(healthState)}>{databaseAvailabilityLabel(healthState)}</StatusBadge></article>
            {healthState.kind === 'error' && <p role="alert">{healthState.message}</p>}
            {healthState.kind === 'error' && <button type="button" className="secondary-button" onClick={onRetryHealth}>Reintentar estado operativo</button>}
          </div>
        </div>
      </section>

      <ForecastReadiness />

      {isAdmin && <>
      {indicatorsState.kind === 'loading' && <p role="status">Cargando indicadores…</p>}
      {indicatorsState.kind === 'error' && <section className="panel" role="alert"><p>{indicatorsState.message}</p><button type="button" className="secondary-button" onClick={onRetryIndicators}>Reintentar indicadores</button></section>}
      {indicatorsState.kind === 'success' && <>
        <section className="panel"><p>Los nuevos pronósticos horarios se contabilizan desde la incorporación de su trazabilidad. Las ejecuciones anteriores guardadas solo como evidencia local no están incluidas. El catálogo mostrado corresponde a Ridge, B1 y métodos deterministas; Chronos dispone de su catálogo independiente en Predicciones.</p></section>
        <section className="metric-grid">{metrics(indicatorsState.indicators).map(metric => <MetricCard key={metric.title} metric={metric} />)}</section>
        {indicatorsState.indicators.warnings.length > 0 && <section className="panel" aria-label="Advertencias de indicadores"><p>No hay registros funcionales suficientes para algunos indicadores.</p></section>}
      </>}

      {capabilitiesState.kind === 'loading' && <p role="status">Cargando capacidades activas…</p>}
      {capabilitiesState.kind === 'error' && <section className="panel" role="alert"><p>{capabilitiesState.message}</p><button type="button" className="secondary-button" onClick={onRetryCapabilities}>Reintentar capacidades</button></section>}
      {capabilitiesState.kind === 'success' && <ArtifactDisclosure capabilities={capabilitiesState.capabilities} />}
      <p>El registro y preparación de datasets se encuentran en Administración.</p>
      </>}
    </div>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import type { CapabilityVersion } from '../../types/capabilities'
import { loadCapabilityModels, type CapabilityModelsState } from '../../services/capabilityModelsService'
import { combineCapabilityModels, type CapabilityArtifact } from '../../utils/capabilityModels'
import { SectionHeader } from '../ui/SectionHeader'
import { StatusBadge } from '../ui/StatusBadge'
import './ActiveArtifacts.css'

const labels: Record<CapabilityVersion['capability'], string> = {
  supply_forecast: 'Pronóstico de oferta', demand_forecast: 'Pronóstico de demanda',
  price_estimation: 'Estimación de precio', matching: 'Emparejamiento', pattern_recognition: 'Reconocimiento de patrones',
}
const types: Record<CapabilityVersion['artifactType'], string> = {
  ml_model: 'Modelo de ML', deterministic_rule: 'Regla determinista', deterministic_method: 'Método determinista',
}

export function ActiveArtifacts({ capabilities }: { capabilities: CapabilityVersion[] }) {
  const [state, setState] = useState<CapabilityModelsState>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  const cache = useRef<{ capabilities: CapabilityVersion[]; state: CapabilityModelsState } | null>(null)
  const inFlight = useRef(true)
  useEffect(() => {
    const controller = new AbortController()
    inFlight.current = true
    const previous = cache.current?.capabilities === capabilities ? cache.current.state : undefined
    void loadCapabilityModels(capabilities, controller.signal, next => {
      cache.current = { capabilities, state: next }
      setState(next)
    }, previous).finally(() => { if (!controller.signal.aborted) inFlight.current = false })
    return () => controller.abort()
  }, [capabilities, retry])
  return <ActiveArtifactsContent capabilities={capabilities} state={state} onRetry={() => {
    if (inFlight.current) return
    inFlight.current = true
    if (state.kind === 'error') setState({ kind: 'loading' })
    else if (state.kind === 'success') setState({ ...state, details: Object.fromEntries(Object.entries(state.details)
      .map(([id, detail]) => [id, detail.kind === 'error' ? { kind: 'loading' } : detail])) })
    setRetry(value => value + 1)
  }} />
}

function Limitation({ artifactId, text }: { artifactId: string; text: string }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  return <div className="artifact-limitation">
    <button type="button" className="artifact-disclosure" aria-expanded={expanded} aria-controls={id}
      aria-label={`Limitación principal de ${artifactId}`} onClick={() => setExpanded(value => !value)}>
      {expanded ? 'Ocultar limitación principal' : 'Ver limitación principal'}
    </button>
    <p id={id} hidden={!expanded}>{text}</p>
  </div>
}

function Evidence({ row, state }: { row: CapabilityArtifact; state: CapabilityModelsState }) {
  if (!row.predictive) return <dl className="artifact-evidence artifact-secondary">
    <div><dt>Promoción técnica</dt><dd>No aplica al catálogo predictivo</dd></div>
    <div><dt>Métricas predictivas</dt><dd>No aplica</dd></div>
    <div><dt>Validación académica</dt><dd>No disponible en este contrato</dd></div>
  </dl>
  const detail = state.kind === 'success' ? state.details[row.capability.id] : undefined
  if (state.kind === 'loading' || (detail?.kind === 'loading' && row.summary)) {
    return <p className="artifact-secondary" aria-busy="true">Cargando…</p>
  }
  if (!row.metadata) return <div>
    <p>Información técnica no disponible</p>
    {detail?.kind === 'error' && <p className="artifact-secondary" role="alert">{detail.message}</p>}
    {state.kind === 'success' && !row.summary && !row.notice && <p className="artifact-secondary">Sin entrada correspondiente en el catálogo predictivo.</p>}
  </div>
  return <div className="artifact-evidence">
    <p>{row.metadata.lifecycle.promoted ? 'Promovido técnicamente' : 'No promovido técnicamente'}</p>
    <p>Validación académica: <strong>{row.metadata.lifecycle.academicValidation === 'validated' ? 'Validada' : 'Pendiente'}</strong></p>
    <p className="artifact-secondary">{row.metadata.quality.metricsAvailable ? 'Métricas disponibles' : 'Métricas no disponibles'}</p>
    {row.metadata.limitations[0] && <Limitation artifactId={row.capability.id} text={row.metadata.limitations[0]} />}
  </div>
}

export function ActiveArtifactsContent({ capabilities, state, onRetry }: {
  capabilities: CapabilityVersion[]; state: CapabilityModelsState; onRetry: () => void
}) {
  const artifacts = state.kind === 'success' ? state.artifacts : []
  const metadata = state.kind === 'success'
    ? Object.values(state.details).flatMap(detail => detail.kind === 'success' ? [detail.metadata] : []) : []
  const rows = combineCapabilityModels(capabilities, artifacts, metadata)
  const pending = state.kind === 'loading' || (state.kind === 'success' && Object.values(state.details).some(detail => detail.kind === 'loading'))
  const failed = state.kind === 'error' || (state.kind === 'success' && Object.values(state.details).some(detail => detail.kind === 'error'))
  return <section className="panel active-artifacts" aria-label="Artefactos activos">
    <SectionHeader eyebrow="Capacidades" title="Artefactos activos"
      description="La actividad en runtime y la validación académica se muestran por separado.">
      {failed && <button type="button" className="secondary-button" disabled={pending} onClick={onRetry}>Reintentar información de modelos</button>}
    </SectionHeader>
    <div role="status" className="artifacts-load-status">{pending ? 'Cargando información técnica…' : ''}</div>
    {state.kind === 'error' && <p className="artifacts-notice" role="alert">Información técnica no disponible. {state.message}</p>}
    <table className="artifacts-table" aria-label="Capacidades, runtime y evidencia" role="table">
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">Capacidad / artefacto</th>
        <th scope="col" role="columnheader">Tipo / versión</th>
        <th scope="col" role="columnheader">Runtime</th>
        <th scope="col" role="columnheader">Madurez y evidencia</th>
      </tr></thead>
      <tbody role="rowgroup">{rows.map(row => <tr key={row.capability.capability} role="row">
        <th scope="row" role="rowheader">
          <span className="artifact-mobile-label" aria-hidden="true">Capacidad / artefacto</span>
          <strong>{labels[row.capability.capability]}</strong>
          <span className="artifact-secondary artifact-id">{row.capability.id}</span>
        </th>
        <td role="cell">
          <span className="artifact-mobile-label" aria-hidden="true">Tipo / versión</span>
          <p>{types[row.capability.artifactType]}</p>
          <p className="artifact-secondary">Versión {row.capability.version}</p>
          {row.summary && <p className="artifact-secondary">{row.summary.type}</p>}
        </td>
        <td role="cell">
          <span className="artifact-mobile-label" aria-hidden="true">Runtime</span>
          <StatusBadge tone={row.capability.active ? 'success' : 'neutral'}>{row.capability.active && row.capability.status === 'active' ? 'Activo' : 'No activo'}</StatusBadge>
        </td>
        <td role="cell">
          <span className="artifact-mobile-label" aria-hidden="true">Madurez y evidencia</span>
          <Evidence row={row} state={state} />
          {row.notice && <p className="artifacts-notice">{row.notice}</p>}
        </td>
      </tr>)}</tbody>
    </table>
  </section>
}

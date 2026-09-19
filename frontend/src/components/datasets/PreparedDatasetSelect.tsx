import { useEffect, useState } from 'react'
import { ApiError } from '../../services/apiClient'
import { getPreparedDatasets } from '../../services/preparedDatasetsService'
import type { PreparedDatasetCompatibility, PreparedDatasetSummary } from '../../types/preparedDatasets'

type SelectState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; datasets: PreparedDatasetSummary[] }

function errorMessage(error: unknown) { return error instanceof ApiError ? error.serverMessage ?? error.message : 'No fue posible cargar los datasets preparados.' }
function compatible(dataset: PreparedDatasetSummary, requirements?: PreparedDatasetCompatibility[]) {
  return !requirements || requirements.some(requirement => dataset.profileId === requirement.profileId && dataset.profileVersion === requirement.profileVersion && dataset.sourceRulesetId === requirement.sourceRulesetId && dataset.sourceRulesetVersion === requirement.sourceRulesetVersion)
}
function label(dataset: PreparedDatasetSummary) {
  return `#${dataset.id} · ${dataset.dataType} · ${dataset.profileId}@${dataset.profileVersion} · ${dataset.recordCount} filas · ${new Date(dataset.preparedAt).toLocaleDateString('es-CO', { timeZone: 'UTC' })}`
}

export function PreparedDatasetSelectContent({ state, value, onChange, requirements }: { state: SelectState; value: string; onChange: (value: string) => void; requirements?: PreparedDatasetCompatibility[] }) {
  const datasets = state.kind === 'success' ? state.datasets.filter(dataset => compatible(dataset, requirements)) : []
  return <>
    <label>Dataset preparado compatible
      <select value={value} onChange={event => onChange(event.target.value)} disabled={state.kind !== 'success' || datasets.length === 0} required>
        <option value="">Selecciona un dataset preparado</option>
        {datasets.map(dataset => <option key={dataset.id} value={String(dataset.id)}>{label(dataset)}</option>)}
      </select>
    </label>
    {state.kind === 'loading' && <p role="status">Cargando datasets preparados…</p>}
    {state.kind === 'error' && <p role="alert">{state.message}</p>}
    {state.kind === 'success' && datasets.length === 0 && <p>Primero prepare un dataset compatible.</p>}
  </>
}

export function PreparedDatasetSelect({ value, onChange, requirements }: { value: string; onChange: (value: string) => void; requirements?: PreparedDatasetCompatibility[] }) {
  const [state, setState] = useState<SelectState>({ kind: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    getPreparedDatasets(controller.signal).then(datasets => { if (!controller.signal.aborted) setState({ kind: 'success', datasets }) }).catch(error => { if (!controller.signal.aborted) setState({ kind: 'error', message: errorMessage(error) }) })
    return () => controller.abort()
  }, [])
  return <PreparedDatasetSelectContent state={state} value={value} onChange={onChange} requirements={requirements} />
}
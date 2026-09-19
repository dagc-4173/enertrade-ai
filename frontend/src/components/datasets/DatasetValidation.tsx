import { useRef, useState } from 'react'
import { ApiError } from '../../services/apiClient'
import { prepareDataset, validateDataset } from '../../services/datasetService'
import type { DatasetQualityStatus, DatasetValidationResult, PreparedDatasetResult } from '../../types/dataset'
import type { StatusTone } from '../../types/domain'
import { SectionHeader } from '../ui/SectionHeader'
import { StatusBadge } from '../ui/StatusBadge'

type ValidationState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; report: DatasetValidationResult }
  | { kind: 'error'; status: number | null; code: string | null; message: string }

export type PreparationState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; prepared: PreparedDatasetResult }
  | { kind: 'error'; status: number | null; code: string | null; message: string }

const tones: Record<DatasetQualityStatus, StatusTone> = {
  aprobado: 'success', advertencia: 'warning', rechazado: 'danger',
}

interface Props {
  datasetId: number
  onBusyChange: (busy: boolean) => void
}

export function DatasetPreparationContent({ datasetId, state, onPrepare }: { datasetId: number; state: PreparationState; onPrepare: () => void }) {
  return <section className="dataset-quality" aria-label={`Preparación del dataset ${datasetId}`} aria-busy={state.kind === 'loading'}>
    <SectionHeader eyebrow="Dataset preparado" title="Preparar dataset" description="Genera el artefacto compatible según el informe validado en el servidor." />
    <button type="button" className="primary-button" onClick={onPrepare} disabled={state.kind === 'loading' || state.kind === 'success'}>
      {state.kind === 'loading' ? 'Preparando…' : state.kind === 'success' ? 'Dataset preparado' : 'Preparar dataset'}
    </button>
    {state.kind === 'idle' && <p>La preparación se valida nuevamente en el backend antes de generar el artefacto.</p>}
    {state.kind === 'loading' && <p role="status">Preparando dataset en el servidor…</p>}
    {state.kind === 'error' && <div role="alert"><p>{state.status ? `HTTP ${state.status}: ` : ''}{state.message}</p>{state.code && <small>{state.code}</small>}</div>}
    {state.kind === 'success' && <div className="stack-list"><p role="status">Dataset preparado confirmado por el servidor{state.prepared.reused ? ' (artefacto existente).' : '.'}</p><dl className="dataset-metadata">
      <div><dt>PreparedDataset ID</dt><dd>{state.prepared.preparedDatasetId}</dd></div>
      <div><dt>Perfil</dt><dd>{state.prepared.profileId} · {state.prepared.profileVersion}</dd></div>
      <div><dt>Ruleset fuente</dt><dd>{state.prepared.sourceRulesetId} · {state.prepared.sourceRulesetVersion}</dd></div>
      <div><dt>Fecha de preparación (UTC)</dt><dd>{state.prepared.preparedAt}</dd></div>
      <div><dt>Filas</dt><dd>{state.prepared.recordCount}</dd></div>
    </dl><p>Al abrir Predicciones o Patrones, sus selectores consultan nuevamente el catálogo del backend.</p></div>}
  </section>
}

export function DatasetValidation({ datasetId, onBusyChange }: Props) {
  const [state, setState] = useState<ValidationState>({ kind: 'idle' })
  const [preparation, setPreparation] = useState<PreparationState>({ kind: 'idle' })
  const pending = useRef(false)
  const preparing = useRef(false)

  async function validate() {
    if (pending.current || state.kind === 'success') return
    pending.current = true
    onBusyChange(true)
    setPreparation({ kind: 'idle' })
    setState({ kind: 'loading' })
    try {
      setState({ kind: 'success', report: await validateDataset(datasetId) })
    } catch (error) {
      setState({ kind: 'error',
        status: error instanceof ApiError ? error.status : null,
        code: error instanceof ApiError ? error.code : null,
        message: error instanceof ApiError && error.serverMessage ? error.serverMessage :
          'No se recibió un informe utilizable. No se puede confirmar el resultado de calidad.',
      })
    } finally {
      pending.current = false
      onBusyChange(false)
    }
  }

  async function prepare() {
    if (preparing.current || preparation.kind === 'success') return
    preparing.current = true
    onBusyChange(true)
    setPreparation({ kind: 'loading' })
    try {
      setPreparation({ kind: 'success', prepared: await prepareDataset(datasetId) })
    } catch (error) {
      setPreparation({ kind: 'error', status: error instanceof ApiError ? error.status : null,
        code: error instanceof ApiError ? error.code : null,
        message: error instanceof ApiError && error.serverMessage ? error.serverMessage : 'No se recibió una confirmación utilizable de preparación.',
      })
    } finally {
      preparing.current = false
      onBusyChange(false)
    }
  }

  return (
    <section className="dataset-quality" aria-label={`Calidad del dataset ${datasetId}`} aria-busy={state.kind === 'loading'}>
      <SectionHeader eyebrow="Calidad de datos" title="Validar dataset"
        description={`Solicita la evaluación del dataset ${datasetId} registrado en el servidor.`} />
      <button type="button" className="primary-button" onClick={validate}
        disabled={state.kind === 'loading' || state.kind === 'success'}>
        {state.kind === 'loading' ? 'Validando…' : state.kind === 'success' ? 'Validación completada' : 'Validar calidad'}
      </button>
      <div className="stack-list" aria-live="polite">
        {state.kind === 'loading' && <p role="status">Esperando el informe de calidad…</p>}
        {state.kind === 'error' && <div role="alert">
          <p>{state.status ? `HTTP ${state.status}: ` : ''}{state.message}</p>
          {state.code && <small>{state.code}</small>}
        </div>}
        {state.kind === 'success' && <>
          <p role="status"><StatusBadge tone={tones[state.report.status]}>{state.report.status.toUpperCase()}</StatusBadge></p>
          <dl className="dataset-metadata">
            <div><dt>Dataset ID</dt><dd>{state.report.datasetId}</dd></div>
            <div><dt>Status</dt><dd>{state.report.status}</dd></div>
            <div><dt>canProceed</dt><dd>{String(state.report.canProceed)}</dd></div>
            <div><dt>Registros</dt><dd>{state.report.recordCount}</dd></div>
            <div><dt>Errores</dt><dd>{state.report.errorCount}</dd></div>
            <div><dt>Advertencias</dt><dd>{state.report.warningCount}</dd></div>
            <div><dt>Ruleset ID</dt><dd>{state.report.rulesetId}</dd></div>
            <div><dt>Ruleset version</dt><dd>{state.report.rulesetVersion}</dd></div>
            <div><dt>Fecha de validación (UTC)</dt><dd>{state.report.validatedAt}</dd></div>
          </dl>
          <strong>Hallazgos del servidor</strong>
          {state.report.issues.length === 0 ? <p>Sin hallazgos.</p> : state.report.issues.map((issue, index) => (
            <article key={`${issue.recordIndex}:${issue.field}:${issue.code}:${index}`}>
              <StatusBadge tone={issue.severity === 'error' ? 'danger' : 'warning'}>{issue.severity}</StatusBadge>
              <p>{issue.message}</p>
              <p>Índice de registro (desde 0): {issue.recordIndex} · Campo: {issue.field}</p>
              <small>{issue.code}</small>
              {issue.relatedRecordIndex !== undefined && <p>Índice relacionado: {issue.relatedRecordIndex}</p>}
            </article>
          ))}
          <DatasetPreparationContent datasetId={datasetId} state={preparation} onPrepare={() => { void prepare() }} />
        </>}
      </div>
    </section>
  )
}

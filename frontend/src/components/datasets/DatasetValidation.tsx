import { useRef, useState } from 'react'
import { ApiError } from '../../services/apiClient'
import { prepareDataset, validateDataset } from '../../services/datasetService'
import type { DatasetQualityStatus, DatasetValidationResult, PreparedDatasetResult } from '../../types/dataset'
import type { StatusTone } from '../../types/domain'
import { SectionHeader } from '../ui/SectionHeader'
import { StatusBadge } from '../ui/StatusBadge'

export type ValidationState =
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
const flowLabels = { idle: 'Pendiente', loading: 'En curso', error: 'Error' } as const
const validationFlowLabels: Record<DatasetQualityStatus, string> = { aprobado: 'Aprobado', advertencia: 'Con advertencias', rechazado: 'Rechazado' }

function validationStep(state: ValidationState): { label: string; tone: StatusTone } {
  if (state.kind === 'idle' || state.kind === 'loading' || state.kind === 'error') return { label: flowLabels[state.kind], tone: state.kind === 'error' ? 'danger' : state.kind === 'loading' ? 'info' : 'neutral' }
  return { label: validationFlowLabels[state.report.status], tone: tones[state.report.status] }
}
function preparationStep(state: PreparationState): { label: string; tone: StatusTone } {
  if (state.kind === 'idle' || state.kind === 'loading' || state.kind === 'error') return { label: flowLabels[state.kind], tone: state.kind === 'error' ? 'danger' : state.kind === 'loading' ? 'info' : 'neutral' }
  return { label: 'Preparado', tone: 'success' }
}

/** Mounted only after registration is confirmed by HTTP 201. */
export function DatasetFlowSummary({ validation, preparation }: { validation: ValidationState; preparation: PreparationState }) {
  const validationBadge = validationStep(validation)
  const preparationBadge = preparationStep(preparation)
  return (
    <ol className="dataset-flow-summary" aria-label="Progreso del flujo de datos">
      <li><span>Registro</span><StatusBadge tone="success">Completado</StatusBadge></li>
      <li><span>Validación</span><StatusBadge tone={validationBadge.tone}>{validationBadge.label}</StatusBadge></li>
      <li><span>Preparación</span><StatusBadge tone={preparationBadge.tone}>{preparationBadge.label}</StatusBadge></li>
    </ol>
  )
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
    <div role="status">
      {state.kind === 'loading' && <p>Preparando dataset en el servidor…</p>}
      {state.kind === 'success' && <div className="dataset-result-heading"><StatusBadge tone="success">Preparación completada</StatusBadge></div>}
    </div>
    {state.kind === 'error' && <div role="alert"><p>{state.status ? `HTTP ${state.status}: ` : ''}{state.message}</p>{state.code && <small>{state.code}</small>}</div>}
    {state.kind === 'success' && <div className="stack-list">
      <dl className="dataset-metadata dataset-metadata--primary">
        <div><dt>ID de dataset preparado</dt><dd>{state.prepared.preparedDatasetId}</dd></div>
        <div><dt>Filas</dt><dd>{state.prepared.recordCount}</dd></div>
        <div><dt>Origen</dt><dd>{state.prepared.reused ? 'Reutilizado' : 'Creado'}</dd></div>
      </dl>
      <div className="dataset-secondary">
        <h3 className="dataset-secondary-label">Metadatos técnicos</h3>
        <dl className="dataset-metadata">
          <div><dt>Perfil de preparación</dt><dd>{state.prepared.profileId}</dd></div>
          <div><dt>Versión</dt><dd>{state.prepared.profileVersion}</dd></div>
          <div><dt>Regla fuente</dt><dd>{state.prepared.sourceRulesetId}</dd></div>
          <div><dt>Versión de regla</dt><dd>{state.prepared.sourceRulesetVersion}</dd></div>
          <div><dt>Fecha de preparación (UTC)</dt><dd>{state.prepared.preparedAt}</dd></div>
        </dl>
      </div>
      <p>Al abrir Predicciones o Patrones, sus selectores consultan nuevamente el catálogo del backend.</p>
    </div>}
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
    if (state.kind !== 'success' || !state.report.canProceed || preparing.current || preparation.kind === 'success') return
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

  return <DatasetValidationContent datasetId={datasetId} state={state} preparation={preparation}
    onValidate={() => { void validate() }} onPrepare={() => { void prepare() }} />
}

export function DatasetValidationContent({ datasetId, state, preparation, onValidate, onPrepare }: {
  datasetId: number
  state: ValidationState
  preparation: PreparationState
  onValidate: () => void
  onPrepare: () => void
}) {
  return (
    <>
      <DatasetFlowSummary validation={state} preparation={preparation} />
      <section className="dataset-quality" aria-label={`Calidad del dataset ${datasetId}`} aria-busy={state.kind === 'loading'}>
        <SectionHeader eyebrow="Calidad de datos" title="Validar dataset"
          description={`Solicita la evaluación del dataset ${datasetId} registrado en el servidor.`} />
        <button type="button" className="primary-button" onClick={onValidate}
          disabled={state.kind === 'loading' || state.kind === 'success'}>
          {state.kind === 'loading' ? 'Validando…' : state.kind === 'success' ? 'Validación completada' : 'Validar calidad'}
        </button>
        <div className="stack-list">
          {state.kind === 'loading' && <p role="status">Esperando el informe de calidad…</p>}
          {state.kind === 'error' && <div role="alert">
            <p>{state.status ? `HTTP ${state.status}: ` : ''}{state.message}</p>
            {state.code && <small>{state.code}</small>}
          </div>}
          <div aria-live="polite" aria-atomic="true">
            {state.kind === 'success' &&
            <dl className="dataset-metadata dataset-metadata--primary">
              <div><dt>Resultado</dt><dd><StatusBadge tone={tones[state.report.status]}>{state.report.status}</StatusBadge></dd></div>
              <div><dt>Registros</dt><dd>{state.report.recordCount}</dd></div>
              <div><dt>Errores</dt><dd>{state.report.errorCount}</dd></div>
              <div><dt>Advertencias</dt><dd>{state.report.warningCount}</dd></div>
              <div><dt>Puede continuar</dt><dd>{state.report.canProceed ? 'Sí' : 'No'}</dd></div>
            </dl>}
          </div>
          {state.kind === 'success' && <>
            <div className="dataset-secondary">
              <h3 className="dataset-secondary-label">Metadatos técnicos</h3>
              <dl className="dataset-metadata">
                <div><dt>Dataset ID</dt><dd>{state.report.datasetId}</dd></div>
                <div><dt>Regla de validación</dt><dd>{state.report.rulesetId}</dd></div>
                <div><dt>Versión de regla</dt><dd>{state.report.rulesetVersion}</dd></div>
                <div><dt>Fecha de validación (UTC)</dt><dd>{state.report.validatedAt}</dd></div>
              </dl>
            </div>
            <h3 className="dataset-secondary-label">Hallazgos del servidor</h3>
            {state.report.issues.length === 0 ? <p>Sin hallazgos.</p> : state.report.issues.map((issue, index) => (
              <article className="dataset-issue" key={`${issue.recordIndex}:${issue.field}:${issue.code}:${index}`}>
                <StatusBadge tone={issue.severity === 'error' ? 'danger' : 'warning'}>{issue.severity}</StatusBadge>
                <p className="dataset-issue-message">{issue.message}</p>
                <div className="dataset-issue-context">
                  <p>Índice de registro (desde 0): {issue.recordIndex} · Campo: {issue.field}</p>
                  <small>{issue.code}</small>
                  {issue.relatedRecordIndex !== undefined && <p>Índice relacionado: {issue.relatedRecordIndex}</p>}
                </div>
              </article>
            ))}
            {state.report.canProceed
              ? <DatasetPreparationContent datasetId={datasetId} state={preparation} onPrepare={onPrepare} />
              : <p className="dataset-blocked" role="status">El dataset no puede avanzar a preparación debido al resultado de validación.</p>}
          </>}
        </div>
      </section>
    </>
  )
}

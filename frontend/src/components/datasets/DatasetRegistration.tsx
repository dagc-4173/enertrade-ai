import { useRef, useState, type FormEvent } from 'react'
import { datasetExample, pendingDatasetExample } from '../../data/datasetExamples'
import { ApiError } from '../../services/apiClient'
import { registerDataset } from '../../services/datasetService'
import type { PendingOptionalField, RegisteredDataset } from '../../types/dataset'
import { DataTable, type DataTableColumn } from '../tables/DataTable'
import { SectionHeader } from '../ui/SectionHeader'
import { StatusBadge } from '../ui/StatusBadge'
import './DatasetRegistration.css'
import { DatasetValidation } from './DatasetValidation'

type RegistrationState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; dataset: RegisteredDataset }
  | { kind: 'error'; message: string; status?: number | null }

const columns: DataTableColumn<PendingOptionalField>[] = [
  { header: 'Índice de registro (desde 0)', render: row => row.recordIndex },
  { header: 'Campo', render: row => row.field },
  { header: 'Motivo', render: row => row.reason },
]

export function DatasetRegistration() {
  const [json, setJson] = useState(JSON.stringify(datasetExample, null, 2))
  const [state, setState] = useState<RegistrationState>({ kind: 'idle' })
  const submitting = useRef(false)
  const [validationBusy, setValidationBusy] = useState(false)
  const loading = state.kind === 'loading' || validationBusy

  function edit(value: string) {
    setJson(value)
    setState({ kind: 'idle' })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || validationBusy || state.kind === 'success') return
    let input: unknown
    try {
      input = JSON.parse(json)
    } catch {
      setState({ kind: 'error', message: 'El texto no es JSON válido. Revisa su sintaxis antes de enviarlo.' })
      return
    }
    submitting.current = true
    setState({ kind: 'loading' })
    try {
      setState({ kind: 'success', dataset: await registerDataset(input) })
    } catch (error) {
      setState({ kind: 'error', status: error instanceof ApiError ? error.status : null,
        message: error instanceof ApiError && error.serverMessage
          ? error.serverMessage
          : 'No se recibió una confirmación utilizable. No se puede confirmar el registro; evita reenviarlo sin comprobarlo.' })
    } finally {
      submitting.current = false
    }
  }

  return (
    <section className="panel dataset-registration" aria-label="Registro de dataset energético">
      <SectionHeader eyebrow="Gestión de datos energéticos" title="Registrar dataset"
        description="Envía datos JSON al registro de datasets. Puedes editar los ejemplos antes de enviarlos." />
      <form onSubmit={submit} aria-busy={loading}>
        <div className="hero-actions">
          <button type="button" className="secondary-button" disabled={loading}
            onClick={() => edit(JSON.stringify(datasetExample, null, 2))}>Ejemplo válido</button>
          <button type="button" className="secondary-button" disabled={loading}
            onClick={() => edit(JSON.stringify(pendingDatasetExample, null, 2))}>Ejemplo con opcional pendiente</button>
        </div>
        <label htmlFor="dataset-json">Dataset en JSON</label>
        <textarea id="dataset-json" value={json} onChange={event => edit(event.target.value)}
          disabled={loading} spellCheck={false} rows={16} aria-describedby="dataset-json-help" />
        <p id="dataset-json-help">Los ejemplos son datos de entrada simulados. El resultado se mostrará después de la respuesta del servidor.</p>
        <button type="submit" className="primary-button" disabled={loading || state.kind === 'success'}>
          {state.kind === 'loading' ? 'Registrando…' : state.kind === 'success' ? 'Registrado' : 'Registrar dataset'}
        </button>
      </form>
      <div aria-live="polite" role="status">
        {state.kind === 'idle' && <p>Listo para registrar.</p>}
        {state.kind === 'loading' && <p>Esperando la respuesta del servidor…</p>}
        {state.kind === 'error' && <p role="alert">{state.status ? `HTTP ${state.status}: ` : ''}{state.message}</p>}
        {state.kind === 'success' && <div className="stack-list">
          <p>Registro confirmado por el servidor · HTTP 201</p>
          <dl className="dataset-metadata">
            <div><dt>ID</dt><dd>{state.dataset.id}</dd></div>
            <div><dt>Fuente</dt><dd>{state.dataset.source}</dd></div>
            <div><dt>Tipo de dato</dt><dd>{state.dataset.dataType}</dd></div>
            <div><dt>Fecha de carga (UTC)</dt><dd>{state.dataset.uploadedAt}</dd></div>
            <div><dt>Estado al registrar</dt><dd><StatusBadge tone="info">{state.dataset.status}</StatusBadge></dd></div>
            <div><dt>Registros</dt><dd>{state.dataset.recordCount}</dd></div>
          </dl>
          <strong>Campos opcionales pendientes</strong>
          {state.dataset.pendingOptionalFields.length === 0 ? <p>Sin campos opcionales pendientes.</p> :
            <DataTable columns={columns} rows={state.dataset.pendingOptionalFields}
              getRowKey={row => `${row.recordIndex}:${row.field}`} />}
        </div>}
      </div>
      {state.kind === 'success' && <DatasetValidation key={state.dataset.id}
        datasetId={state.dataset.id} onBusyChange={setValidationBusy} />}
    </section>
  )
}

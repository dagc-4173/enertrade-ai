import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../services/apiClient'
import { listExternalProviders, queryExternalData } from '../../services/externalDataService'
import type { ExternalProvider, ExternalResult } from '../../types/externalData'
import { SectionHeader } from '../ui/SectionHeader'
import { DataTable } from '../tables/DataTable'
import './ExternalDataSources.css'

function safeMessage(error: unknown) {
  return error instanceof ApiError && error.serverMessage
    ? error.serverMessage : 'No fue posible completar la consulta. Intenta nuevamente.'
}

export function ExternalDataSources() {
  const [catalog, setCatalog] = useState<ExternalProvider[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [retry, setRetry] = useState(0)
  const [providerId, setProviderId] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ExternalResult | null>(null)
  const request = useRef<AbortController | null>(null)
  const provider = catalog.find(item => item.id === providerId)
  const selectedDataset = provider?.datasets.find(item => item.id === datasetId)
  const maxDays = Math.min(30, selectedDataset?.maxInclusiveDays ?? 30)

  useEffect(() => {
    const controller = new AbortController()
    listExternalProviders(controller.signal).then(providers => {
      if (controller.signal.aborted) return
      setCatalog(providers)
      setProviderId(providers[0]?.id ?? '')
      setDatasetId(providers[0]?.datasets[0]?.id ?? '')
    }).catch(reason => {
      if (!controller.signal.aborted) setCatalogError(safeMessage(reason))
    }).finally(() => {
      if (!controller.signal.aborted) setCatalogLoading(false)
    })
    return () => controller.abort()
  }, [retry])
  useEffect(() => () => request.current?.abort(), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setError('')
    setResult(null)
    const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1
    if (!provider || !selectedDataset || !startDate || !endDate || !Number.isFinite(days)) {
      setError('Completa el proveedor, la métrica y ambas fechas.')
      return
    }
    if (days < 1 || days > maxDays) {
      setError(`Selecciona un rango de entre 1 y ${maxDays} días inclusivos.`)
      return
    }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    try {
      const response = await queryExternalData({ provider: providerId, dataset: datasetId, startDate, endDate }, controller.signal)
      if (!controller.signal.aborted) setResult(response)
    } catch (reason) {
      if (!controller.signal.aborted) setError(safeMessage(reason))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  return <section className="panel external-data-sources">
    <SectionHeader eyebrow="Consulta externa" title="Fuentes de datos" description="Consulta generación, demanda y precio de bolsa publicados por XM." />
    {catalogLoading && <p role="status">Cargando proveedores…</p>}
    {catalogError && <div role="alert"><p>{catalogError}</p><button type="button" className="secondary-button" onClick={() => {
      setCatalogError(''); setCatalogLoading(true); setRetry(value => value + 1)
    }}>Reintentar carga</button></div>}
    {!catalogLoading && !catalogError && (catalog.length === 0 ? <p>No hay proveedores disponibles.</p> : <form onSubmit={submit}>
      <fieldset disabled={loading}>
        <legend className="external-data-legend">Parámetros de consulta</legend>
        <label>Proveedor<select required value={providerId} onChange={event => {
          setProviderId(event.target.value)
          setDatasetId(catalog.find(item => item.id === event.target.value)?.datasets[0]?.id ?? '')
          setResult(null); setError('')
        }}>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Métrica<select required value={datasetId} onChange={event => { setDatasetId(event.target.value); setResult(null); setError('') }}>
          {!provider?.datasets.length && <option value="">Sin métricas disponibles</option>}
          {provider?.datasets.map(item => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
        </select></label>
        <label>Fecha inicial<input type="date" required value={startDate} onChange={event => { setStartDate(event.target.value); setResult(null); setError('') }} /></label>
        <label>Fecha final<input type="date" required value={endDate} min={startDate || undefined} onChange={event => { setEndDate(event.target.value); setResult(null); setError('') }} /></label>
      </fieldset>
      <p className="section-description">Máximo {maxDays} días inclusivos por consulta.</p>
      <button className="primary-button" type="submit" disabled={loading || !selectedDataset}>{loading ? 'Consultando…' : 'Consultar datos'}</button>
    </form>)}
    {loading && <p role="status">Consultando datos externos…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div>
      <p role="status">Consulta completada: {result.records.length} registros.</p>
      <dl className="external-data-metadata">
        <div><dt>Proveedor</dt><dd>{catalog.find(item => item.id === result.provider)?.name} ({result.provider})</dd></div>
        <div><dt>Métrica</dt><dd>{catalog.find(item => item.id === result.provider)?.datasets.find(item => item.id === result.dataset)?.name} ({result.dataset})</dd></div>
        <div><dt>Rango consultado</dt><dd>{result.startDate} — {result.endDate}</dd></div>
        <div><dt>Unidad</dt><dd>{result.unit}</dd></div>
      </dl>
      {result.records.length === 0 ? <p>No hay registros disponibles para este rango.</p> : <DataTable
        columns={[
          { header: 'Fecha', render: row => row.date },
          { header: 'Hora (periodo XM)', render: row => row.hour ?? 'Diario' },
          { header: `Valor (${result.unit})`, render: row => String(row.value) },
        ]}
        rows={result.records}
        getRowKey={row => `${row.date}/${row.hour}`}
      />}
    </div>}
  </section>
}

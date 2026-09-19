import { useEffect, useState, type FormEvent } from 'react'
import { DataTable, type DataTableColumn } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { PreparedDatasetSelect } from '../components/datasets/PreparedDatasetSelect'
import { ApiError } from '../services/apiClient'
import { analyzePatterns, getPatterns } from '../services/patternsService'
import type { PatternAnalysis, PatternAnalysisResponse, PatternDataType, PatternFilters, PatternVariable } from '../types/patterns'

function errorMessage(error: unknown) { return error instanceof ApiError ? error.serverMessage ?? error.message : 'No fue posible completar la solicitud.' }
const statusTone = (status: PatternAnalysis['status']) => status === 'completed' ? 'success' : status === 'partial' ? 'warning' : 'neutral'
const historyColumns: DataTableColumn<PatternAnalysis>[] = [
  { header: 'Análisis', render: row => <strong>{row.analysisId}</strong> },
  { header: 'Tipo de datos', render: row => row.dataType },
  { header: 'Variable', render: row => row.variable },
  { header: 'Estado', render: row => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge> },
  { header: 'Muestra', render: row => String(row.sampleSize) },
]

export function PatternResults({ analysis }: { analysis: PatternAnalysisResponse | PatternAnalysis }) {
  return <section className="panel"><SectionHeader eyebrow="Resultado" title="Análisis de patrones" description={`Método: ${analysis.method.id} ${analysis.method.version}.`} />
    <div className="stack-list">
      <article><div className="row-between"><strong>Estado</strong><StatusBadge tone={statusTone(analysis.status)}>{analysis.status}</StatusBadge></div><p>Muestra: {analysis.sampleSize}. Periodo: {analysis.period.from ?? 'No disponible'} a {analysis.period.to ?? 'No disponible'}.</p></article>
      {analysis.patterns.map(pattern => <article key={pattern.type}><strong>{pattern.type}</strong><p>{pattern.description}</p>{pattern.type === 'distribution' && <p>Mínimo: {pattern.metrics.min}. Máximo: {pattern.metrics.max}. Media: {pattern.metrics.mean}. Mediana: {pattern.metrics.median}.</p>}{pattern.type === 'trend' && <p>Dirección: {pattern.metrics.direction}. Pendiente: {pattern.metrics.slope}.</p>}{pattern.type === 'recurrence' && <p>Agrupación: {pattern.metrics.grouping}. Grupos: {pattern.metrics.periods.length}.</p>}</article>)}
      {analysis.warnings.map(warning => <p key={warning} className="marketplace-empty">{warning}</p>)}
    </div>
  </section>
}

export function Patterns() {
  const [preparedId, setPreparedId] = useState('')
  const [filters, setFilters] = useState<PatternFilters>({})
  const [history, setHistory] = useState<PatternAnalysis[]>([])
  const [historyState, setHistoryState] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')
  const [result, setResult] = useState<PatternAnalysisResponse | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setHistoryState('loading'); setError('')
    getPatterns(filters, controller.signal).then(value => { if (!controller.signal.aborted) { setHistory(value); setHistoryState('success') } }).catch(reason => { if (!controller.signal.aborted) { setError(errorMessage(reason)); setHistoryState('error') } })
    return () => controller.abort()
  }, [filters, refresh])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const preparedDatasetId = Number(preparedId)
    if (!Number.isSafeInteger(preparedDatasetId) || preparedDatasetId < 1) { setError('Ingresa un identificador de dataset preparado válido.'); return }
    setAnalyzing(true); setError(''); setResult(null)
    try { setResult(await analyzePatterns(preparedDatasetId)); setRefresh(value => value + 1) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setAnalyzing(false) }
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <SectionHeader
          eyebrow="Reconocimiento de patrones"
          title="Analizar dataset preparado"
          description="Selecciona un dataset preparado real para ejecutar el análisis."
        />
        <form className="marketplace-form" onSubmit={submit} aria-busy={analyzing}><PreparedDatasetSelect value={preparedId} onChange={setPreparedId} /><button type="submit" className="primary-button" disabled={analyzing}>{analyzing ? 'Analizando…' : 'Analizar patrones'}</button></form>
      </section>
      {error && <section className="panel" role="alert"><p className="marketplace-error">{error}</p></section>}
      {result && <PatternResults analysis={result} />}
      <section className="panel"><SectionHeader eyebrow="Histórico" title="Análisis registrados" description="Consulta los análisis persistidos; puedes filtrar por periodo, tipo de dato o variable." />
        <div className="filter-row"><input aria-label="Desde" type="date" value={filters.from ?? ''} onChange={event => setFilters(value => ({ ...value, from: event.target.value || undefined }))} /><input aria-label="Hasta" type="date" value={filters.to ?? ''} onChange={event => setFilters(value => ({ ...value, to: event.target.value || undefined }))} /><select aria-label="Tipo de datos" value={filters.dataType ?? ''} onChange={event => setFilters(value => ({ ...value, dataType: (event.target.value || undefined) as PatternDataType | undefined }))}><option value="">Todos los tipos</option><option value="generacion">Generación</option><option value="demanda">Demanda</option><option value="precios">Precios</option></select><select aria-label="Variable" value={filters.variable ?? ''} onChange={event => setFilters(value => ({ ...value, variable: (event.target.value || undefined) as PatternVariable | undefined }))}><option value="">Todas las variables</option><option value="energia_kwh">energía kWh</option><option value="demanda_kwh">demanda kWh</option><option value="precio_cop_kwh">precio COP/kWh</option></select></div>
        {historyState === 'loading' && <p role="status">Cargando análisis registrados…</p>}{historyState === 'error' && <p className="marketplace-error" role="alert">{error}</p>}{historyState === 'success' && (history.length === 0 ? <p className="marketplace-empty">No hay análisis registrados.</p> : <DataTable columns={historyColumns} rows={history} getRowKey={row => row.analysisId} />)}
      </section>
    </div>
  )
}

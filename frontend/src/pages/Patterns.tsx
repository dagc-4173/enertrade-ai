import { authStore } from '../auth/authStore'
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { DataTable, type DataTableColumn } from '../components/tables/DataTable'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import { PreparedDatasetSelect } from '../components/datasets/PreparedDatasetSelect'
import { ApiError } from '../services/apiClient'
import { analyzePatterns, getPatterns } from '../services/patternsService'
import type { PatternAnalysis, PatternAnalysisResponse, PatternDataType, PatternFilters, PatternVariable, RecurrencePattern } from '../types/patterns'
import { formatEnergyKWh, formatNumberCO, formatPriceCOPPerKWh } from '../utils/numberFormat'
import { patternRequirements, patternStatuses, patternVariables, patternDirections, recurrenceLabel } from '../utils/patternPresentation'
import './Patterns.css'

function errorMessage(error: unknown) { return error instanceof ApiError ? error.serverMessage ?? error.message : 'No fue posible completar la solicitud.' }
const statusTone = (status: PatternAnalysis['status']) => status === 'completed' ? 'success' : status === 'partial' ? 'warning' : 'neutral'
const formatValue = (value: number, variable: PatternVariable) => variable === 'precio_cop_kwh' ? formatPriceCOPPerKWh(value) : formatEnergyKWh(value)

function Recurrence({ pattern, variable }: { pattern: RecurrencePattern; variable: PatternVariable }) {
 const rows = pattern.metrics.periods
 if (!rows.length) return <p>No hay grupos de recurrencia disponibles.</p>
 const min = Math.min(0, ...rows.map(row => row.mean)), max = Math.max(0, ...rows.map(row => row.mean))
 const span = max-min || 1, y = (value: number) => 170 - (value-min)/span*145
 return <><p>Promedios por {pattern.metrics.grouping === '1-24' ? 'franja horaria' : 'día de la semana'}. Cada grupo contiene al menos dos observaciones; no constituye un pronóstico.</p>
 <figure className="pattern-chart"><svg viewBox="0 0 720 215" role="img" aria-label="Promedio observado por grupo de recurrencia">
 <line x1="20" x2="700" y1={y(0)} y2={y(0)} stroke="currentColor" opacity="0.3" />
 {rows.map((row,index) => { const width = 680/rows.length, top = Math.min(y(0),y(row.mean)); return <g key={row.key}><rect x={20+index*width+width*.18} y={top} width={width*.64} height={Math.max(Math.abs(y(row.mean)-y(0)),1)} fill="#267355"><title>{`${recurrenceLabel(row.key,pattern.metrics.grouping)}: ${formatValue(row.mean,variable)} · ${row.count} observaciones`}</title></rect><text x={20+(index+.5)*width} y="195" textAnchor="middle" fontSize="11">{pattern.metrics.grouping === '1-24' ? row.key : recurrenceLabel(row.key,pattern.metrics.grouping).slice(0,3)}</text></g> })}
 </svg><figcaption>Altura: media observada en {variable === 'precio_cop_kwh' ? 'COP/kWh' : 'kWh'}. Valores exactos y tamaño de muestra en la tabla. {pattern.metrics.grouping === '1-24' && 'Períodos 1–24: 00:00–01:00 a 23:00–24:00.'}</figcaption></figure>
 <details><summary>Ver valores de recurrencia</summary><div className="table-wrap"><table className="data-table"><thead><tr><th>Grupo</th><th>Observaciones</th><th>Media</th><th>Mínimo</th><th>Máximo</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><th scope="row">{recurrenceLabel(row.key,pattern.metrics.grouping)}</th><td>{row.count}</td><td>{formatValue(row.mean,variable)}</td><td>{formatValue(row.min,variable)}</td><td>{formatValue(row.max,variable)}</td></tr>)}</tbody></table></div></details></>
}

export function PatternResults({ analysis }: { analysis: PatternAnalysisResponse | PatternAnalysis }) {
 const persistence = 'persistence' in analysis ? analysis.persistence.persistence : 'persisted'
 return <section className="panel pattern-results" aria-label="Detalle del análisis"><SectionHeader eyebrow="Resultado descriptivo" title="Análisis de patrones" description={patternVariables[analysis.variable]} />
 <div className="pattern-summary"><StatusBadge tone={statusTone(analysis.status)}>{patternStatuses[analysis.status]}</StatusBadge><span>{formatNumberCO(analysis.sampleSize)} observaciones</span><span>{analysis.period.from ?? 'Sin fecha'} — {analysis.period.to ?? 'Sin fecha'}</span></div>
 <p role={persistence === 'failed' ? 'alert' : 'status'} className={persistence === 'failed' ? 'pattern-warning' : 'pattern-saved'}>{persistence === 'failed' ? 'Análisis calculado, pero no se pudo guardar. Este resultado no estará disponible en el histórico.' : 'Análisis guardado correctamente.'}</p>
 {analysis.patterns.length === 0 && <p>No hay patrones calculables con esta muestra.</p>}
 {analysis.patterns.map(pattern => <article className="pattern-block" key={pattern.type}><h3>{pattern.type === 'distribution' ? 'Distribución de los valores' : pattern.type === 'trend' ? 'Tendencia de la muestra' : 'Recurrencia observada'}</h3>
 {pattern.type === 'distribution' && <dl className="pattern-metrics">{([['Mínimo',pattern.metrics.min],['Máximo',pattern.metrics.max],['Media',pattern.metrics.mean],['Mediana',pattern.metrics.median],['Desviación estándar muestral',pattern.metrics.standardDeviation]] as const).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{formatValue(value,analysis.variable)}</dd></div>)}</dl>}
 {pattern.type === 'trend' && <><p className="pattern-direction">{patternDirections[pattern.metrics.direction]}</p><p>Pendiente: {formatValue(pattern.metrics.slope,analysis.variable)} por observación ordenada.</p><p>No representa necesariamente un cambio diario: se calcula sobre el orden de los registros, sin ajustar los intervalos de tiempo.</p></>}
 {pattern.type === 'recurrence' && <Recurrence pattern={pattern} variable={analysis.variable} />}
 </article>)}
 {analysis.warnings.length > 0 && <aside className="pattern-warning" aria-label="Limitaciones del análisis"><h3>Limitaciones de la muestra</h3><ul>{analysis.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></aside>}
 <details><summary>Método y trazabilidad</summary><p>Método: {analysis.method.id} · versión {analysis.method.version}. Estadística descriptiva determinista.</p><p>Referencia: {analysis.analysisId}</p><ul>{analysis.patterns.map(pattern => <li key={pattern.type}>{pattern.description}</li>)}</ul><p>No es una predicción de Ridge o Chronos ni acredita causalidad o significancia estadística.</p></details>
 </section>
}

export function Patterns() {
 const { user } = useSyncExternalStore(authStore.subscribe,authStore.getSnapshot,authStore.getSnapshot)
 const isAdmin = user?.role === 'ADMIN'
 const [preparedId,setPreparedId] = useState(''), [filters,setFilters] = useState<PatternFilters>({})
 const [history,setHistory] = useState<PatternAnalysis[]>([]), [historyState,setHistoryState] = useState<'loading'|'success'|'error'>('loading')
 const [analysisError,setAnalysisError] = useState(''), [historyError,setHistoryError] = useState('')
 const [result,setResult] = useState<PatternAnalysisResponse | PatternAnalysis | null>(null), [analyzing,setAnalyzing] = useState(false), [refresh,setRefresh] = useState(0)
 const resultRef = useRef<HTMLDivElement>(null)
 const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to)
 useEffect(() => {
   if (invalidRange || !isAdmin) return
   const controller = new AbortController()
   getPatterns(filters,controller.signal).then(value => { if (!controller.signal.aborted) { setHistory(value);setHistoryError('');setHistoryState('success') } }).catch(reason => { if (!controller.signal.aborted) { setHistoryError(errorMessage(reason));setHistoryState('error') } })
   return () => controller.abort()
 },[filters,refresh,invalidRange,isAdmin])
 function changeFilters(next: PatternFilters) { setHistoryState('loading');setHistoryError('');setFilters(next) }
 async function submit(event: FormEvent<HTMLFormElement>) {
   event.preventDefault()
   const id = Number(preparedId)
   if (!Number.isSafeInteger(id) || id < 1) { setAnalysisError('Selecciona un dataset compatible.');return }
   setAnalyzing(true);setAnalysisError('');setResult(null)
   try { const analysis = await analyzePatterns(id);setResult(analysis);if (analysis.persistence.persistence === 'persisted') { setHistoryState('loading');setRefresh(value => value+1) } }
   catch(reason) { setAnalysisError(errorMessage(reason)) } finally { setAnalyzing(false) }
 }
 const columns: DataTableColumn<PatternAnalysis>[] = [
  { header:'Variable',render:row => <strong>{patternVariables[row.variable]}</strong> },
  { header:'Período analizado',render:row => `${row.period.from ?? 'Sin fecha'} — ${row.period.to ?? 'Sin fecha'}` },
  { header:'Observaciones',render:row => formatNumberCO(row.sampleSize) },
  { header:'Estado',render:row => <StatusBadge tone={statusTone(row.status)}>{patternStatuses[row.status]}</StatusBadge> },
  { header:'Registrado',render:row => row.createdAt ? new Date(row.createdAt).toLocaleString('es-CO') : 'No disponible' },
  { header:'Detalle',render:row => <button type="button" className="secondary-button" disabled={analyzing} onClick={() => { setResult(row);requestAnimationFrame(() => { resultRef.current?.scrollIntoView({block:'start'});resultRef.current?.focus() }) }}>Ver análisis</button> },
 ]
 return <div className="page-grid patterns-workspace"><section className="panel"><SectionHeader eyebrow="Reconocimiento de patrones" title="Comprende el comportamiento de tus datos" description="Explora distribución, tendencia y recurrencia de generación, demanda y precios. Análisis descriptivo; no genera pronósticos." />
 <form className="marketplace-form pattern-form" onSubmit={submit} aria-busy={analyzing}><PreparedDatasetSelect value={preparedId} onChange={setPreparedId} requirements={patternRequirements} /><button type="submit" className="primary-button" disabled={analyzing || !preparedId}>{analyzing ? 'Analizando…' : 'Analizar patrones'}</button></form><p>Elige un dataset XM compatible. Ejecutar el análisis intentará guardar su resultado; abrir un análisis del histórico solo consulta los datos existentes.</p></section>
 {analysisError && <section className="panel" role="alert">{analysisError}</section>}
 <div ref={resultRef} tabIndex={-1} className="pattern-result-anchor">{result && <PatternResults analysis={result} />}</div>
 {isAdmin && <section className="panel"><SectionHeader eyebrow="Histórico" title="Análisis registrados" description="Los filtros de fecha buscan análisis cuyo período de datos se cruza con el intervalo elegido; no filtran la fecha de ejecución." />
 <div className="pattern-filters"><label>Desde<input type="date" value={filters.from ?? ''} onChange={event => changeFilters({...filters,from:event.target.value || undefined})} /></label><label>Hasta<input type="date" value={filters.to ?? ''} onChange={event => changeFilters({...filters,to:event.target.value || undefined})} /></label><label>Tipo de datos<select value={filters.dataType ?? ''} onChange={event => changeFilters({...filters,dataType:(event.target.value || undefined) as PatternDataType | undefined})}><option value="">Todos los tipos</option><option value="generacion">Generación</option><option value="demanda">Demanda</option><option value="precios">Precios</option></select></label><label>Variable<select value={filters.variable ?? ''} onChange={event => changeFilters({...filters,variable:(event.target.value || undefined) as PatternVariable | undefined})}><option value="">Todas las variables</option><option value="energia_kwh">Generación (kWh)</option><option value="demanda_kwh">Demanda (kWh)</option><option value="precio_cop_kwh">Precio (COP/kWh)</option></select></label><button type="button" className="secondary-button" onClick={() => { changeFilters({});setRefresh(value => value+1) }}>Limpiar filtros</button></div>
 {invalidRange ? <p role="alert" className="pattern-warning">Desde debe ser anterior o igual a Hasta.</p> : <>{historyState === 'loading' && <p role="status">Cargando análisis registrados…</p>}{historyState === 'error' && <div role="alert"><p>{historyError}</p><button type="button" className="secondary-button" onClick={() => { setHistoryState('loading');setRefresh(value => value+1) }}>Reintentar histórico</button></div>}{historyState === 'success' && (history.length === 0 ? <p>No hay análisis registrados para estos filtros.</p> : <DataTable columns={columns} rows={history} getRowKey={row => row.analysisId} />)}</>}
 </section>}</div>
}

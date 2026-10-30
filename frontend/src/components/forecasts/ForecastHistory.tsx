import './ForecastInsights.css'
import './ForecastPanel.css'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../services/apiClient'
import { getForecastHistory, getForecastHistoryDetail, evaluateForecastHistory, type HistoryDetail, type HistoryFilters, type HistoryList, type HistorySeries, type HistoryMethod } from '../../services/forecastHistoryService'
import { SeriesChart } from '../charts/SeriesChart'
import { formatDateCO, formatEnergyKWh, formatPriceCOPPerKWh, formatPercentCO } from '../../utils/numberFormat'
import { xmPeriodLabel } from '../../utils/forecastInsights'
import './ForecastHistory.css'
const seriesLabels={supply:'Oferta · Gene',demand:'Demanda horaria · DemaReal',daily:'Demanda diaria · DemaSIN',price:'Precio · PrecBolsNaci'}
const methodLabels={ridge:'Ridge',chronos2:'Chronos-2',bolt:'Chronos-Bolt',b1:'B1'}
const message=(e:unknown)=>e instanceof ApiError?e.serverMessage??e.message:'No fue posible consultar el seguimiento.'
const time=(v:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'}).format(new Date(v))
export function ForecastHistoryDetail({ detail, evaluating, onEvaluate, error }: { detail:HistoryDetail; evaluating:boolean; onEvaluate:()=>void; error?:string }) {
  const format=detail.series==='price'?formatPriceCOPPerKWh:formatEnergyKWh, a=detail.evaluation
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const future=detail.targetDate>=today
  const quantiles=detail.predictions.some(p=>p.low!==undefined)
  const point=(p:{period:number;value:number})=>({key:String(p.period),label:detail.series==='daily'?formatDateCO(detail.targetDate):`P${p.period}`,value:p.value,detail:`${formatDateCO(detail.targetDate)}${detail.series==='daily'?'':` · ${xmPeriodLabel(p.period)}`}: ${format(p.value)}`})
  return <section className="panel forecast-history-detail" aria-label="Detalle del pronóstico registrado">
    <h3>{methodLabels[detail.method]} · {seriesLabels[detail.series]} · {formatDateCO(detail.targetDate)}</h3>
    <dl className="forecast-metadata"><div><dt>Origen de los datos</dt><dd>{formatDateCO(detail.originDate)}</dd></div><div><dt>Horizonte desde el origen</dt><dd>{detail.horizonDays} {detail.horizonDays===1?'día':'días'}</dd></div><div><dt>Registrado (Colombia)</dt><dd>{time(detail.createdAt)}</dd></div><div><dt>Estado</dt><dd>{detail.status==='evaluated'?'Evaluado con XM':'Pendiente de datos reales'}</dd></div></dl>
    {detail.status==='pending' && <div className="forecast-history-evaluate"><p>{future?'El día objetivo aún no ha finalizado en Colombia.':'Consulta XM para comprobar si ya publicó todas las observaciones del día objetivo.'}</p>{detail.lastCheckStatus==='not_published' && <p role="status">XM no tenía un día completo disponible en la última consulta.</p>}{detail.lastCheckedAt && <p>Última comprobación: {time(detail.lastCheckedAt)} (Colombia).</p>}<button type="button" className="primary-button" disabled={future||evaluating} onClick={onEvaluate}>{evaluating?'Evaluando con XM…':'Evaluar con datos XM'}</button></div>}
    {error && <p role="alert">{error} El pronóstico original se conserva.</p>}
    <SeriesChart title={a?'Pronóstico registrado y valor real del mismo día':'Pronóstico registrado'} description={a?'Misma variable, fecha y periodos XM. El error se calcula sobre el pronóstico original; P50 en Chronos.':'El pronóstico se conserva como se generó. Aún no hay una evaluación completa para este día.'} unit={detail.unit} state={{kind:'success',lines:[{id:'forecast',label:quantiles?'Pronóstico P50':'Pronóstico',color:'#b17800',dash:'5 4',points:detail.predictions.map(point)},...(quantiles?[{id:'low',label:'P10 experimental',color:'#8a6c3e',dash:'2 4',points:detail.predictions.map(p=>point({period:p.period,value:p.low!}))},{id:'high',label:'P90 experimental',color:'#8a6c3e',dash:'2 4',points:detail.predictions.map(p=>point({period:p.period,value:p.high!}))}]:[]),...(a?[{id:'actual',label:'Real XM · día objetivo',color:'#1e5945',points:a.rows.map(p=>point({period:p.period,value:p.actual}))}]:[])]}} />
    {a && <><h4>Errores de esta ejecución</h4><dl className="forecast-summary"><div><dt>MAE</dt><dd>{format(a.metrics.MAE)}</dd></div><div><dt>RMSE</dt><dd>{format(a.metrics.RMSE)}</dd></div><div><dt>WAPE</dt><dd>{a.metrics.WAPE===null?'No definido: total real igual a cero':formatPercentCO(a.metrics.WAPE)}</dd></div><div><dt>Sesgo</dt><dd>{format(a.metrics.bias)}</dd></div></dl><p>Fuente: {a.source}. Observaciones consultadas: {time(a.checkedAt)} (Colombia). Evaluación de una sola ejecución; no sustituye las métricas históricas ni permite comparar modelos con fechas u horizontes diferentes.</p></>}
    <div className="table-scroll" role="region" aria-label="Tabla de seguimiento por periodo" tabIndex={0}><table><caption>{formatDateCO(detail.targetDate)} · {detail.unit}. Error = pronóstico − real. Valores reales pendientes nunca se sustituyen por cero.</caption><thead><tr><th scope="col">{detail.series==='daily'?'Día XM':'Periodo XM / hora'}</th><th scope="col">{quantiles?'Pronóstico P50':'Pronóstico'}</th>{quantiles&&<><th scope="col">P10</th><th scope="col">P90</th></>}<th scope="col">Real del día objetivo</th><th scope="col">Error</th><th scope="col">Error absoluto</th></tr></thead><tbody>{detail.predictions.map(p=>{const row=a?.rows.find(r=>r.period===p.period);return <tr key={p.period}><th scope="row">{detail.series==='daily'?formatDateCO(detail.targetDate):`P${p.period} · ${xmPeriodLabel(p.period)}`}</th><td>{format(p.value)}</td>{quantiles&&<><td>{format(p.low!)}</td><td>{format(p.high!)}</td></>}<td>{row?format(row.actual):'Pendiente'}</td><td>{row?format(row.error):'No calculable'}</td><td>{row?format(row.absoluteError):'No calculable'}</td></tr>})}</tbody></table></div>
    <details><summary>Modelo y trazabilidad del seguimiento</summary><p>{detail.modelId} · versión {detail.modelVersion}</p><p>Registro: {detail.id}</p><p>SHA256 del pronóstico: {detail.forecastSha256}</p>{a&&<p>SHA256 de las observaciones: {a.observationSha256}</p>}<p>El registro y su primera evaluación completa se conservan sin sobrescribir. XM puede revisar sus publicaciones posteriormente.</p></details>
  </section>
}
export function ForecastHistory() {
  const [draft,setDraft]=useState<HistoryFilters>({}),[filters,setFilters]=useState<HistoryFilters>({page:1}),[revision,setRevision]=useState(0)
  const [list,setList]=useState<HistoryList|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const [detail,setDetail]=useState<HistoryDetail|null>(null),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState(''),[evaluating,setEvaluating]=useState(false)
  const detailRequest=useRef<AbortController|null>(null)
  useEffect(()=>{
    const controller=new AbortController()
    getForecastHistory(filters,controller.signal).then(v=>{if(!controller.signal.aborted){setList(v);setError('')}}).catch(e=>{if(!controller.signal.aborted){setList(null);setError(message(e))}}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[filters,revision])
  useEffect(()=>()=>detailRequest.current?.abort(),[])
  async function open(id:string) {
    detailRequest.current?.abort();const controller=new AbortController();detailRequest.current=controller;setDetail(null);setDetailError('');setDetailLoading(true);setEvaluating(false)
    try{const value=await getForecastHistoryDetail(id,controller.signal);if(!controller.signal.aborted)setDetail(value)}catch(e){if(!controller.signal.aborted)setDetailError(message(e))}finally{if(!controller.signal.aborted)setDetailLoading(false);if(detailRequest.current===controller)detailRequest.current=null}
  }
  async function evaluate() {
    if(!detail || evaluating || detailRequest.current)return
    const controller=new AbortController();detailRequest.current=controller;setEvaluating(true);setDetailError('')
    try{const value=await evaluateForecastHistory(detail.id,controller.signal);if(!controller.signal.aborted){setDetail(value);setLoading(true);setRevision(v=>v+1)}}catch(e){if(!controller.signal.aborted)setDetailError(message(e))}finally{if(!controller.signal.aborted)setEvaluating(false);if(detailRequest.current===controller)detailRequest.current=null}
  }
  function page(n:number){setLoading(true);setFilters(v=>({...v,page:n}))}
  const invalidRange=!!(draft.from&&draft.to&&draft.from>draft.to)
  return <div className="forecast-history-workspace"><section className="panel"><h2>Seguimiento de pronósticos</h2><p>Consulta tus predicciones registradas y evalúalas cuando XM publique el día objetivo completo. Solo se registran las nuevas ejecuciones realizadas con el servidor actualizado; no se reconstruyen predicciones antiguas.</p>
    <form className="forecast-history-filters" onSubmit={e=>{e.preventDefault();if(invalidRange)return;setLoading(true);setFilters({...draft,page:1})}}>
      <label>Fecha objetivo desde<input type="date" value={draft.from??''} onChange={e=>setDraft(v=>({...v,from:e.target.value||undefined}))}/></label><label>Fecha objetivo hasta<input type="date" value={draft.to??''} onChange={e=>setDraft(v=>({...v,to:e.target.value||undefined}))}/></label>
      <label>Variable<select value={draft.series??''} onChange={e=>setDraft(v=>({...v,series:(e.target.value||undefined) as HistorySeries|undefined}))}><option value="">Todas</option>{Object.entries(seriesLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Modelo<select value={draft.method??''} onChange={e=>setDraft(v=>({...v,method:(e.target.value||undefined) as HistoryMethod|undefined}))}><option value="">Todos</option>{Object.entries(methodLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Estado<select value={draft.status??''} onChange={e=>setDraft(v=>({...v,status:(e.target.value||undefined) as 'pending'|'evaluated'|undefined}))}><option value="">Todos</option><option value="pending">Pendiente</option><option value="evaluated">Evaluado</option></select></label><button className="primary-button" disabled={loading||invalidRange}>Consultar historial</button>
    </form>{invalidRange&&<p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>}
    {loading?<p role="status">Cargando tus pronósticos registrados…</p>:error?<div role="alert"><p>{error}</p><button className="secondary-button" onClick={()=>{setLoading(true);setRevision(v=>v+1)}}>Reintentar historial</button></div>:list&&<>{list.items.length===0?<p role="status">No hay pronósticos registrados para estos filtros. Genera uno en Predicciones para comenzar el seguimiento.</p>:<div className="table-scroll" role="region" aria-label="Historial de pronósticos" tabIndex={0}><table><thead><tr><th>Fecha objetivo</th><th>Variable</th><th>Modelo / horizonte</th><th>Registrado (Colombia)</th><th>Estado</th><th>MAE</th><th>WAPE</th><th>Detalle</th></tr></thead><tbody>{list.items.map(row=><tr key={row.id}><td>{formatDateCO(row.targetDate)}</td><td>{seriesLabels[row.series]}</td><td>{methodLabels[row.method]} · h{row.horizonDays}</td><td>{time(row.createdAt)}</td><td>{row.status==='evaluated'?'Evaluado':'Pendiente'}</td><td>{row.metrics?(row.series==='price'?formatPriceCOPPerKWh:formatEnergyKWh)(row.metrics.MAE):'Pendiente'}</td><td>{row.metrics?row.metrics.WAPE===null?'No definido':formatPercentCO(row.metrics.WAPE):'Pendiente'}</td><td><button className="secondary-button" disabled={evaluating||detailLoading} onClick={()=>open(row.id)}>Ver detalle</button></td></tr>)}</tbody></table></div>}
    <nav aria-label="Paginación del historial" className="forecast-history-pagination"><button className="secondary-button" disabled={list.page===1} onClick={()=>page(list.page-1)}>Anterior</button><span>Página {list.page} · {list.total} {list.total===1?'registro':'registros'}</span><button className="secondary-button" disabled={list.page*20>=list.total} onClick={()=>page(list.page+1)}>Siguiente</button></nav></>}
  </section>{detailLoading&&<p role="status">Cargando el pronóstico guardado…</p>}{!detail&&detailError&&<p role="alert">{detailError}</p>}{detail&&<ForecastHistoryDetail detail={detail} evaluating={evaluating} onEvaluate={evaluate} error={detailError}/>}</div>
}

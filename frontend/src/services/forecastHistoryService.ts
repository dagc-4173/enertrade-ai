import { ApiError, apiRequest, postJson } from './apiClient'
import type { ForecastRow } from '../utils/forecastInsights'
export type HistorySeries = 'supply' | 'demand' | 'price' | 'daily'
export type HistoryMethod = 'ridge' | 'chronos2' | 'bolt' | 'b1'
export type HistoryMetrics = { MAE: number; RMSE: number; WAPE: number | null; bias: number; n: number }
export type HistoryEvaluation = { source: string; checkedAt: string; observationSha256: string; forecastSha256: string; metrics: HistoryMetrics; rows: (ForecastRow & { actual: number; error: number; absoluteError: number })[] }
export type HistoryEntry = { id: string; createdAt: string; targetDate: string; originDate: string; series: HistorySeries; method: HistoryMethod; modelId: string; modelVersion: string; source: string; unit: string; horizonDays: number; forecastSha256: string; status: 'pending' | 'evaluated'; evaluatedAt: string | null; lastCheckedAt: string | null; lastCheckStatus: string | null; metrics: HistoryMetrics | null }
export type HistoryDetail = HistoryEntry & { predictions: ForecastRow[]; evaluation: HistoryEvaluation | null }
export type HistoryList = { items: HistoryEntry[]; page: number; pageSize: number; total: number }
export type HistoryFilters = { page?: number; from?: string; to?: string; series?: HistorySeries; method?: HistoryMethod; status?: 'pending' | 'evaluated' }
export type HistorySaveState = { status: 'saved' | 'failed' | 'not_registered'; id: string | null }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)
const day = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v
const instant = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const metrics = (v: unknown): v is HistoryMetrics => object(v) && finite(v.MAE) && v.MAE >= 0 && finite(v.RMSE) && v.RMSE >= 0 && finite(v.bias) && (v.WAPE === null || finite(v.WAPE) && v.WAPE >= 0) && Number.isInteger(v.n) && (v.n as number) > 0
const bad = (): never => { throw new ApiError('response','El historial no cumple el contrato esperado.') }
export function parseHistoryEntry(v: unknown): HistoryEntry {
  if (!object(v) || !uuid(v.id) || !instant(v.createdAt) || !day(v.targetDate) || !day(v.originDate) || !['supply','demand','price','daily'].includes(v.series as string) || !['ridge','chronos2','bolt','b1'].includes(v.method as string) || typeof v.modelId !== 'string' || typeof v.modelVersion !== 'string' || !Number.isInteger(v.horizonDays) || (v.horizonDays as number) < 1 || (v.horizonDays as number) > 7 || (Date.parse(v.targetDate)-Date.parse(v.originDate))/86400000 !== v.horizonDays || v.unit !== (v.series==='price'?'COP/kWh':'kWh') || v.source !== `XM ${{supply:'Gene',demand:'DemaReal',price:'PrecBolsNaci',daily:'DemaSIN'}[v.series as HistorySeries]}/Sistema` || !hash(v.forecastSha256) || !['pending','evaluated'].includes(v.status as string) || (v.status==='evaluated' ? !instant(v.evaluatedAt) || !metrics(v.metrics) : v.evaluatedAt!==null || v.metrics!==null) || !(v.lastCheckedAt===null || instant(v.lastCheckedAt)) || !(v.lastCheckStatus===null || typeof v.lastCheckStatus==='string')) return bad()
  return v as unknown as HistoryEntry
}
function points(v: unknown, expected: number): v is ForecastRow[] {
  return Array.isArray(v) && v.length===expected && v.every((r,i)=>object(r) && r.period===i+1 && finite(r.value) && (r.low===undefined && r.high===undefined || finite(r.low) && finite(r.high) && r.low<=r.value && r.high>=r.value))
}
export function parseHistoryDetail(v: unknown): HistoryDetail {
  const e=parseHistoryEntry(v), d=v as unknown as HistoryDetail
  const count=e.series==='daily'?1:24
  if(!points(d.predictions,count)) return bad()
  if(e.status==='pending'){if(d.evaluation!==null)return bad()}
  else {
    const a=d.evaluation
    if(!object(a) || a.source!==e.source || !instant(a.checkedAt) || a.forecastSha256!==e.forecastSha256 || !hash(a.observationSha256) || !metrics(a.metrics) || a.metrics.n!==count || !points(a.rows,count) || a.rows.some((r,i)=>r.value!==d.predictions[i]!.value || r.low!==d.predictions[i]!.low || r.high!==d.predictions[i]!.high || !finite(r.actual) || !finite(r.error) || !finite(r.absoluteError) || r.absoluteError<0 || Math.abs(r.error-(r.value-r.actual))>1e-6 || Math.abs(r.absoluteError-Math.abs(r.error))>1e-6))return bad()
  }
  return d
}
export function parseHistoryList(v: unknown): HistoryList {
  if(!object(v) || !Array.isArray(v.items) || !Number.isInteger(v.total) || (v.total as number)<0 || !Number.isInteger(v.page) || (v.page as number)<1 || v.pageSize!==20 || v.items.length>20 || v.items.length>(v.total as number))return bad()
  return {...v,items:v.items.map(parseHistoryEntry)} as HistoryList
}
export async function getForecastHistory(filters: HistoryFilters={}, signal?: AbortSignal) {
  const q=new URLSearchParams(Object.entries(filters).filter(([,v])=>v!==undefined && v!=='').map(([k,v])=>[k,String(v)]))
  return parseHistoryList((await apiRequest(`/forecast-history?${q}`,{credentials:'include',signal})).data)
}
export async function getForecastHistoryDetail(id: string,signal?: AbortSignal) {
  const result=parseHistoryDetail((await apiRequest(`/forecast-history/${encodeURIComponent(id)}`,{credentials:'include',signal})).data)
  if(result.id!==id)return bad()
  return result
}
export async function evaluateForecastHistory(id: string,signal?: AbortSignal) {
  const result=parseHistoryDetail((await postJson(`/forecast-history/${encodeURIComponent(id)}/evaluate`,{},{credentials:'include',signal})).data)
  if(result.id!==id)return bad()
  return result
}

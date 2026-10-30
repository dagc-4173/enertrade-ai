import { isDate, isObject } from '@/integrations/types/external-data';
export type HistorySeries = 'supply' | 'demand' | 'price' | 'daily';
export type HistoryMethod = 'ridge' | 'chronos2' | 'bolt' | 'b1';
export type HistoryPoint = { period: number; value: number; low?: number; high?: number };
export type HistorySnapshot = { series: HistorySeries; method: HistoryMethod; modelId: string; modelVersion: string; source: string; unit: string; targetDate: string; originDate: string; horizonDays: number; predictions: HistoryPoint[]; traceId?: string; artifactSha256?: string };
export const historyDefinitions = { supply: { metric: 'Gene', unit: 'kWh' }, demand: { metric: 'DemaReal', unit: 'kWh' }, daily: { metric: 'DemaSIN', unit: 'kWh' }, price: { metric: 'PrecBolsNaci', unit: 'COP/kWh' } } as const;
export class ForecastHistoryError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const historyDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
const invalid = (): never => { throw new ForecastHistoryError(422, 'INVALID_FORECAST_SNAPSHOT', 'El resultado no cumple el contrato de seguimiento.'); };
export function snapshotForecast(raw: unknown): HistorySnapshot {
  if (!isObject(raw) || raw.status !== 'available' || !isDate(raw.targetDate)) return invalid();
  let series: HistorySeries, method: HistoryMethod, origin: unknown, rows: unknown, modelId: unknown = raw.modelId, modelVersion: unknown = raw.modelVersion;
  let mapper: (r: Record<string, unknown>) => HistoryPoint;
  if (raw.forecastType === 'generation_availability_proxy') {
    series = 'supply'; method = 'ridge'; origin = raw.forecastOriginDate; rows = raw.predictions;
    mapper = r => ({ period: r.hora_xm as number, value: r.energia_kwh as number });
  } else if (raw.forecastType === 'aggregate_demand_proxy') {
    series = 'daily'; method = 'ridge'; origin = raw.forecastOriginDate;
    rows = isObject(raw.prediction) ? [{ period: 1, value: raw.prediction.demanda_kwh }] : [];
    mapper = r => ({ period: r.period as number, value: r.value as number });
  } else if (raw.forecastType === 'market_reference_price' && isObject(raw.rule)) {
    series = 'price'; method = 'b1'; modelId = raw.rule.id; modelVersion = raw.rule.version;
    origin = new Date(Date.parse(raw.targetDate) - 86400000).toISOString().slice(0, 10); rows = raw.predictions;
    mapper = r => ({ period: r.periodo as number, value: r.precio_cop_kwh as number });
  } else if (raw.method === 'ridge' && (raw.series === 'demand' || raw.series === 'price')) {
    series = raw.series; method = 'ridge'; origin = raw.latestObservedDate; rows = raw.predictions;
    mapper = r => ({ period: r.periodo as number, value: r.value as number });
  } else if ((raw.model === 'chronos2' || raw.model === 'bolt') && ['supply','demand','price'].some(s => raw.forecastType === `experimental_hourly_system_${s}`)) {
    series = (raw.forecastType as string).replace('experimental_hourly_system_', '') as HistorySeries;
    method = raw.model; origin = raw.latestObservedDate; rows = raw.predictions;
    mapper = r => ({ period: r.periodo as number, value: r.q50 as number, low: r.q10 as number, high: r.q90 as number });
  } else return invalid();
  if (!text(modelId) || !text(modelVersion) || !isDate(origin) || raw.unit !== historyDefinitions[series].unit || !Number.isInteger(raw.horizonDays) || (raw.horizonDays as number) < 1 || (raw.horizonDays as number) > 7 || (Date.parse(raw.targetDate) - Date.parse(origin)) / 86400000 !== raw.horizonDays || !Array.isArray(rows) || rows.length !== (series === 'daily' ? 1 : 24) || rows.some(r => !isObject(r))) return invalid();
  const predictions = rows.map(r => mapper(r));
  if (predictions.some((r, i) => r.period !== i + 1 || !finite(r.value) || ((method === 'chronos2' || method === 'bolt') && (!finite(r.low) || !finite(r.high) || r.low > r.value || r.high < r.value)))) return invalid();
  const traceId = isObject(raw.trace) && typeof raw.trace.executionId === 'string' ? raw.trace.executionId : undefined;
  return { series, method, modelId, modelVersion, source: `XM ${historyDefinitions[series].metric}/Sistema`, unit: historyDefinitions[series].unit, targetDate: raw.targetDate, originDate: origin, horizonDays: raw.horizonDays as number, predictions, ...(traceId ? { traceId } : {}), ...(typeof raw.artifactSha256 === 'string' ? { artifactSha256: raw.artifactSha256 } : {}) };
}
export function historyErrors(forecast: HistoryPoint[], observed: { period: number; value: number }[]) {
  const real = new Map(observed.map(r => [r.period, r.value]));
  if (!forecast.length || forecast.length !== observed.length || real.size !== observed.length || forecast.some(r => !real.has(r.period))) return invalid();
  const rows = forecast.map(r => ({ ...r, actual: real.get(r.period)!, error: r.value - real.get(r.period)!, absoluteError: Math.abs(r.value - real.get(r.period)!) }));
  if (rows.some(r => !finite(r.actual) || !finite(r.error))) return invalid();
  const abs = rows.reduce((s, r) => s + r.absoluteError, 0), total = rows.reduce((s, r) => s + Math.abs(r.actual), 0);
  return { rows, metrics: { MAE: abs / rows.length, RMSE: Math.sqrt(rows.reduce((s, r) => s + r.error ** 2, 0) / rows.length), bias: rows.reduce((s, r) => s + r.error, 0) / rows.length, WAPE: total === 0 ? null : abs / total * 100, n: rows.length } };
}
export type HistoryFilters = { page: number; series?: HistorySeries; method?: HistoryMethod; status?: 'pending' | 'evaluated'; from?: string; to?: string };
export function historyFilters(q: unknown): HistoryFilters {
  if (!isObject(q) || Object.keys(q).some(k => !['page','series','method','status','from','to'].includes(k))) throw new ForecastHistoryError(400,'INVALID_HISTORY_FILTERS','Los filtros del historial no son válidos.');
  const page = q.page === undefined ? 1 : typeof q.page === 'string' && /^\d+$/.test(q.page) ? Number(q.page) : NaN;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || (q.series !== undefined && (typeof q.series !== 'string' || !Object.hasOwn(historyDefinitions, q.series))) || (q.method !== undefined && !['ridge','chronos2','bolt','b1'].includes(q.method as string)) || (q.status !== undefined && !['pending','evaluated'].includes(q.status as string)) || (q.from !== undefined && !isDate(q.from)) || (q.to !== undefined && !isDate(q.to)) || (typeof q.from === 'string' && typeof q.to === 'string' && q.from > q.to)) throw new ForecastHistoryError(400,'INVALID_HISTORY_FILTERS','Revisa las fechas y filtros del historial.');
  return { ...q, page } as HistoryFilters;
}

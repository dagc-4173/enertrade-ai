import { ExternalDataService } from '@/integrations/external-data.service';
import { XmProvider } from '@/integrations/providers/xm.provider';
import { normalizeHourlyDemand, requestXmHourly } from '@/integrations/xm-hourly-demand-acquisition';
import { ExternalDataError, isDate, isObject } from '@/integrations/types/external-data';
import { EnergySeriesError } from './energy-series.service';

const definitions = { supply: { metric: 'Gene', unit: 'kWh' }, demand: { metric: 'DemaReal', unit: 'kWh' }, price: { metric: 'PrecBolsNaci', unit: 'COP/kWh' }, daily: { metric: 'DemaSIN', unit: 'kWh' } } as const;
type Series = keyof typeof definitions;
type Row = { date: string; hour: number | null; value: number };
const external = new ExternalDataService([new XmProvider()]);
async function query(series: Series, date: string): Promise<Row[]> {
  if (series !== 'demand') return (await external.query({ provider: 'xm', dataset: definitions[series].metric, startDate: date, endDate: date })).records;
  const raw = await requestXmHourly('/hourly', { MetricId: 'DemaReal', Entity: 'Sistema', StartDate: date, EndDate: date, Filter: [] }, fetch, 15000);
  let body: unknown;
  try { body = JSON.parse(raw.rawBody); } catch { throw new EnergySeriesError(502, 'INVALID_XM_OBSERVATIONS', 'XM devolvió una respuesta no válida.'); }
  if (isObject(body) && isObject(body.Metric) && body.Metric.Id === 'DemaReal' && Array.isArray(body.Items) && body.Items.length === 0) return [];
  return normalizeHourlyDemand(raw.rawBody, { startDate: date, endDate: date }).records.map(r => ({ date: r.fecha_xm, hour: r.periodo, value: r.demanda_real_kwh }));
}
export function createForecastObservationsService(read = query, now = () => new Date()) {
  const pending = new Map<string, Promise<unknown>>();
  return {
    async read(input: unknown) {
      if (!isObject(input) || Object.keys(input).length !== 2 || typeof input.series !== 'string' || !Object.hasOwn(definitions, input.series) || !isDate(input.date) || input.date < '2000-01-01') throw new EnergySeriesError(400, 'INVALID_FORECAST_OBSERVATIONS', 'Selecciona una variable y fecha válidas.');
      const series = input.series as Series, date = input.date, definition = definitions[series];
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
      const base = { series, date, source: `XM ${definition.metric}/Sistema`, unit: definition.unit };
      // Never compare a future forecast with the day of origin or an unfinished day.
      if (date >= today) return { ...base, status: 'pending', checkedAt: null, points: [] };
      const key = `${series}/${date}`;
      if (pending.has(key)) return pending.get(key);
      if (pending.size >= 2) throw new EnergySeriesError(429, 'FORECAST_OBSERVATIONS_BUSY', 'Hay otras consultas XM en curso. Intenta de nuevo.');
      const task = (async () => {
        const rows = await read(series, date), expected = series === 'daily' ? 1 : 24;
        if (rows.length === 0) return { ...base, status: 'unavailable', checkedAt: now().toISOString(), points: [] };
        const sorted = [...rows].sort((a, b) => (a.hour ?? 0) - (b.hour ?? 0));
        if (sorted.length !== expected || sorted.some((r, i) => r.date !== date || r.hour !== (series === 'daily' ? null : i + 1) || !Number.isFinite(r.value) || (series !== 'price' && r.value < 0))) throw new EnergySeriesError(422, 'INCOMPLETE_FORECAST_OBSERVATIONS', 'XM aún no ofrece todas las observaciones válidas del día objetivo.');
        return { ...base, status: 'available', checkedAt: now().toISOString(), points: sorted.map(r => ({ period: r.hour ?? 1, value: r.value })) };
      })().catch(error => {
        if (error instanceof ExternalDataError) throw new EnergySeriesError(error.status, error.code, error.message);
        throw error;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    }
  };
}
export const forecastObservationsService = createForecastObservationsService();

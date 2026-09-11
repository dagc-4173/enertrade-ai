import { ExternalDataError, isDate, isObject, type ExternalDataProvider, type ExternalDataset, type ExternalQuery, type ExternalDataResult } from '../types/external-data';

// Catálogo oficial ListadoMetricas: entidad Sistema. Ver README de integrations.
const datasets: readonly ExternalDataset[] = [
  { id: 'Gene', name: 'Generación real del Sistema', unit: 'kWh', granularity: 'hourly', maxInclusiveDays: 30, supportsFilters: false },
  { id: 'DemaSIN', name: 'Demanda del SIN', unit: 'kWh', granularity: 'daily', maxInclusiveDays: 30, supportsFilters: false },
  { id: 'PrecBolsNaci', name: 'Precio de bolsa nacional', unit: 'COP/kWh', granularity: 'hourly', maxInclusiveDays: 30, supportsFilters: false },
];

export type ExternalFetch = (url: string, init: RequestInit) => Promise<Response>;

const malformed = () => new ExternalDataError(502, 'EXTERNAL_RESPONSE_INVALID', 'El proveedor devolvió una respuesta no válida.');

function numeric(value: unknown): number {
  if ((typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value))) || !Number.isFinite(Number(value))) throw malformed();
  return Number(value);
}

function normalize(raw: unknown, query: ExternalQuery, dataset: ExternalDataset): ExternalDataResult {
  if (!isObject(raw) || !isObject(raw.Metric) || raw.Metric.Id !== dataset.id || !Array.isArray(raw.Items)) throw malformed();
  const records: ExternalDataResult['records'] = [];
  const dates = new Set<string>();
  for (const item of raw.Items) {
    if (!isObject(item) || !isDate(item.Date) || item.Date < query.startDate || item.Date > query.endDate || dates.has(item.Date)) throw malformed();
    dates.add(item.Date);
    const entities = item[dataset.granularity === 'hourly' ? 'HourlyEntities' : 'DailyEntities'];
    if (!Array.isArray(entities) || entities.length !== 1 || !isObject(entities[0]) || entities[0].Id !== 'Sistema') throw malformed();
    const entity = entities[0];
    if (dataset.granularity === 'daily') {
      records.push({ date: item.Date, hour: null, value: numeric(entity.Value) });
    } else {
      if (!isObject(entity.Values) || entity.Values.code !== 'Sistema') throw malformed();
      for (let hour = 1; hour <= 24; hour++) {
        records.push({ date: item.Date, hour, value: numeric(entity.Values[`Hour${String(hour).padStart(2, '0')}`]) });
      }
    }
  }
  records.sort((a, b) => a.date.localeCompare(b.date) || (a.hour ?? 0) - (b.hour ?? 0));
  return { ...query, unit: dataset.unit, granularity: dataset.granularity, records };
}

export class XmProvider implements ExternalDataProvider {
  readonly id = 'xm';
  readonly name = 'XM';

  constructor(
    private readonly fetchExternal: ExternalFetch = (url, init) => fetch(url, init),
    private readonly baseUrl = process.env.XM_API_BASE_URL ?? 'https://servapibi.xm.com.co',
    private readonly timeoutMs = 15_000,
  ) {}

  listDatasets() { return datasets.map(dataset => ({ ...dataset })); }

  async query(query: ExternalQuery): Promise<ExternalDataResult> {
    const dataset = datasets.find(item => item.id === query.dataset);
    if (!dataset) throw new ExternalDataError(400, 'UNSUPPORTED_EXTERNAL_DATASET', 'El dataset no está soportado por el proveedor.');
    // Configuración de servidor únicamente; no se aceptan hosts, rutas ni redirecciones arbitrarios.
    let base: URL;
    try { base = new URL(this.baseUrl); } catch { throw this.configurationError(); }
    if (base.origin !== 'https://servapibi.xm.com.co' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw this.configurationError();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchExternal(new URL(`/${dataset.granularity}`, base).href, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ MetricId: dataset.id, Entity: 'Sistema', StartDate: query.startDate, EndDate: query.endDate, Filter: [] }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ExternalDataError(502, 'EXTERNAL_HTTP_ERROR', 'No fue posible consultar al proveedor.');
      }
      let raw: unknown;
      try { raw = await response.json(); } catch {
        if (controller.signal.aborted) throw new Error('aborted');
        throw malformed();
      }
      return normalize(raw, query, dataset);
    } catch (error) {
      if (controller.signal.aborted) throw new ExternalDataError(504, 'EXTERNAL_TIMEOUT', 'El proveedor no respondió dentro del tiempo permitido.');
      if (error instanceof ExternalDataError) throw error;
      throw new ExternalDataError(502, 'EXTERNAL_NETWORK_ERROR', 'No fue posible establecer comunicación con el proveedor.');
    } finally { clearTimeout(timer); }
  }

  private configurationError() {
    return new ExternalDataError(500, 'EXTERNAL_CONFIGURATION_ERROR', 'El proveedor no está configurado correctamente.');
  }
}

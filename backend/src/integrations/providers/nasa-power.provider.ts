import type {
  WeatherDataProvider,
  WeatherDataResult,
  WeatherObservation,
  WeatherProviderQuery,
  WeatherUnit,
  WeatherVariable,
} from '../types/weather-data';

const endpoint = 'https://power.larc.nasa.gov/api/temporal/hourly/point';
const adapterVersion = '1.0.0';
const normalizerId = 'nasa-power-hourly-normalizer';
const normalizerVersion = '1.0.0';
const timeoutMs = 15_000;
const maxParameters = 15;
const community = 're';
const HOURLY_INTERVAL_HOURS = 1;

const parameterByVariable: Record<WeatherVariable, string | undefined> = {
  ghi: 'ALLSKY_SFC_SW_DWN',
  dni: 'ALLSKY_SFC_SW_DNI',
  dhi: 'ALLSKY_SFC_SW_DIFF',
  temperature: 'T2M',
  wind_speed: 'WS10M',
  wind_direction: 'WD10M',
  relative_humidity: 'RH2M',
  pressure: 'PS',
  precipitation: 'PRECTOTCORR',
  cloud_cover: undefined,
};

type NasaPowerFetch = (input: URL, init?: RequestInit) => Promise<Response>;
type NasaPowerOptions = { fetchImpl?: NasaPowerFetch; timeoutMs?: number };
type SourceUnits = Partial<Record<WeatherVariable, string>>;
export type NasaPowerAcquisitionMetadata = { retrievedAt: string };
export type NasaPowerAcquisition = { rawBody: string; retrievedAt: string };

type NasaPowerResponse = {
  properties?: {
    parameter?: Record<string, Record<string, unknown>>;
  };
  header?: {
    api?: { version?: unknown };
    fill_value?: unknown;
  };
  parameters?: Record<string, { units?: unknown }>;
};

export class NasaPowerWeatherError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NasaPowerWeatherError';
  }
}

const invalidQuery = (message: string) => new NasaPowerWeatherError(400, 'NASA_POWER_QUERY_INVALID', message);
const invalidResponse = () => new NasaPowerWeatherError(502, 'NASA_POWER_RESPONSE_INVALID', 'La respuesta de NASA POWER no cumple el contrato esperado.');

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function dateForPower(value: string): string {
  return value.replaceAll('-', '');
}

function validateQuery(query: WeatherProviderQuery): Record<WeatherVariable, string> {
  if (!isObject(query) || !isObject(query.coordinates) || !isObject(query.range) || !Array.isArray(query.variables)) {
    throw invalidQuery('La consulta meteorológica no tiene una estructura válida.');
  }
  const { latitude, longitude } = query.coordinates;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw invalidQuery('Las coordenadas están fuera del rango permitido.');
  }
  const { start, end } = query.range;
  if (typeof start !== 'string' || typeof end !== 'string' || !isCalendarDate(start) || !isCalendarDate(end) || start > end) {
    throw invalidQuery('El rango debe contener fechas calendario válidas y ordenadas.');
  }
  if (query.requestedTimeStandard !== undefined && query.requestedTimeStandard !== 'UTC') {
    throw invalidQuery('NASA POWER solo admite UTC en este adapter.');
  }
  if (query.variables.length === 0) throw invalidQuery('Debe solicitarse al menos una variable.');
  if (query.variables.length > maxParameters) {
    throw new NasaPowerWeatherError(400, 'NASA_POWER_TOO_MANY_VARIABLES', 'La consulta supera el máximo de 15 parámetros horarios.');
  }
  const parameters: Record<WeatherVariable, string> = {} as Record<WeatherVariable, string>;
  const seen = new Set<WeatherVariable>();
  for (const variable of query.variables) {
    if (typeof variable !== 'string' || !(variable in parameterByVariable)) {
      throw new NasaPowerWeatherError(400, 'NASA_POWER_VARIABLE_UNSUPPORTED', 'La variable meteorológica no está soportada.');
    }
    if (seen.has(variable)) throw invalidQuery('La consulta no puede repetir variables.');
    seen.add(variable);
    const parameter = parameterByVariable[variable];
    if (!parameter) throw new NasaPowerWeatherError(400, 'NASA_POWER_VARIABLE_UNSUPPORTED', 'La variable meteorológica no está soportada por NASA POWER.');
    parameters[variable] = parameter;
  }
  return parameters;
}

function parseTimestamp(value: string): string {
  if (!/^\d{10}$/.test(value)) throw new NasaPowerWeatherError(502, 'NASA_POWER_TIMESTAMP_INVALID', 'La respuesta contiene un timestamp inválido.');
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const instant = Date.UTC(year, month - 1, day, hour);
  const date = new Date(instant);
  if (month < 1 || month > 12 || day < 1 || hour > 23 ||
      date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new NasaPowerWeatherError(502, 'NASA_POWER_TIMESTAMP_INVALID', 'La respuesta contiene un timestamp inválido.');
  }
  return date.toISOString();
}

function normalizedUnit(variable: WeatherVariable, sourceUnit: string): { unit: WeatherUnit; convert: (value: number) => number } {
  const normalized = sourceUnit.trim().toLowerCase().replaceAll(' ', '');
  if (['ghi', 'dni', 'dhi'].includes(variable)) {
    if (['kw-hr/m^2', 'kwh/m^2', 'kw-hr/m2', 'kwh/m2'].includes(normalized)) {
      return { unit: 'W/m2', convert: value => value * 1000 / HOURLY_INTERVAL_HOURS };
    }
    if (['w/m^2', 'w/m2'].includes(normalized)) return { unit: 'W/m2', convert: value => value };
  }
  if (variable === 'temperature' && ['c', 'degc', '°c'].includes(normalized)) return { unit: 'degC', convert: value => value };
  if (variable === 'wind_speed' && normalized === 'm/s') return { unit: 'm/s', convert: value => value };
  if (variable === 'wind_direction' && ['degree', 'degrees', 'deg'].includes(normalized)) return { unit: 'degree', convert: value => value };
  if (variable === 'relative_humidity' && ['%', 'percent'].includes(normalized)) return { unit: 'percent', convert: value => value };
  if (variable === 'pressure' && normalized === 'kpa') return { unit: 'kPa', convert: value => value };
  if (variable === 'precipitation' && ['mm/hr', 'mm/hour'].includes(normalized)) {
    return { unit: 'mm', convert: value => value * HOURLY_INTERVAL_HOURS };
  }
  throw new NasaPowerWeatherError(502, 'NASA_POWER_UNITS_INCOMPATIBLE', 'La respuesta contiene unidades no compatibles.');
}

function normalizeParsedResponse(raw: unknown, query: WeatherProviderQuery, parameters: Record<WeatherVariable, string>, retrievedAt: string): WeatherDataResult {
  if (!isObject(raw)) throw invalidResponse();
  const response = raw as NasaPowerResponse;
  const series = response.properties?.parameter;
  const rawParameters = response.parameters;
  const fillValue = response.header?.fill_value;
  if (!isObject(series) || !isObject(rawParameters) || typeof fillValue !== 'number' || !Number.isFinite(fillValue)) throw invalidResponse();
  const entries = Object.entries(parameters) as [WeatherVariable, string][];
  const firstSeries = series[entries[0]![1]];
  if (!isObject(firstSeries)) throw invalidResponse();
  const timestamps = Object.keys(firstSeries);
  if (timestamps.length === 0) throw invalidResponse();
  const conversions = new Map<WeatherVariable, { unit: WeatherUnit; convert: (value: number) => number }>();
  const units: Partial<Record<WeatherVariable, WeatherUnit>> = {};
  const sourceUnits: SourceUnits = {};
  for (const [variable, parameter] of entries) {
    const parameterInfo = rawParameters[parameter];
    const sourceUnit = parameterInfo?.units;
    const currentSeries = series[parameter];
    if (!isObject(currentSeries) || typeof sourceUnit !== 'string' || !sourceUnit.trim() || Object.keys(currentSeries).join(',') !== timestamps.join(',')) throw invalidResponse();
    const conversion = normalizedUnit(variable, sourceUnit);
    conversions.set(variable, conversion);
    units[variable] = conversion.unit;
    sourceUnits[variable] = sourceUnit;
  }
  const observations = timestamps.map(timestamp => {
    const timestampUtc = parseTimestamp(timestamp);
    const values: Partial<Record<WeatherVariable, number | null>> = {};
    for (const [variable, parameter] of entries) {
      const value = series[parameter]![timestamp];
      if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidResponse();
      values[variable] = value === fillValue ? null : conversions.get(variable)!.convert(value);
    }
    return { timestampUtc, providerTimestamp: timestamp, values };
  }).sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));
  return {
    provider: { id: 'nasa-power', version: adapterVersion },
    query,
    observations,
    units,
    provenance: {
      providerId: 'nasa-power',
      providerVersion: adapterVersion,
      logicalEndpoint: 'temporal/hourly/point',
      retrievedAt,
      sourceTimeStandard: 'UTC',
      normalizerId,
      normalizerVersion,
      sourceUnits,
    },
    responseMetadata: { format: 'JSON', sourceResolution: 'hourly' },
  };
}

function buildRequestUrl(query: WeatherProviderQuery, parameters: Record<WeatherVariable, string>) {
  const requestUrl = new URL(endpoint);
  requestUrl.searchParams.set('parameters', Object.values(parameters).join(','));
  requestUrl.searchParams.set('community', community);
  requestUrl.searchParams.set('longitude', String(query.coordinates.longitude));
  requestUrl.searchParams.set('latitude', String(query.coordinates.latitude));
  requestUrl.searchParams.set('start', dateForPower(query.range.start));
  requestUrl.searchParams.set('end', dateForPower(query.range.end));
  requestUrl.searchParams.set('format', 'JSON');
  requestUrl.searchParams.set('time-standard', 'UTC');
  if (query.coordinates.elevationM !== undefined) requestUrl.searchParams.set('site-elevation', String(query.coordinates.elevationM));
  return requestUrl;
}

export async function acquireNasaPowerResponse(query: WeatherProviderQuery, fetchImpl: NasaPowerFetch = fetch, requestTimeoutMs = timeoutMs): Promise<NasaPowerAcquisition> {
  const parameters = validateQuery(query);
  const requestUrl = buildRequestUrl(query, parameters);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(requestUrl, { method: 'GET', redirect: 'error', signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      throw new NasaPowerWeatherError(502, 'NASA_POWER_HTTP_ERROR', 'NASA POWER devolvió una respuesta HTTP no exitosa.');
    }
    return { rawBody: await response.text(), retrievedAt: new Date().toISOString() };
  } catch (error) {
    if (controller.signal.aborted) throw new NasaPowerWeatherError(504, 'NASA_POWER_TIMEOUT', 'NASA POWER no respondió dentro del tiempo permitido.');
    if (error instanceof NasaPowerWeatherError) throw error;
    throw new NasaPowerWeatherError(502, 'NASA_POWER_NETWORK_ERROR', 'No fue posible consultar NASA POWER.');
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeNasaPowerResponse(rawBody: string, query: WeatherProviderQuery, acquisitionMetadata: NasaPowerAcquisitionMetadata): WeatherDataResult {
  let raw: unknown;
  try { raw = JSON.parse(rawBody); } catch { throw invalidResponse(); }
  const parameters = validateQuery(query);
  return normalizeParsedResponse(raw, query, parameters, acquisitionMetadata.retrievedAt);
}

export class NasaPowerWeatherProvider implements WeatherDataProvider {
  readonly id = 'nasa-power';
  readonly version = adapterVersion;

  constructor(private readonly fetchImpl: NasaPowerFetch = fetch, private readonly requestTimeoutMs = timeoutMs) {}

  async query(query: WeatherProviderQuery): Promise<WeatherDataResult> {
    const acquisition = await acquireNasaPowerResponse(query, this.fetchImpl, this.requestTimeoutMs);
    return normalizeNasaPowerResponse(acquisition.rawBody, query, { retrievedAt: acquisition.retrievedAt });
  }
}

export function createNasaPowerWeatherProvider(options: NasaPowerOptions = {}) {
  return new NasaPowerWeatherProvider(options.fetchImpl, options.timeoutMs ?? timeoutMs);
}

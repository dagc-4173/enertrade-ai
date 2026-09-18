import { createHash } from 'node:crypto';
import type {
  GeoCoordinates,
  WeatherDataResult,
  WeatherObservation,
  WeatherProviderQuery,
  WeatherUnit,
  WeatherVariable,
} from './types/weather-data';

export type WeatherNormalizedSnapshot = {
  provider: {
    id: string;
    version: string;
  };
  query: {
    coordinates: GeoCoordinates;
    range: { start: string; end: string };
    variables: WeatherVariable[];
    requestedTimeStandard?: WeatherProviderQuery['requestedTimeStandard'];
  };
  observations: WeatherObservation[];
  units: Partial<Record<WeatherVariable, WeatherUnit>>;
  sourceTimeStandard: WeatherDataResult['provenance']['sourceTimeStandard'];
  normalizer: {
    id: string;
    version: string;
  };
};

export function sha256Utf8(value: string): string {
  const digest = createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
  return `sha256:${digest}`;
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON solo admite números finitos.');
    return JSON.stringify(value);
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError('Canonical JSON no admite valores no serializables.');
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Canonical JSON solo admite objetos planos.');
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new TypeError('Canonical JSON recibió un valor no soportado.');
}

function copyObservation(observation: WeatherObservation): WeatherObservation {
  return {
    timestampUtc: observation.timestampUtc,
    providerTimestamp: observation.providerTimestamp,
    values: { ...observation.values },
  };
}

function compareObservations(left: WeatherObservation, right: WeatherObservation): number {
  const byTimestamp = left.timestampUtc.localeCompare(right.timestampUtc);
  if (byTimestamp !== 0) return byTimestamp;
  const byProviderTimestamp = left.providerTimestamp.localeCompare(right.providerTimestamp);
  if (byProviderTimestamp !== 0) return byProviderTimestamp;
  return canonicalJson(left.values).localeCompare(canonicalJson(right.values));
}

export function buildWeatherNormalizedSnapshot(result: WeatherDataResult): WeatherNormalizedSnapshot {
  const query: WeatherNormalizedSnapshot['query'] = {
    coordinates: { ...result.query.coordinates },
    range: { ...result.query.range },
    variables: [...result.query.variables].sort(),
    ...(result.query.requestedTimeStandard === undefined ? {} : { requestedTimeStandard: result.query.requestedTimeStandard }),
  };
  return {
    provider: { ...result.provider },
    query,
    observations: result.observations.map(copyObservation).sort(compareObservations),
    units: { ...result.units },
    sourceTimeStandard: result.provenance.sourceTimeStandard,
    normalizer: {
      id: result.provenance.normalizerId,
      version: result.provenance.normalizerVersion,
    },
  };
}

export function hashWeatherNormalizedSnapshot(snapshot: WeatherNormalizedSnapshot): string {
  return sha256Utf8(canonicalJson(snapshot));
}

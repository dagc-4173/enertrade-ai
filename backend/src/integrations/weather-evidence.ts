import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { normalizeNasaPowerResponse } from './providers/nasa-power.provider';
import type {
  GeoCoordinates,
  WeatherDataResult,
  WeatherObservation,
  WeatherProviderQuery,
  WeatherTimeStandard,
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

export type WeatherAcquisitionManifest = {
  acquisitionId: string;
  providerId: string;
  providerVersion: string;
  logicalEndpoint: string;
  retrievedAt: string;
  coordinates: GeoCoordinates;
  requestedRange: { start: string; end: string };
  requestedVariables: WeatherVariable[];
  requestedTimeStandard?: WeatherTimeStandard;
  sourceTimeStandard: WeatherDataResult['provenance']['sourceTimeStandard'];
  sourceUnits: Partial<Record<WeatherVariable, string>>;
  canonicalUnits: Partial<Record<WeatherVariable, WeatherUnit>>;
  normalizerId: string;
  normalizerVersion: string;
  rawSha256: string;
  normalizedSha256: string;
  rawMediaType: 'application/json';
  recordCount: number;
  status: 'success';
};

export type WeatherAcquisitionEnvelope = {
  raw: {
    body: string;
    mediaType: 'application/json';
    sha256: string;
  };
  normalized: {
    snapshot: WeatherNormalizedSnapshot;
    sha256: string;
  };
  manifest: WeatherAcquisitionManifest;
};

export class WeatherEvidenceError extends Error {
  constructor(public readonly code: 'WEATHER_RAW_HASH_MISMATCH' | 'WEATHER_NORMALIZED_HASH_MISMATCH' | 'WEATHER_EVIDENCE_INVALID', message: string) {
    super(message);
    this.name = 'WeatherEvidenceError';
  }
}

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

type WeatherAcquisitionEnvelopeOptions = {
  rawBody: string;
  normalized: WeatherDataResult;
  logicalEndpoint?: string;
  acquisitionId?: string;
  rawMediaType?: 'application/json';
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createWeatherAcquisitionEnvelope(options: WeatherAcquisitionEnvelopeOptions): WeatherAcquisitionEnvelope {
  const { rawBody, normalized } = options;
  const snapshot = buildWeatherNormalizedSnapshot(normalized);
  const rawSha256 = sha256Utf8(rawBody);
  const normalizedSha256 = hashWeatherNormalizedSnapshot(snapshot);
  const acquisitionId = options.acquisitionId ?? randomUUID();
  if (!isUuid(acquisitionId)) throw new WeatherEvidenceError('WEATHER_EVIDENCE_INVALID', 'El acquisitionId debe ser un UUID v4 válido.');
  const requestedTimeStandard = normalized.query.requestedTimeStandard;
  return {
    raw: { body: rawBody, mediaType: options.rawMediaType ?? 'application/json', sha256: rawSha256 },
    normalized: { snapshot, sha256: normalizedSha256 },
    manifest: {
      acquisitionId,
      providerId: normalized.provider.id,
      providerVersion: normalized.provider.version,
      logicalEndpoint: options.logicalEndpoint ?? normalized.provenance.logicalEndpoint,
      retrievedAt: normalized.provenance.retrievedAt,
      coordinates: { ...snapshot.query.coordinates },
      requestedRange: { ...snapshot.query.range },
      requestedVariables: [...snapshot.query.variables],
      ...(requestedTimeStandard === undefined ? {} : { requestedTimeStandard }),
      sourceTimeStandard: snapshot.sourceTimeStandard,
      sourceUnits: { ...normalized.provenance.sourceUnits },
      canonicalUnits: { ...snapshot.units },
      normalizerId: snapshot.normalizer.id,
      normalizerVersion: snapshot.normalizer.version,
      rawSha256,
      normalizedSha256,
      rawMediaType: options.rawMediaType ?? 'application/json',
      recordCount: snapshot.observations.length,
      status: 'success',
    },
  };
}

export type NasaPowerReplayInput = {
  rawBody: string;
  query: WeatherProviderQuery;
  acquisitionMetadata: { retrievedAt: string };
  manifest: WeatherAcquisitionManifest;
};

export type WeatherReplayResult = {
  verified: true;
  rawSha256: string;
  normalizedSha256: string;
  normalized: WeatherNormalizedSnapshot;
};

export function replayNasaPowerAcquisition(input: NasaPowerReplayInput): WeatherReplayResult {
  const rawSha256 = sha256Utf8(input.rawBody);
  if (rawSha256 !== input.manifest.rawSha256) {
    throw new WeatherEvidenceError('WEATHER_RAW_HASH_MISMATCH', 'El hash del raw snapshot no coincide con el manifest.');
  }
  const normalized = normalizeNasaPowerResponse(input.rawBody, input.query, input.acquisitionMetadata);
  if (normalized.provider.version !== input.manifest.providerVersion ||
      normalized.provenance.normalizerVersion !== input.manifest.normalizerVersion ||
      normalized.provider.id !== input.manifest.providerId ||
      normalized.provenance.normalizerId !== input.manifest.normalizerId) {
    throw new WeatherEvidenceError('WEATHER_EVIDENCE_INVALID', 'Las versiones o identidad del replay no coinciden con el manifest.');
  }
  const snapshot = buildWeatherNormalizedSnapshot(normalized);
  const normalizedSha256 = hashWeatherNormalizedSnapshot(snapshot);
  if (normalizedSha256 !== input.manifest.normalizedSha256) {
    throw new WeatherEvidenceError('WEATHER_NORMALIZED_HASH_MISMATCH', 'El hash normalizado no coincide con el manifest.');
  }
  return { verified: true, rawSha256, normalizedSha256, normalized: snapshot };
}

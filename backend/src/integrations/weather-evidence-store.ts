import { access, mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  canonicalJson,
  hashWeatherNormalizedSnapshot,
  replayNasaPowerAcquisition,
  sha256Utf8,
  type WeatherAcquisitionEnvelope,
  type WeatherAcquisitionManifest,
  type WeatherNormalizedSnapshot,
  type WeatherReplayResult,
} from './weather-evidence';
import type { WeatherProviderQuery } from './types/weather-data';

const DEFAULT_MAX_RAW_BYTES = 5 * 1024 * 1024;
const DEFAULT_ROOT = join(tmpdir(), 'enertrade-weather-evidence');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WeatherEvidenceStoreOptions = {
  rootDir?: string;
  maxRawBytes?: number;
};

export class WeatherEvidenceStoreError extends Error {
  constructor(
    public readonly code:
    | 'WEATHER_EVIDENCE_ALREADY_EXISTS'
    | 'WEATHER_EVIDENCE_NOT_FOUND'
    | 'WEATHER_EVIDENCE_STORAGE_INVALID'
    | 'WEATHER_EVIDENCE_TOO_LARGE'
    | 'WEATHER_EVIDENCE_IO_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'WeatherEvidenceStoreError';
  }
}

function isUuid(value: string): boolean {
  return UUID_V4.test(value);
}

function rootDir(options: WeatherEvidenceStoreOptions): string {
  return resolve(options.rootDir ?? process.env.WEATHER_EVIDENCE_DIR ?? DEFAULT_ROOT);
}

function maxRawBytes(options: WeatherEvidenceStoreOptions): number {
  const value = options.maxRawBytes ?? DEFAULT_MAX_RAW_BYTES;
  if (!Number.isSafeInteger(value) || value < 1) throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_STORAGE_INVALID', 'El límite local de rawBody no es válido.');
  return value;
}

function validateId(acquisitionId: string): void {
  if (!isUuid(acquisitionId)) throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_STORAGE_INVALID', 'El acquisitionId debe ser un UUID v4 válido.');
}

function acquisitionDir(root: string, acquisitionId: string): string {
  validateId(acquisitionId);
  return join(root, acquisitionId);
}

function storageInvalid(): WeatherEvidenceStoreError {
  return new WeatherEvidenceStoreError('WEATHER_EVIDENCE_STORAGE_INVALID', 'La evidencia meteorológica almacenada no es consistente.');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertWeatherNormalizedSnapshot(value: unknown): WeatherNormalizedSnapshot {
  if (!isPlainObject(value) || !isPlainObject(value.provider) || typeof value.provider.id !== 'string' || !value.provider.id ||
      typeof value.provider.version !== 'string' || !value.provider.version || !isPlainObject(value.query) ||
      !isPlainObject(value.query.coordinates) || typeof value.query.coordinates.latitude !== 'number' || !Number.isFinite(value.query.coordinates.latitude) ||
      typeof value.query.coordinates.longitude !== 'number' || !Number.isFinite(value.query.coordinates.longitude) ||
      !isPlainObject(value.query.range) || typeof value.query.range.start !== 'string' || typeof value.query.range.end !== 'string' ||
      !Array.isArray(value.query.variables) || !value.query.variables.every(variable => typeof variable === 'string') ||
      !Array.isArray(value.observations) || !isPlainObject(value.units) ||
      !['UTC', 'LOCAL_SOLAR', 'AMERICA_BOGOTA'].includes(value.sourceTimeStandard as string) ||
      !isPlainObject(value.normalizer) || typeof value.normalizer.id !== 'string' || !value.normalizer.id ||
      typeof value.normalizer.version !== 'string' || !value.normalizer.version) throw storageInvalid();
  for (const observation of value.observations) {
    if (!isPlainObject(observation) || typeof observation.timestampUtc !== 'string' ||
        typeof observation.providerTimestamp !== 'string' || !isPlainObject(observation.values)) throw storageInvalid();
  }
  return value as unknown as WeatherNormalizedSnapshot;
}

async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function assertEnvelope(envelope: WeatherAcquisitionEnvelope, options: WeatherEvidenceStoreOptions): void {
  validateId(envelope.manifest.acquisitionId);
  if (envelope.manifest.status !== 'success' || envelope.raw.mediaType !== 'application/json' || envelope.manifest.rawMediaType !== 'application/json') throw storageInvalid();
  if (Buffer.byteLength(envelope.raw.body, 'utf8') > maxRawBytes(options)) {
    throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_TOO_LARGE', 'El rawBody supera el límite local de almacenamiento.');
  }
  if (sha256Utf8(envelope.raw.body) !== envelope.raw.sha256 || envelope.raw.sha256 !== envelope.manifest.rawSha256) throw storageInvalid();
  const snapshot = assertWeatherNormalizedSnapshot(envelope.normalized.snapshot);
  const normalizedSha256 = hashWeatherNormalizedSnapshot(snapshot);
  if (
      normalizedSha256 !== envelope.normalized.sha256 || normalizedSha256 !== envelope.manifest.normalizedSha256) throw storageInvalid();
  if (envelope.manifest.recordCount !== snapshot.observations.length ||
      envelope.manifest.providerId !== snapshot.provider.id ||
      envelope.manifest.providerVersion !== snapshot.provider.version ||
      envelope.manifest.normalizerId !== snapshot.normalizer.id ||
      envelope.manifest.normalizerVersion !== snapshot.normalizer.version ||
      envelope.manifest.sourceTimeStandard !== snapshot.sourceTimeStandard ||
      envelope.manifest.requestedTimeStandard !== snapshot.query.requestedTimeStandard ||
      canonicalJson(envelope.manifest.coordinates) !== canonicalJson(snapshot.query.coordinates) ||
      canonicalJson(envelope.manifest.requestedRange) !== canonicalJson(snapshot.query.range) ||
      canonicalJson(envelope.manifest.requestedVariables) !== canonicalJson(snapshot.query.variables) ||
      canonicalJson(envelope.manifest.canonicalUnits) !== canonicalJson(snapshot.units)) throw storageInvalid();
}

export async function saveWeatherAcquisition(envelope: WeatherAcquisitionEnvelope, options: WeatherEvidenceStoreOptions = {}): Promise<void> {
  assertEnvelope(envelope, options);
  const root = rootDir(options);
  const finalDir = acquisitionDir(root, envelope.manifest.acquisitionId);
  try {
    if (await pathExists(finalDir)) throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_ALREADY_EXISTS', 'La adquisición meteorológica ya existe.');
    await mkdir(root, { recursive: true });
    const temporaryDir = await mkdtemp(join(root, '.acquisition-'));
    try {
      await writeFile(join(temporaryDir, 'raw.json'), envelope.raw.body, { encoding: 'utf8', flag: 'wx' });
      await writeFile(join(temporaryDir, 'normalized.json'), canonicalJson(envelope.normalized.snapshot), { encoding: 'utf8', flag: 'wx' });
      await writeFile(join(temporaryDir, 'manifest.json'), canonicalJson(envelope.manifest), { encoding: 'utf8', flag: 'wx' });
      if (await pathExists(finalDir)) throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_ALREADY_EXISTS', 'La adquisición meteorológica ya existe.');
      try {
        await rename(temporaryDir, finalDir);
      } catch (error) {
        if (await pathExists(finalDir)) throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_ALREADY_EXISTS', 'La adquisición meteorológica ya existe.');
        throw error;
      }
    } catch (error) {
      await rm(temporaryDir, { recursive: true, force: true });
      if (error instanceof WeatherEvidenceStoreError) throw error;
      throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_IO_FAILED', 'No fue posible guardar la evidencia meteorológica.');
    }
  } catch (error) {
    if (error instanceof WeatherEvidenceStoreError) throw error;
    throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_IO_FAILED', 'No fue posible guardar la evidencia meteorológica.');
  }
}

export async function loadWeatherAcquisition(acquisitionId: string, options: WeatherEvidenceStoreOptions = {}): Promise<WeatherAcquisitionEnvelope> {
  const directory = acquisitionDir(rootDir(options), acquisitionId);
  try {
    const [rawBody, normalizedText, manifestText] = await Promise.all([
      readFile(join(directory, 'raw.json'), 'utf8'),
      readFile(join(directory, 'normalized.json'), 'utf8'),
      readFile(join(directory, 'manifest.json'), 'utf8'),
    ]);
    const manifest = JSON.parse(manifestText) as WeatherAcquisitionManifest;
    if (!isPlainObject(manifest) || manifest.acquisitionId !== acquisitionId) throw storageInvalid();
    const snapshot = assertWeatherNormalizedSnapshot(JSON.parse(normalizedText));
    const rawSha256 = sha256Utf8(rawBody);
    const normalizedSha256 = hashWeatherNormalizedSnapshot(snapshot);
    if (rawSha256 !== manifest.rawSha256 || normalizedSha256 !== manifest.normalizedSha256) throw storageInvalid();
    const envelope: WeatherAcquisitionEnvelope = {
      raw: { body: rawBody, mediaType: manifest.rawMediaType, sha256: rawSha256 },
      normalized: { snapshot, sha256: normalizedSha256 },
      manifest,
    };
    assertEnvelope(envelope, options);
    return envelope;
  } catch (error) {
    if (error instanceof WeatherEvidenceStoreError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_NOT_FOUND', 'La adquisición meteorológica no existe.');
    if (error instanceof SyntaxError) throw storageInvalid();
    throw new WeatherEvidenceStoreError('WEATHER_EVIDENCE_IO_FAILED', 'No fue posible leer la evidencia meteorológica.');
  }
}

export async function loadAndReplayNasaPowerAcquisition(acquisitionId: string, query: WeatherProviderQuery, options: WeatherEvidenceStoreOptions = {}): Promise<WeatherReplayResult> {
  const envelope = await loadWeatherAcquisition(acquisitionId, options);
  return replayNasaPowerAcquisition({
    rawBody: envelope.raw.body,
    query,
    acquisitionMetadata: { retrievedAt: envelope.manifest.retrievedAt },
    manifest: envelope.manifest,
  });
}

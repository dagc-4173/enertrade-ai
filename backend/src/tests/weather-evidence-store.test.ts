import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeNasaPowerResponse } from '@/integrations/providers/nasa-power.provider';
import { createWeatherAcquisitionEnvelope, sha256Utf8 } from '@/integrations/weather-evidence';
import {
  loadAndReplayNasaPowerAcquisition,
  loadWeatherAcquisition,
  saveWeatherAcquisition,
  WeatherEvidenceStoreError,
} from '@/integrations/weather-evidence-store';
import type { WeatherProviderQuery } from '@/integrations/types/weather-data';

const query: WeatherProviderQuery = {
  coordinates: { latitude: 4.6, longitude: -74.1, elevationM: 2600 },
  range: { start: '2026-01-02', end: '2026-01-02' },
  variables: ['temperature', 'ghi'],
  requestedTimeStandard: 'UTC',
};
const rawBody = JSON.stringify({
  properties: { parameter: {
    ALLSKY_SFC_SW_DWN: { '2026010201': -999, '2026010202': 0 },
    T2M: { '2026010201': 18, '2026010202': 19 },
  } },
  header: { fill_value: -999 },
  parameters: {
    ALLSKY_SFC_SW_DWN: { units: 'kW-hr/m^2' },
    T2M: { units: 'C' },
  },
});
let root = '';
let envelope!: ReturnType<typeof createWeatherAcquisitionEnvelope>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'enertrade-weather-store-'));
  const normalized = normalizeNasaPowerResponse(rawBody, query, { retrievedAt: '2026-01-02T04:00:00.000Z' });
  envelope = createWeatherAcquisitionEnvelope({ rawBody, normalized, logicalEndpoint: 'temporal/hourly/point' });
});

afterAll(async () => { await rm(root, { recursive: true, force: true }); });

const options = () => ({ rootDir: root, maxRawBytes: 1024 * 1024 });

async function saveFresh() {
  const normalized = normalizeNasaPowerResponse(rawBody, query, { retrievedAt: envelope.manifest.retrievedAt });
  const current = createWeatherAcquisitionEnvelope({ rawBody, normalized, acquisitionId: envelope.manifest.acquisitionId, logicalEndpoint: 'temporal/hourly/point' });
  await saveWeatherAcquisition(current, options());
  return current;
}

test('save and load preserve the envelope semantics and exact raw body', async () => {
  const saved = await saveFresh();
  const loaded = await loadWeatherAcquisition(saved.manifest.acquisitionId, options());
  expect(loaded.raw.body).toBe(rawBody);
  expect(loaded.raw.sha256).toBe(saved.raw.sha256);
  expect(loaded.normalized.sha256).toBe(saved.normalized.sha256);
  expect(loaded.manifest).toEqual(saved.manifest);
  expect(loaded.normalized.snapshot.observations[0]!.values.ghi).toBe(null);
  expect(loaded.normalized.snapshot.observations[1]!.values.ghi).toBe(0);
});

test('rejects a second save with the same acquisitionId', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174001';
  const normalized = normalizeNasaPowerResponse(rawBody, query, { retrievedAt: envelope.manifest.retrievedAt });
  const value = createWeatherAcquisitionEnvelope({ rawBody, normalized, acquisitionId: id });
  await saveWeatherAcquisition(value, options());
  await expect(saveWeatherAcquisition(value, options())).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_ALREADY_EXISTS' });
});

test('rejects invalid IDs and traversal-like paths', async () => {
  const invalid = structuredClone(envelope);
  invalid.manifest.acquisitionId = 'abc';
  await expect(saveWeatherAcquisition(invalid, { rootDir: root })).rejects.toBeInstanceOf(WeatherEvidenceStoreError);
  await expect(loadWeatherAcquisition('../escape', options())).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_STORAGE_INVALID' });
  await expect(loadWeatherAcquisition('abc', options())).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_STORAGE_INVALID' });
});

test('missing acquisition returns controlled not found', async () => {
  await expect(loadWeatherAcquisition('123e4567-e89b-42d3-a456-426614174002', options())).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_NOT_FOUND' });
});

test('detects raw, normalized and manifest tampering', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174003';
  const normalized = normalizeNasaPowerResponse(rawBody, query, { retrievedAt: envelope.manifest.retrievedAt });
  const value = createWeatherAcquisitionEnvelope({ rawBody, normalized, acquisitionId: id });
  await saveWeatherAcquisition(value, options());
  const directory = join(root, id);
  await writeFile(join(directory, 'raw.json'), `${rawBody} `, 'utf8');
  await expect(loadWeatherAcquisition(id, options())).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_STORAGE_INVALID' });
  await writeFile(join(directory, 'raw.json'), rawBody, 'utf8');
  await writeFile(join(directory, 'normalized.json'), '{}', 'utf8');
  await expect(loadWeatherAcquisition(id, options())).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_STORAGE_INVALID' });
  await writeFile(join(directory, 'normalized.json'), JSON.stringify(value.normalized.snapshot), 'utf8');
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  manifest.providerVersion = '2.0.0';
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  await expect(loadWeatherAcquisition(id, options())).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_STORAGE_INVALID' });
});

test('rejects a manifest whose acquisitionId differs from its directory', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174005';
  const normalized = normalizeNasaPowerResponse(rawBody, query, { retrievedAt: envelope.manifest.retrievedAt });
  const value = createWeatherAcquisitionEnvelope({ rawBody, normalized, acquisitionId: id });
  await saveWeatherAcquisition(value, options());
  const directory = join(root, id);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as Record<string, unknown>;
  manifest.acquisitionId = '123e4567-e89b-42d3-a456-426614174006';
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  await expect(loadWeatherAcquisition(id, options())).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_STORAGE_INVALID' });
});

test('partial acquisition is rejected as not found', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174007';
  const normalized = normalizeNasaPowerResponse(rawBody, query, { retrievedAt: envelope.manifest.retrievedAt });
  const value = createWeatherAcquisitionEnvelope({ rawBody, normalized, acquisitionId: id });
  await saveWeatherAcquisition(value, options());
  await rm(join(root, id, 'manifest.json'));
  await expect(loadWeatherAcquisition(id, options())).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_NOT_FOUND' });
});

test('enforces the local raw size limit', async () => {
  const oversized = { ...envelope, raw: { ...envelope.raw, body: 'x'.repeat(20) } };
  await expect(saveWeatherAcquisition(oversized, { rootDir: root, maxRawBytes: 10 })).rejects.toMatchObject({ code: 'WEATHER_EVIDENCE_TOO_LARGE' });
});

test('load and replay uses stored evidence without network', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174004';
  const normalized = normalizeNasaPowerResponse(rawBody, query, { retrievedAt: envelope.manifest.retrievedAt });
  const value = createWeatherAcquisitionEnvelope({ rawBody, normalized, acquisitionId: id });
  await saveWeatherAcquisition(value, options());
  const replayed = await loadAndReplayNasaPowerAcquisition(id, query, options());
  expect(replayed.verified).toBe(true);
  expect(replayed.normalized.observations[0]!.values.ghi).toBe(null);
  expect(replayed.rawSha256).toBe(sha256Utf8(rawBody));
});

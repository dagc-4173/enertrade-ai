import { expect, test } from 'bun:test';
import {
  buildWeatherNormalizedSnapshot,
  canonicalJson,
  hashWeatherNormalizedSnapshot,
  sha256Utf8,
  createWeatherAcquisitionEnvelope,
  replayNasaPowerAcquisition,
  WeatherEvidenceError,
} from '@/integrations/weather-evidence';
import type { WeatherDataResult } from '@/integrations/types/weather-data';

function baseResult(): WeatherDataResult {
  return {
    provider: { id: 'nasa-power', version: '1.0.0' },
    query: {
      coordinates: { latitude: 4.6, longitude: -74.1, elevationM: 2600 },
      range: { start: '2026-01-02', end: '2026-01-02' },
      variables: ['temperature', 'ghi'],
      requestedTimeStandard: 'UTC',
    },
    observations: [
      { timestampUtc: '2026-01-02T02:00:00.000Z', providerTimestamp: '2026010202', values: { ghi: 0, temperature: 19 } },
      { timestampUtc: '2026-01-02T01:00:00.000Z', providerTimestamp: '2026010201', values: { ghi: null, temperature: 18 } },
    ],
    units: { ghi: 'W/m2', temperature: 'degC' },
    provenance: {
      providerId: 'nasa-power', providerVersion: '1.0.0', logicalEndpoint: 'temporal/hourly/point',
      retrievedAt: '2026-01-02T04:00:00.000Z', sourceTimeStandard: 'UTC',
      normalizerId: 'nasa-power-hourly-normalizer', normalizerVersion: '1.0.0',
      sourceUnits: { ghi: 'kW-hr/m^2', temperature: 'C' },
    },
    responseMetadata: { format: 'JSON', sourceResolution: 'hourly' },
  };
}

const nasaQuery = baseResult().query;
const nasaRawBody = JSON.stringify({
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

function envelope(query = nasaQuery, acquisitionId?: string) {
  return createWeatherAcquisitionEnvelope({
    rawBody: nasaRawBody,
    normalized: {
      ...baseResult(),
      query,
      observations: [
        { timestampUtc: '2026-01-02T01:00:00.000Z', providerTimestamp: '2026010201', values: { ghi: null, temperature: 18 } },
        { timestampUtc: '2026-01-02T02:00:00.000Z', providerTimestamp: '2026010202', values: { ghi: 0, temperature: 19 } },
      ],
    },
    logicalEndpoint: 'temporal/hourly/point',
    ...(acquisitionId === undefined ? {} : { acquisitionId }),
  });
}

test('sha256Utf8 is stable, distinguishes text and uses the required format', () => {
  expect(sha256Utf8('same')).toBe(sha256Utf8('same'));
  expect(sha256Utf8('same')).not.toBe(sha256Utf8('different'));
  expect(sha256Utf8('{"a":1}')).not.toBe(sha256Utf8('{ "a": 1 }'));
  expect(sha256Utf8('{"a":1}\n')).not.toBe(sha256Utf8('{"a":1}\r\n'));
  expect(sha256Utf8('value')).toMatch(/^sha256:[0-9a-f]{64}$/);
});

test('canonicalJson sorts object keys recursively and preserves array order', () => {
  expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  expect(canonicalJson({ missing: null, zero: 0 })).toBe('{"missing":null,"zero":0}');
});

test('canonicalJson rejects unsupported and non-finite values', () => {
  expect(() => canonicalJson(undefined)).toThrow();
  expect(() => canonicalJson(Number.NaN)).toThrow();
  expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow();
  expect(() => canonicalJson(Number.NEGATIVE_INFINITY)).toThrow();
  expect(() => canonicalJson(new Date('2026-01-02T00:00:00.000Z'))).toThrow();
});

test('normalized snapshot excludes runtime metadata and is semantically ordered', () => {
  const result = baseResult();
  const snapshot = buildWeatherNormalizedSnapshot(result);
  expect(snapshot.query.variables).toEqual(['ghi', 'temperature']);
  expect(snapshot.observations.map(observation => observation.providerTimestamp)).toEqual(['2026010201', '2026010202']);
  expect(snapshot).not.toHaveProperty('responseMetadata');
  expect(snapshot).not.toHaveProperty('retrievedAt');
  expect(snapshot).not.toHaveProperty('rawBody');
  expect(snapshot.normalizer).toEqual({ id: 'nasa-power-hourly-normalizer', version: '1.0.0' });
  expect(result.query.variables).toEqual(['temperature', 'ghi']);
  expect(result.observations[0]!.providerTimestamp).toBe('2026010202');
});

test('same semantics produce the same normalized hash despite runtime and order changes', () => {
  const first = baseResult();
  const second = structuredClone(first);
  second.provenance.retrievedAt = '2030-01-01T00:00:00.000Z';
  second.responseMetadata = { format: 'other', sourceResolution: 'changed' };
  second.query.variables.reverse();
  second.observations.reverse();
  expect(hashWeatherNormalizedSnapshot(buildWeatherNormalizedSnapshot(first)))
    .toBe(hashWeatherNormalizedSnapshot(buildWeatherNormalizedSnapshot(second)));
});

test('null and zero remain distinct in normalized hashes', () => {
  const zero = baseResult();
  const nullValue = structuredClone(zero);
  nullValue.observations[0]!.values.ghi = null;
  expect(hashWeatherNormalizedSnapshot(buildWeatherNormalizedSnapshot(zero)))
    .not.toBe(hashWeatherNormalizedSnapshot(buildWeatherNormalizedSnapshot(nullValue)));
});

test.each([
  ['normalizerVersion', (result: WeatherDataResult) => { result.provenance.normalizerVersion = '2.0.0'; }],
  ['providerVersion', (result: WeatherDataResult) => { result.provider.version = '2.0.0'; }],
  ['unit', (result: WeatherDataResult) => { result.units.ghi = 'kPa'; }],
  ['value', (result: WeatherDataResult) => { result.observations[0]!.values.ghi = 1; }],
])('%s changes the normalized hash', (_name, change) => {
  const original = baseResult();
  const changed = structuredClone(original);
  change(changed);
  expect(hashWeatherNormalizedSnapshot(buildWeatherNormalizedSnapshot(original)))
    .not.toBe(hashWeatherNormalizedSnapshot(buildWeatherNormalizedSnapshot(changed)));
});

test('manifest and envelope preserve provenance, hashes and record count', () => {
  const result = envelope();
  expect(result.raw.body).toBe(nasaRawBody);
  expect(result.raw.mediaType).toBe('application/json');
  expect(result.raw.sha256).toBe(sha256Utf8(nasaRawBody));
  expect(result.normalized.sha256).toBe(hashWeatherNormalizedSnapshot(result.normalized.snapshot));
  expect(result.manifest).toMatchObject({
    providerId: 'nasa-power', providerVersion: '1.0.0', logicalEndpoint: 'temporal/hourly/point',
    retrievedAt: '2026-01-02T04:00:00.000Z', requestedTimeStandard: 'UTC', sourceTimeStandard: 'UTC',
    sourceUnits: { ghi: 'kW-hr/m^2', temperature: 'C' }, canonicalUnits: { ghi: 'W/m2', temperature: 'degC' },
    normalizerId: 'nasa-power-hourly-normalizer', normalizerVersion: '1.0.0',
    rawMediaType: 'application/json', recordCount: 2, status: 'success',
  });
  expect(result.manifest.rawSha256).toBe(result.raw.sha256);
  expect(result.manifest.normalizedSha256).toBe(result.normalized.sha256);
  expect(result.manifest.acquisitionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(JSON.stringify(result.manifest)).not.toMatch(/Authorization|cookie|token|password|headers/i);
});

test('manifest separates explicit requested UTC from effective source UTC', () => {
  const explicit = envelope(nasaQuery);
  expect(explicit.manifest.requestedTimeStandard).toBe('UTC');
  expect(explicit.manifest.sourceTimeStandard).toBe('UTC');

  const withoutRequest = structuredClone(nasaQuery);
  delete withoutRequest.requestedTimeStandard;
  const effectiveOnly = envelope(withoutRequest);
  expect(effectiveOnly.manifest.requestedTimeStandard).toBeUndefined();
  expect(effectiveOnly.manifest.sourceTimeStandard).toBe('UTC');
});

test('replay remains valid when requestedTimeStandard was omitted', () => {
  const query = structuredClone(nasaQuery);
  delete query.requestedTimeStandard;
  const recorded = envelope(query);
  const replayed = replayNasaPowerAcquisition({
    rawBody: recorded.raw.body,
    query,
    acquisitionMetadata: { retrievedAt: recorded.manifest.retrievedAt },
    manifest: recorded.manifest,
  });
  expect(replayed.verified).toBe(true);
  expect(recorded.manifest.requestedTimeStandard).toBeUndefined();
  expect(recorded.manifest.sourceTimeStandard).toBe('UTC');
});

test('acquisition IDs vary while content hashes remain equal', () => {
  const first = envelope();
  const second = envelope();
  expect(first.manifest.acquisitionId).not.toBe(second.manifest.acquisitionId);
  expect(first.raw.sha256).toBe(second.raw.sha256);
  expect(first.normalized.sha256).toBe(second.normalized.sha256);
});

test('valid injected acquisitionId is preserved and invalid IDs are rejected', () => {
  const valid = '123e4567-e89b-42d3-a456-426614174000';
  expect(envelope(nasaQuery, valid).manifest.acquisitionId).toBe(valid);
  expect(() => envelope(nasaQuery, '')).toThrowError(WeatherEvidenceError);
  expect(() => envelope(nasaQuery, 'abc')).toThrowError(WeatherEvidenceError);
  expect(() => envelope(nasaQuery, '')).toThrow(/UUID v4/);
});

test('changing only acquisitionId does not change content hashes', () => {
  const first = envelope(nasaQuery, '123e4567-e89b-42d3-a456-426614174000');
  const second = envelope(nasaQuery, '123e4567-e89b-42d3-a456-426614174001');
  expect(first.manifest.acquisitionId).not.toBe(second.manifest.acquisitionId);
  expect(first.raw.sha256).toBe(second.raw.sha256);
  expect(first.normalized.sha256).toBe(second.normalized.sha256);
});

test('replay verifies the raw and normalized snapshots without fetch', () => {
  const recorded = envelope();
  const replayed = replayNasaPowerAcquisition({
    rawBody: recorded.raw.body,
    query: nasaQuery,
    acquisitionMetadata: { retrievedAt: recorded.manifest.retrievedAt },
    manifest: recorded.manifest,
  });
  expect(replayed).toEqual({ verified: true, rawSha256: recorded.raw.sha256, normalizedSha256: recorded.normalized.sha256, normalized: recorded.normalized.snapshot });
  expect(replayed.normalized.observations[0]!.values.ghi).toBe(null);
  expect(replayed.normalized.observations[1]!.values.ghi).toBe(0);
});

test('replay rejects altered raw, normalized hash and versions', () => {
  const recorded = envelope();
  expect(() => replayNasaPowerAcquisition({ rawBody: `${recorded.raw.body} `, query: nasaQuery, acquisitionMetadata: { retrievedAt: recorded.manifest.retrievedAt }, manifest: recorded.manifest }))
    .toThrowError(new WeatherEvidenceError('WEATHER_RAW_HASH_MISMATCH', 'El hash del raw snapshot no coincide con el manifest.'));
  const badNormalized = structuredClone(recorded.manifest);
  badNormalized.normalizedSha256 = sha256Utf8('altered');
  expect(() => replayNasaPowerAcquisition({ rawBody: recorded.raw.body, query: nasaQuery, acquisitionMetadata: { retrievedAt: recorded.manifest.retrievedAt }, manifest: badNormalized }))
    .toThrowError(new WeatherEvidenceError('WEATHER_NORMALIZED_HASH_MISMATCH', 'El hash normalizado no coincide con el manifest.'));
  const badProvider = structuredClone(recorded.manifest);
  badProvider.providerVersion = '2.0.0';
  expect(() => replayNasaPowerAcquisition({ rawBody: recorded.raw.body, query: nasaQuery, acquisitionMetadata: { retrievedAt: recorded.manifest.retrievedAt }, manifest: badProvider }))
    .toThrowError(new WeatherEvidenceError('WEATHER_EVIDENCE_INVALID', 'Las versiones o identidad del replay no coinciden con el manifest.'));
  const badNormalizer = structuredClone(recorded.manifest);
  badNormalizer.normalizerVersion = '2.0.0';
  expect(() => replayNasaPowerAcquisition({ rawBody: recorded.raw.body, query: nasaQuery, acquisitionMetadata: { retrievedAt: recorded.manifest.retrievedAt }, manifest: badNormalizer }))
    .toThrowError(new WeatherEvidenceError('WEATHER_EVIDENCE_INVALID', 'Las versiones o identidad del replay no coinciden con el manifest.'));
});

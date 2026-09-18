import { expect, test } from 'bun:test';
import {
  buildWeatherNormalizedSnapshot,
  canonicalJson,
  hashWeatherNormalizedSnapshot,
  sha256Utf8,
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

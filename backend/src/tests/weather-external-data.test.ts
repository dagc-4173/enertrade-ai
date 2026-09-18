import { afterAll, expect, mock, test } from 'bun:test';
import express from 'express';
import { NasaPowerWeatherError } from '@/integrations/providers/nasa-power.provider';
import { createWeatherExternalDataRouter } from '@/controllers/weather-external-data.controller';
import { WeatherExternalDataService, type WeatherProviderRegistration } from '@/integrations/weather-external-data.service';
import { WeatherEvidenceStoreError } from '@/integrations/weather-evidence-store';
import type { WeatherDataProvider, WeatherDataResult, WeatherProviderQuery } from '@/integrations/types/weather-data';

const result: WeatherDataResult = {
  provider: { id: 'fake-weather', version: '1.0.0' },
  query: { coordinates: { latitude: 4, longitude: -74 }, range: { start: '2026-01-01', end: '2026-01-01' }, variables: ['ghi'], requestedTimeStandard: 'UTC' },
  observations: [{ timestampUtc: '2026-01-01T00:00:00.000Z', providerTimestamp: '2026010100', values: { ghi: 0 } }],
  units: { ghi: 'W/m2' },
  provenance: { providerId: 'fake-weather', providerVersion: '1.0.0', logicalEndpoint: 'test', retrievedAt: '2026-01-01T01:00:00.000Z', sourceTimeStandard: 'UTC', normalizerId: 'fake-normalizer', normalizerVersion: '1.0.0', sourceUnits: { ghi: 'W/m2' } },
};

function registration(query = async (_query: WeatherProviderQuery) => result, acquire: (input: WeatherProviderQuery) => Promise<{ rawBody: string; retrievedAt: string }> = async () => ({ rawBody: '{}', retrievedAt: result.provenance.retrievedAt })): { registration: WeatherProviderRegistration; calls: WeatherProviderQuery[]; acquisitions: number[] } {
  const calls: WeatherProviderQuery[] = [];
  const acquisitions: number[] = [];
  const provider: WeatherDataProvider = { id: 'fake-weather', version: '1.0.0', query: async input => { calls.push(input); return query(input); } };
  return { registration: { provider, variables: ['ghi'], supportedTimeStandards: ['UTC'], acquire: async input => { acquisitions.push(1); return acquire(input); }, normalize: () => result }, calls, acquisitions };
}

const first = registration();
const saveEvidence = mock(async () => undefined);
const service = new WeatherExternalDataService([first.registration], saveEvidence);
const app = express();
app.use('/external-data/weather', createWeatherExternalDataRouter(service));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw Error('listener');
const base = `http://127.0.0.1:${address.port}/external-data/weather`;
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

const valid = { provider: 'fake-weather', coordinates: { latitude: 4, longitude: -74 }, range: { start: '2026-01-01', end: '2026-01-01' }, variables: ['ghi'] as WeatherProviderQuery['variables'], requestedTimeStandard: 'UTC' };
async function post(body: unknown = valid, contentType = 'application/json', raw = false) {
  const response = await fetch(`${base}/query`, { method: 'POST', headers: { 'Content-Type': contentType }, body: raw ? String(body) : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
async function acquireHttp(body: unknown = valid) {
  const response = await fetch(`${base}/acquire`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}

test('service lists providers and builds a query without provider field', async () => {
  expect(service.listProviders()).toEqual([{ id: 'fake-weather', version: '1.0.0', variables: ['ghi'], supportedTimeStandards: ['UTC'] }]);
  await service.query(valid);
  expect(first.calls).toHaveLength(1);
  expect(first.calls[0]).toEqual({ coordinates: valid.coordinates, range: valid.range, variables: valid.variables, requestedTimeStandard: 'UTC' });
});

test.each([
  [null, 'INVALID_WEATHER_QUERY'],
  [{ ...valid, extra: true }, 'INVALID_WEATHER_QUERY'],
  [{ ...valid, coordinates: undefined }, 'INVALID_WEATHER_QUERY'],
  [{ ...valid, range: undefined }, 'INVALID_WEATHER_QUERY'],
  [{ ...valid, variables: {} }, 'INVALID_WEATHER_QUERY'],
  [{ ...valid, requestedTimeStandard: 4 }, 'INVALID_WEATHER_QUERY'],
  [{ ...valid, provider: 'unknown' }, 'UNSUPPORTED_WEATHER_PROVIDER'],
])('service rejects invalid input %j', async (input, code) => {
  await expect(service.query(input)).rejects.toMatchObject({ code });
});

test('service propagates provider errors and does not remodel result', async () => {
  const expected = new NasaPowerWeatherError(504, 'NASA_POWER_TIMEOUT', 'timeout');
  const failing = registration(async () => { throw expected; });
  const failingService = new WeatherExternalDataService([failing.registration]);
  await expect(failingService.query(valid)).rejects.toBe(expected);
  const output = await service.query(valid);
  expect(output).toBe(result);
});

test('GET providers returns the meteorological provider metadata', async () => {
  const response = await fetch(`${base}/providers`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ providers: [{ id: 'fake-weather', version: '1.0.0', variables: ['ghi'], supportedTimeStandards: ['UTC'] }] });
});

test('valid query returns WeatherDataResult unchanged', async () => {
  const response = await post();
  expect(response.status).toBe(200);
  expect(response.body).toEqual(result);
});

test('query does not persist evidence', async () => {
  saveEvidence.mockClear();
  await service.query(valid);
  expect(saveEvidence).not.toHaveBeenCalled();
});

test('acquire performs one acquisition, saves once and returns normalized data', async () => {
  saveEvidence.mockClear();
  const acquired = await service.acquire(valid);
  expect(first.acquisitions).toHaveLength(1);
  expect(saveEvidence).toHaveBeenCalledTimes(1);
  expect(acquired.envelope.normalized.snapshot.provider).toEqual(result.provider);
  expect(acquired.data).toBe(result);
});

test('HTTP validation handles content type, JSON, size, provider and query errors', async () => {
  expect((await post(valid, 'text/plain')).status).toBe(415);
  expect((await post('{', 'application/json', true)).body.error).toBe('INVALID_WEATHER_QUERY');
  expect((await post('x'.repeat(17_000), 'application/json', true)).status).toBe(413);
  expect((await post({ ...valid, provider: 'unknown' })).body.error).toBe('UNSUPPORTED_WEATHER_PROVIDER');
  expect((await post({ ...valid, extra: true })).body.error).toBe('INVALID_WEATHER_QUERY');
});

test('HTTP acquire returns evidence summary and data without raw or paths', async () => {
  const response = await acquireHttp();
  const body = response.body;
  expect(response.status).toBe(201);
  expect(body.acquisition).toMatchObject({ providerId: 'fake-weather', rawSha256: expect.any(String), normalizedSha256: expect.any(String), recordCount: 1 });
  expect(body.data).toEqual(result);
  expect(JSON.stringify(body)).not.toMatch(/rawBody|rootDir|\\|\/tmp|Authorization|cookie|token/i);
});

test.each([
  ['WEATHER_EVIDENCE_ALREADY_EXISTS', 409],
  ['WEATHER_EVIDENCE_TOO_LARGE', 413],
  ['WEATHER_EVIDENCE_IO_FAILED', 500],
])('HTTP acquire maps store error %s', async (code, status) => {
  saveEvidence.mockRejectedValueOnce(new WeatherEvidenceStoreError(code as any, 'private filesystem path and stack'));
  const response = await acquireHttp();
  expect(response.status).toBe(status);
  expect(response.body.error).toBe(code);
  expect(JSON.stringify(response.body)).not.toMatch(/private|filesystem|stack|path/i);
});

test('HTTP acquire timeout returns 504, calls acquisition once and does not save', async () => {
  const failing = registration(async () => result, async () => { throw new NasaPowerWeatherError(504, 'NASA_POWER_TIMEOUT', 'private timeout'); });
  const save = mock(async () => undefined);
  const failingApp = express();
  failingApp.use('/external-data/weather', createWeatherExternalDataRouter(new WeatherExternalDataService([failing.registration], save)));
  const failingServer = failingApp.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => failingServer.listening ? resolve() : failingServer.once('listening', resolve));
  const failingAddress = failingServer.address();
  if (!failingAddress || typeof failingAddress === 'string') throw Error('listener');
  const response = await fetch(`http://127.0.0.1:${failingAddress.port}/external-data/weather/acquire`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
  const body = await response.json() as any;
  expect(response.status).toBe(504);
  expect(body.error).toBe('NASA_POWER_TIMEOUT');
  expect(failing.acquisitions).toHaveLength(1);
  expect(save).not.toHaveBeenCalled();
  await new Promise<void>(resolve => failingServer.close(() => resolve()));
});

test.each([
  ['NASA_POWER_QUERY_INVALID', 400],
  ['NASA_POWER_RESPONSE_INVALID', 502],
  ['NASA_POWER_TIMEOUT', 504],
  ['NASA_POWER_NETWORK_ERROR', 502],
])('HTTP maps provider error %s', async (code, status) => {
  const failing = registration(async () => { throw new NasaPowerWeatherError(status, code, 'private raw body stack'); });
  const failingApp = express();
  failingApp.use('/external-data/weather', createWeatherExternalDataRouter(new WeatherExternalDataService([failing.registration])));
  const failingServer = failingApp.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => failingServer.listening ? resolve() : failingServer.once('listening', resolve));
  const failingAddress = failingServer.address();
  if (!failingAddress || typeof failingAddress === 'string') throw Error('listener');
  const response = await fetch(`http://127.0.0.1:${failingAddress.port}/external-data/weather/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
  const body = await response.json() as any;
  expect(response.status).toBe(status);
  expect(body.error).toBe(code);
  expect(JSON.stringify(body)).not.toContain('private');
  await new Promise<void>(resolve => failingServer.close(() => resolve()));
});

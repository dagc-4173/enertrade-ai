import { expect, mock, test } from 'bun:test';
import {
  createNasaPowerWeatherProvider,
  NasaPowerWeatherError,
  type NasaPowerWeatherProvider,
} from '@/integrations/providers/nasa-power.provider';
import type { WeatherProviderQuery } from '@/integrations/types/weather-data';

type JsonRecord = Record<string, unknown>;

const query: WeatherProviderQuery = {
  coordinates: { latitude: 4.6, longitude: -74.1, elevationM: 2600 },
  range: { start: '2026-01-02', end: '2026-01-02' },
  variables: ['ghi', 'temperature', 'wind_speed'],
};

function powerResponse(overrides: JsonRecord = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-74.1, 4.6, 2600] },
    properties: {
      parameter: {
        ALLSKY_SFC_SW_DWN: { '2026010203': 0.5, '2026010201': -999, '2026010202': 0 },
        ALLSKY_SFC_SW_DNI: { '2026010203': 1, '2026010201': -999, '2026010202': 0 },
        ALLSKY_SFC_SW_DIFF: { '2026010203': 1, '2026010201': -999, '2026010202': 0 },
        T2M: { '2026010203': 20, '2026010201': 19, '2026010202': 19.5 },
        WS10M: { '2026010203': 2, '2026010201': 1, '2026010202': 0 },
        PRECTOTCORR: { '2026010203': 2.5, '2026010201': -999, '2026010202': 0 },
      },
    },
    header: { api: { version: 'v2.10.2' }, fill_value: -999 },
    messages: [],
    parameters: {
      ALLSKY_SFC_SW_DWN: { units: 'kW-hr/m^2', longname: 'Global horizontal irradiance' },
      ALLSKY_SFC_SW_DNI: { units: 'kW-hr/m^2', longname: 'Direct normal irradiance' },
      ALLSKY_SFC_SW_DIFF: { units: 'kW-hr/m^2', longname: 'Diffuse horizontal irradiance' },
      T2M: { units: 'C', longname: 'Temperature at 2 meters' },
      WS10M: { units: 'm/s', longname: 'Wind speed at 10 meters' },
      PRECTOTCORR: { units: 'mm/hour', longname: 'Precipitation corrected' },
    },
    times: { data: 0, process: 0 },
    ...overrides,
  };
}

function jsonFetch(payload: unknown, calls: JsonRecord[] = []) {
  return mock(async (input: URL, init?: RequestInit) => {
    calls.push({ input: String(input), init: init as unknown as JsonRecord });
    return Response.json(payload);
  });
}

function expectCode(action: () => Promise<unknown>, code: string) {
  return expect(action()).rejects.toMatchObject({ code });
}

test('provider exposes isolated id and adapter version', () => {
  const provider = createNasaPowerWeatherProvider();
  expect(provider.id).toBe('nasa-power');
  expect(provider.version).toBe('1.0.0');
});

test('builds the fixed official hourly request with renewable community and UTC', async () => {
  const calls: JsonRecord[] = [];
  const provider = createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(powerResponse(), calls) });
  await provider.query(query);
  const url = new URL(String(calls[0]!.input));
  expect(`${url.origin}${url.pathname}`).toBe('https://power.larc.nasa.gov/api/temporal/hourly/point');
  expect(url.searchParams.get('parameters')).toBe('ALLSKY_SFC_SW_DWN,T2M,WS10M');
  expect(url.searchParams.get('community')).toBe('re');
  expect(url.searchParams.get('latitude')).toBe('4.6');
  expect(url.searchParams.get('longitude')).toBe('-74.1');
  expect(url.searchParams.get('start')).toBe('20260102');
  expect(url.searchParams.get('end')).toBe('20260102');
  expect(url.searchParams.get('format')).toBe('JSON');
  expect(url.searchParams.get('time-standard')).toBe('UTC');
  expect(url.searchParams.get('site-elevation')).toBe('2600');
  expect(calls[0]!.init).toMatchObject({ method: 'GET', redirect: 'error' });
});

test('parses timestamps chronologically, preserves source timestamps and maps values', async () => {
  const provider = createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(powerResponse()) });
  const result = await provider.query(query);
  expect(result.observations.map(item => item.providerTimestamp)).toEqual(['2026010201', '2026010202', '2026010203']);
  expect(result.observations[0]).toEqual({
    providerTimestamp: '2026010201',
    timestampUtc: '2026-01-02T01:00:00.000Z',
    values: { ghi: null, temperature: 19, wind_speed: 1 },
  });
  expect(result.observations[1]!.values.ghi).toBe(0);
  expect(result.observations[2]!.values.ghi).toBe(500);
});

test('returns canonical units and controlled provenance', async () => {
  const provider = createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(powerResponse()) });
  const result = await provider.query(query);
  expect(result.provider).toEqual({ id: 'nasa-power', version: '1.0.0' });
  expect(result.units).toEqual({ ghi: 'W/m2', temperature: 'degC', wind_speed: 'm/s' });
  expect(result.provenance).toMatchObject({
    providerId: 'nasa-power', providerVersion: '1.0.0', logicalEndpoint: 'temporal/hourly/point',
    sourceTimeStandard: 'UTC', normalizerId: 'nasa-power-hourly-normalizer', normalizerVersion: '1.0.0',
    sourceUnits: { ghi: 'kW-hr/m^2', temperature: 'C', wind_speed: 'm/s' },
  });
  expect(Number.isNaN(Date.parse(result.provenance.retrievedAt))).toBe(false);
  expect(result.responseMetadata).toEqual({ format: 'JSON', sourceResolution: 'hourly' });
});

test('converts hourly precipitation rates to interval accumulation and preserves source units', async () => {
  const provider = createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(powerResponse()) });
  const result = await provider.query({ ...query, variables: ['precipitation'] });
  expect(result.observations[0]!.values.precipitation).toBe(null);
  expect(result.observations[1]!.values.precipitation).toBe(0);
  expect(result.observations[2]!.values.precipitation).toBe(2.5);
  expect(result.units.precipitation).toBe('mm');
  expect(result.provenance.sourceUnits?.precipitation).toBe('mm/hour');
});

test('converts hourly radiation energy to average power and preserves W/m2 identity', async () => {
  const provider = createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(powerResponse()) });
  const result = await provider.query({ ...query, variables: ['ghi', 'dni', 'dhi'] });
  expect(result.observations[1]!.values.ghi).toBe(0);
  expect(result.observations[2]!.values.ghi).toBe(500);
  expect(result.observations[2]!.values.dni).toBe(1000);
  expect(result.observations[2]!.values.dhi).toBe(1000);
  expect(result.units).toEqual({ ghi: 'W/m2', dni: 'W/m2', dhi: 'W/m2' });

  const direct = powerResponse();
  (direct.parameters as JsonRecord).ALLSKY_SFC_SW_DWN = { units: 'W/m^2' };
  ((direct.properties as JsonRecord).parameter as JsonRecord).ALLSKY_SFC_SW_DWN = { '2026010203': 250 };
  const directResult = await createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(direct) }).query({ ...query, variables: ['ghi'] });
  expect(directResult.observations[0]!.values.ghi).toBe(250);
  expect(directResult.units.ghi).toBe('W/m2');
});

test('rejects local solar time and non-Colombia UTC aliases', async () => {
  const provider = createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(powerResponse()) });
  await expectCode(() => provider.query({ ...query, requestedTimeStandard: 'LOCAL_SOLAR' }), 'NASA_POWER_QUERY_INVALID');
  await expectCode(() => provider.query({ ...query, requestedTimeStandard: 'AMERICA_BOGOTA' }), 'NASA_POWER_QUERY_INVALID');
});

test('rejects invalid coordinates, range and empty variables', async () => {
  const provider = createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(powerResponse()) });
  await expectCode(() => provider.query({ ...query, coordinates: { latitude: 91, longitude: 0 } }), 'NASA_POWER_QUERY_INVALID');
  await expectCode(() => provider.query({ ...query, coordinates: { latitude: 0, longitude: -181 } }), 'NASA_POWER_QUERY_INVALID');
  await expectCode(() => provider.query({ ...query, range: { start: '2026-02-30', end: '2026-03-01' } }), 'NASA_POWER_QUERY_INVALID');
  await expectCode(() => provider.query({ ...query, range: { start: '2026-01-03', end: '2026-01-02' } }), 'NASA_POWER_QUERY_INVALID');
  await expectCode(() => provider.query({ ...query, variables: [] }), 'NASA_POWER_QUERY_INVALID');
});

test('rejects unsupported, repeated and excessive variables', async () => {
  const provider = createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(powerResponse()) });
  await expectCode(() => provider.query({ ...query, variables: ['cloud_cover'] }), 'NASA_POWER_VARIABLE_UNSUPPORTED');
  await expectCode(() => provider.query({ ...query, variables: ['ghi', 'ghi'] }), 'NASA_POWER_QUERY_INVALID');
  await expectCode(() => provider.query({ ...query, variables: Array(16).fill('ghi') as WeatherProviderQuery['variables'] }), 'NASA_POWER_TOO_MANY_VARIABLES');
});

test('rejects HTTP errors and invalid JSON without leaking upstream content', async () => {
  const httpProvider = createNasaPowerWeatherProvider({ fetchImpl: mock(async () => new Response('private upstream body', { status: 503 })) });
  await expectCode(() => httpProvider.query(query), 'NASA_POWER_HTTP_ERROR');
  const invalidJsonProvider = createNasaPowerWeatherProvider({ fetchImpl: mock(async () => new Response('{', { status: 200 })) });
  const error = await invalidJsonProvider.query(query).catch(value => value as NasaPowerWeatherError) as NasaPowerWeatherError;
  expect(error).toMatchObject({ code: 'NASA_POWER_RESPONSE_INVALID' });
  expect(error.message).not.toContain('private');
  const networkProvider = createNasaPowerWeatherProvider({ fetchImpl: mock(async () => { throw new Error('private network'); }) });
  await expectCode(() => networkProvider.query(query), 'NASA_POWER_NETWORK_ERROR');
});

test('rejects incompatible response, units and timestamp', async () => {
  const incompatible = createNasaPowerWeatherProvider({ fetchImpl: jsonFetch({}) });
  await expectCode(() => incompatible.query(query), 'NASA_POWER_RESPONSE_INVALID');
  const missingFill = powerResponse();
  delete (missingFill.header as JsonRecord).fill_value;
  await expectCode(() => createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(missingFill) }).query(query), 'NASA_POWER_RESPONSE_INVALID');
  const badUnits = powerResponse();
  (badUnits.parameters as JsonRecord).T2M = { units: 'fahrenheit' };
  await expectCode(() => createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(badUnits) }).query(query), 'NASA_POWER_UNITS_INCOMPATIBLE');
  const badPrecipitationUnits = powerResponse();
  (badPrecipitationUnits.parameters as JsonRecord).PRECTOTCORR = { units: 'mm' };
  await expectCode(() => createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(badPrecipitationUnits) }).query({ ...query, variables: ['precipitation'] }), 'NASA_POWER_UNITS_INCOMPATIBLE');
  const badSolarUnits = powerResponse();
  (badSolarUnits.parameters as JsonRecord).ALLSKY_SFC_SW_DWN = { units: 'MJ/m^2' };
  await expectCode(() => createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(badSolarUnits) }).query({ ...query, variables: ['ghi'] }), 'NASA_POWER_UNITS_INCOMPATIBLE');
  for (const timestamp of ['2026023001', '2026130101', '2026010124']) {
    const badTimestamp = powerResponse();
    (badTimestamp.properties as JsonRecord).parameter = {
      ALLSKY_SFC_SW_DWN: { [timestamp]: 0.5 },
      T2M: { [timestamp]: 20 },
      WS10M: { [timestamp]: 2 },
    };
    await expectCode(() => createNasaPowerWeatherProvider({ fetchImpl: jsonFetch(badTimestamp) }).query(query), 'NASA_POWER_TIMESTAMP_INVALID');
  }
});

test('aborts the injected request on timeout', async () => {
  let aborted = false;
  const fetchImpl = mock(async (_input: URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('private timeout')); }, { once: true });
  }));
  const provider: NasaPowerWeatherProvider = createNasaPowerWeatherProvider({ fetchImpl, timeoutMs: 1 });
  await expectCode(() => provider.query(query), 'NASA_POWER_TIMEOUT');
  expect(aborted).toBe(true);
});

import { expect, test } from 'bun:test';
import { createXmDailySyncService, type XmDailySyncDependencies, type XmSyncMetric } from '@/services/xm-daily-sync.service';

const coverage = (persistedUntil = '2026-09-21') => ({ historicalFrom: '2024-01-01', persistedUntil });
const records = (metric: XmSyncMetric, day: string, complete = true) => metric === 'DemaSIN'
  ? [{ date: day, hour: null, value: 1 }]
  : Array.from({ length: complete ? 24 : 23 }, (_, index) => ({ date: day, hour: index + 1, value: index + 1 }));

function dependencies(overrides: Partial<XmDailySyncDependencies> = {}) {
  const calls = { query: [] as string[], ingest: [] as string[], materialize: [] as string[], prepare: [] as number[] };
  const defaults: XmDailySyncDependencies = {
    readCoverage: async () => coverage(),
    query: async input => { calls.query.push(`${input.dataset}:${input.startDate}`); return { records: records(input.dataset, input.startDate) }; },
    ingest: async input => { calls.ingest.push(`${input.metric}:${input.from}:${input.to}`); return { manifestId: calls.ingest.length, energyDatasetId: 900 + calls.ingest.length, reused: false }; },
    materialize: async input => { calls.materialize.push(`${input.metric}:${input.from}:${input.to}`); return { consolidatedDatasetId: 70, energyDatasetId: 970 }; },
    validate: async () => ({ status: 'aprobado', canProceed: true }),
    prepare: async id => { calls.prepare.push(id); return { preparedDatasetId: 80, profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0' }; },
    now: () => new Date('2026-09-23T12:00:00Z'),
  };
  return { calls, service: createXmDailySyncService({ ...defaults, ...overrides }) };
}

test('no new XM data returns up_to_date without creating artifacts', async () => {
  const { service, calls } = dependencies({ readCoverage: async () => coverage('2026-09-23') });
  const result = (await service.sync('Gene')).metrics[0]!;
  expect(result).toMatchObject({ metric: 'Gene', status: 'up_to_date', previousPersistedUntil: '2026-09-23', availableUntil: '2026-09-23', windowsCreatedOrReused: [] });
  expect(calls.ingest).toEqual([]); expect(calls.materialize).toEqual([]); expect(calls.prepare).toEqual([]);
});

test('one new available day ingests, consolidates, validates and prepares', async () => {
  const { service: tracked, calls: trackedCalls } = dependencies({
    query: async input => { trackedCalls.query.push(`${input.dataset}:${input.startDate}`); return { records: input.startDate === '2026-09-22' ? records(input.dataset, input.startDate) : [] }; },
  });
  const result = (await tracked.sync('Gene')).metrics[0]!;
  expect(result).toMatchObject({ status: 'synchronized', previousPersistedUntil: '2026-09-21', availableUntil: '2026-09-22', synchronizedUntil: '2026-09-22', consolidatedDatasetId: 70, energyDatasetId: 970, preparedDatasetId: 80, validationStatus: 'aprobado', preparationProfile: { id: 'xm_gene_preparacion_base', version: '1.0.0' } });
  expect(result.status === 'synchronized' && result.windowsCreatedOrReused).toEqual([{ from: '2026-09-22', to: '2026-09-22', manifestId: 1, energyDatasetId: 901, reused: false }]);
  expect(trackedCalls.query).toEqual(['Gene:2026-09-23', 'Gene:2026-09-22']);
  expect(trackedCalls.ingest).toEqual(['Gene:2026-09-22:2026-09-22']);
  expect(trackedCalls.materialize).toEqual(['Gene:2024-01-01:2026-09-22']); expect(trackedCalls.prepare).toEqual([970]);
});

test('multiple new days synchronize the full discovered range', async () => {
  const { service, calls } = dependencies({
    readCoverage: async () => coverage('2026-09-18'),
    query: async input => ({ records: input.startDate === '2026-09-22' ? records(input.dataset, input.startDate) : [] }),
  });
  const result = (await service.sync('DemaSIN')).metrics[0]!;
  expect(result).toMatchObject({ status: 'synchronized', availableUntil: '2026-09-22', synchronizedUntil: '2026-09-22' });
  expect(calls.ingest).toEqual(['DemaSIN:2026-09-19:2026-09-22']);
});

test('ranges larger than 30 days split into compatible XM windows', async () => {
  const { service, calls } = dependencies({
    readCoverage: async () => coverage('2026-07-01'),
    query: async input => ({ records: input.startDate === '2026-09-23' ? records(input.dataset, input.startDate) : [] }),
  });
  await service.sync('PrecBolsNaci');
  expect(calls.ingest).toEqual([
    'PrecBolsNaci:2026-07-02:2026-07-31',
    'PrecBolsNaci:2026-08-01:2026-08-30',
    'PrecBolsNaci:2026-08-31:2026-09-23',
  ]);
});

test('re-running after the persisted coverage advances is idempotent', async () => {
  let persisted = '2026-09-21';
  const { service, calls } = dependencies({
    readCoverage: async () => coverage(persisted),
    query: async input => ({ records: input.startDate === '2026-09-22' ? records(input.dataset, input.startDate) : [] }),
    prepare: async id => { persisted = '2026-09-22'; calls.prepare.push(id); return { preparedDatasetId: 80, profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0' }; },
  });
  expect((await service.sync('Gene')).metrics[0]!.status).toBe('synchronized');
  expect((await service.sync('Gene')).metrics[0]!.status).toBe('up_to_date');
  expect(calls.ingest).toEqual(['Gene:2026-09-22:2026-09-22']); expect(calls.materialize).toHaveLength(1); expect(calls.prepare).toHaveLength(1);
});

test('partial XM availability is not treated as a future published day', async () => {
  const { service, calls } = dependencies({ query: async input => ({ records: records(input.dataset, input.startDate, false) }) });
  const result = (await service.sync('Gene')).metrics[0]!;
  expect(result).toMatchObject({ status: 'up_to_date', availableUntil: '2026-09-21' });
  expect(calls.ingest).toEqual([]); expect(calls.materialize).toEqual([]);
});

test('a failed metric does not prevent other metrics from synchronizing', async () => {
  const { service } = dependencies({
    query: async input => ({ records: input.startDate === '2026-09-22' ? records(input.dataset, input.startDate) : [] }),
    ingest: async input => { if (input.metric === 'Gene') throw Object.assign(new Error('xm unavailable'), { code: 'EXTERNAL_NETWORK_ERROR' }); return { manifestId: 2, energyDatasetId: 902, reused: false }; },
  });
  const result = await service.sync();
  expect(result.metrics.find(item => item.metric === 'Gene')).toMatchObject({ status: 'failed', error: { code: 'EXTERNAL_NETWORK_ERROR' } });
  expect(result.metrics.find(item => item.metric === 'DemaSIN')?.status).toBe('synchronized');
  expect(result.metrics.find(item => item.metric === 'PrecBolsNaci')?.status).toBe('synchronized');
});

test('validation rejection never prepares the consolidated dataset', async () => {
  const { service, calls } = dependencies({
    query: async input => ({ records: input.startDate === '2026-09-22' ? records(input.dataset, input.startDate) : [] }),
    validate: async () => ({ status: 'rechazado', canProceed: false }),
  });
  const result = (await service.sync('Gene')).metrics[0]!;
  expect(result).toMatchObject({ status: 'validation_rejected', validationStatus: 'rechazado' });
  expect('preparedDatasetId' in result).toBe(false);
  expect(calls.prepare).toEqual([]);
});

test('forecast availability reports the actual latest observation and only D+1', async () => {
  const { service } = dependencies({ readCoverage: async metric => coverage(metric === 'DemaSIN' ? '2026-09-16' : '2026-09-15') });
  await expect(service.availability()).resolves.toEqual([
    { series: 'Gene', currentDate: '2026-09-23', latestObservationDate: '2026-09-15', nextForecastDate: '2026-09-16', supportedHorizonDays: 7, modelMinTargetDate: '2026-09-16', modelMaxTargetDate: '2026-09-22', effectiveFutureMinDate: null, effectiveFutureMaxDate: null, hasFutureForecastWindow: false, dataFreshnessDays: 8 },
    { series: 'DemaSIN', currentDate: '2026-09-23', latestObservationDate: '2026-09-16', nextForecastDate: '2026-09-17', supportedHorizonDays: 1, modelMinTargetDate: '2026-09-17', modelMaxTargetDate: '2026-09-17', effectiveFutureMinDate: null, effectiveFutureMaxDate: null, hasFutureForecastWindow: false, dataFreshnessDays: 7 },
    { series: 'PrecBolsNaci', currentDate: '2026-09-23', latestObservationDate: '2026-09-15', nextForecastDate: '2026-09-16', supportedHorizonDays: 1, modelMinTargetDate: '2026-09-16', modelMaxTargetDate: '2026-09-16', effectiveFutureMinDate: null, effectiveFutureMaxDate: null, hasFutureForecastWindow: false, dataFreshnessDays: 8 },
  ]);
});

test('forecast availability marks stale coverage without an effective future window', async () => {
  const { service } = dependencies({ now: () => new Date('2026-10-01T12:00:00') });
  const values = await service.availability();
  expect(values[0]).toMatchObject({ series: 'Gene', currentDate: '2026-10-01', latestObservationDate: '2026-09-21', modelMinTargetDate: '2026-09-22', modelMaxTargetDate: '2026-09-28', effectiveFutureMinDate: null, effectiveFutureMaxDate: null, hasFutureForecastWindow: false });
});

test.each([
  ['2026-10-01', '2026-10-02', '2026-10-07', true],
  ['2026-10-02', '2026-10-03', '2026-10-07', true],
  ['2026-10-08', null, null, false],
] as const)('Gene availability derives its effective future range when today is %s', async (today, effectiveMin, effectiveMax, hasFuture) => {
  const { service } = dependencies({
    now: () => new Date(`${today}T12:00:00`),
    readCoverage: async () => coverage('2026-09-30'),
  });
  const gene = (await service.availability())[0]!;
  expect(gene).toMatchObject({
    currentDate: today,
    latestObservationDate: '2026-09-30',
    modelMinTargetDate: '2026-10-01',
    modelMaxTargetDate: '2026-10-07',
    effectiveFutureMinDate: effectiveMin,
    effectiveFutureMaxDate: effectiveMax,
    hasFutureForecastWindow: hasFuture,
  });
});
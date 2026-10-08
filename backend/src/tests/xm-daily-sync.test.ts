import { expect, test } from 'bun:test';
import { createXmDailySyncService, type XmDailySyncDependencies, type XmSyncMetric } from '@/services/xm-daily-sync.service';
import { coverageFromConsolidated } from '@/services/xm-coverage.service';
import { supplyCompatibility } from '@/services/forecast.service';
import { offsetDate } from '@/models/xm-gene-ridge-direct-v2/features';

const coverage = (persistedUntil = '2026-09-21', individuallyUsableUntil = persistedUntil, semanticExcludedDates: string[] = []) => ({ historicalFrom: '2024-01-01', persistedUntil, latestReceivedDate: persistedUntil, latestIndividuallyUsableDate: individuallyUsableUntil, semanticExcludedDates });
const records = (metric: XmSyncMetric, day: string, complete = true) => metric === 'DemaSIN'
  ? [{ date: day, hour: null, value: 1 }]
  : Array.from({ length: complete ? 24 : 23 }, (_, index) => ({ date: day, hour: index + 1, value: index + 1 }));

test('DemaSIN coverage preserves latest received and excludes only severe observations', () => {
  const normal = Array.from({ length: 15 }, (_, index) => ({ fecha_xm: `2026-09-${String(index + 13).padStart(2, '0')}`, demanda_kwh: 220_000_000 + (index % 3) * 2_000_000 }));
  const result = coverageFromConsolidated('DemaSIN', [{ energyDataset: { content: { records: [...normal, { fecha_xm: '2026-09-28', demanda_kwh: 138_000 }, { fecha_xm: '2026-09-29', demanda_kwh: 11_310 }] } } }]);
  expect(result).toMatchObject({ historicalFrom: '2026-09-13', persistedUntil: '2026-09-29', latestReceivedDate: '2026-09-29', latestIndividuallyUsableDate: '2026-09-27', semanticExcludedDates: ['2026-09-28','2026-09-29'] });
  expect(result?.demandObservations).toHaveLength(17);
  expect(result?.demandObservations?.at(-1)).toEqual({ date: '2026-09-29', value: 11310 });
});

function dependencies(overrides: Partial<XmDailySyncDependencies> = {}) {
  const calls = { query: [] as string[], ingest: [] as string[], materialize: [] as string[], validate: [] as number[], prepare: [] as number[] };
  const defaults: XmDailySyncDependencies = {
    readCoverage: async () => coverage(),
    query: async input => { calls.query.push(`${input.dataset}:${input.startDate}`); return { records: records(input.dataset, input.startDate) }; },
    ingest: async input => { calls.ingest.push(`${input.metric}:${input.from}:${input.to}`); return { manifestId: calls.ingest.length, energyDatasetId: 900 + calls.ingest.length, reused: false }; },
    materialize: async input => { calls.materialize.push(`${input.metric}:${input.from}:${input.to}`); return { consolidatedDatasetId: 70, energyDatasetId: 970 }; },
    validate: async id => { calls.validate.push(id); return { status: 'aprobado', canProceed: true }; },
    prepare: async id => { calls.prepare.push(id); return { preparedDatasetId: 80, profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0' }; },
    now: () => new Date('2026-09-23T12:00:00Z'),
    readSupplyPrepared: async () => [{
      id: 1, sourceDatasetId: 10, ...supplyCompatibility,
      content: {
        variables: { minimum: [{ name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' }, { name: 'hora_xm', type: 'number', representation: 'integer 1..24' }, { name: 'energia_kwh', type: 'number', unit: 'kWh' }] },
        records: Array.from({ length: 90 }, (_, index) => Array.from({ length: 24 }, (_, period) => ({
          fecha_xm: offsetDate('2026-09-30', -index), hora_xm: period + 1, energia_kwh: 10_000_000,
        }))).flat(),
      },
    }],
  };
  return { calls, service: createXmDailySyncService({ ...defaults, ...overrides }) };
}

test.each([
  ['Gene', '2026-10-08'],
  ['DemaSIN', '2026-10-08'],
  ['PrecBolsNaci', '2026-10-05'],
] as const)('%s explicitly reports NO_NEW_DATA without any artifact pipeline calls', async (metric, persisted) => {
  const { service, calls } = dependencies({
    readCoverage: async () => coverage(persisted),
    now: () => new Date('2026-10-08T17:00:00Z'),
    query: async input => {
      calls.query.push(`${input.dataset}:${input.startDate}:${input.endDate}`);
      return { records: input.startDate === persisted ? records(input.dataset, persisted) : [] };
    },
  });
  expect((await service.sync(metric)).metrics).toEqual([expect.objectContaining({
    metric, status: 'up_to_date', outcome: 'NO_NEW_DATA', persistedUntil: persisted,
    latestCompleteAvailableDate: persisted, requestedFrom: offsetDate(persisted, 1),
    requestedTo: persisted, newDays: 0, ingestedRows: 0, windowsCreatedOrReused: [],
  })]);
  expect(calls.query.at(-1)).toBe(`${metric}:${persisted}:${persisted}`);
  expect(calls.ingest).toEqual([]);
  expect(calls.materialize).toEqual([]);
  expect(calls.validate).toEqual([]);
  expect(calls.prepare).toEqual([]);
});

test('price three-day increment requests exactly October 6..8 and reports 72 new rows', async () => {
  const { service, calls } = dependencies({
    readCoverage: async () => coverage('2026-10-05'),
    now: () => new Date('2026-10-08T17:00:00Z'),
  });
  expect((await service.sync('PrecBolsNaci')).metrics[0]).toMatchObject({
    outcome: 'SYNCED', status: 'synchronized', latestCompleteAvailableDate: '2026-10-08',
    requestedFrom: '2026-10-06', requestedTo: '2026-10-08', newDays: 3, ingestedRows: 72,
  });
  expect(calls.query).toEqual(['PrecBolsNaci:2026-10-08']);
  expect(calls.ingest).toEqual(['PrecBolsNaci:2026-10-06:2026-10-08']);
  expect(calls.materialize).toEqual(['PrecBolsNaci:2024-01-01:2026-10-08']);
  expect(calls.validate).toEqual([970]);
  expect(calls.prepare).toEqual([970]);
});

test('first daily sync without consolidated coverage preserves the explicit missing-coverage error', async () => {
  const { service, calls } = dependencies({ readCoverage: async () => null });
  expect((await service.sync('Gene')).metrics[0]).toMatchObject({
    status: 'failed', error: { code: 'XM_SYNC_COVERAGE_MISSING' },
  });
  expect(calls).toEqual({ query: [], ingest: [], materialize: [], validate: [], prepare: [] });
});

test('provider date below persisted coverage never downloads backwards', async () => {
  const { service, calls } = dependencies({
    readCoverage: async () => coverage('2026-10-09'),
    now: () => new Date('2026-10-08T17:00:00Z'),
  });
  expect((await service.sync('Gene')).metrics[0]).toMatchObject({
    outcome: 'NO_NEW_DATA', persistedUntil: '2026-10-09', latestCompleteAvailableDate: '2026-10-08',
    requestedFrom: '2026-10-10', requestedTo: '2026-10-08', newDays: 0, ingestedRows: 0,
  });
  expect(calls.query).toEqual(['Gene:2026-10-08']);
  expect(calls.ingest).toEqual([]); expect(calls.materialize).toEqual([]);
  expect(calls.validate).toEqual([]); expect(calls.prepare).toEqual([]);
});

test.each(['EXTERNAL_NETWORK_ERROR', 'DATABASE_UNAVAILABLE'])('%s is never reported as NO_NEW_DATA', async code => {
  const fail = async (): Promise<never> => { throw Object.assign(new Error('connection failed'), { code }); };
  const { service, calls } = dependencies(code === 'DATABASE_UNAVAILABLE' ? { readCoverage: fail } : { query: fail });
  const result = (await service.sync('Gene')).metrics[0]!;
  expect(result).toMatchObject({ status: 'failed', error: { code } });
  expect(result.outcome).toBeUndefined();
  expect(calls.ingest).toEqual([]); expect(calls.materialize).toEqual([]);
  expect(calls.validate).toEqual([]); expect(calls.prepare).toEqual([]);
});

test('partial latest price day does not advance beyond the confirmed complete day', async () => {
  const { service, calls } = dependencies({
    readCoverage: async () => coverage('2026-10-05'),
    now: () => new Date('2026-10-08T17:00:00Z'),
    query: async input => ({ records: records(input.dataset, input.startDate, input.startDate !== '2026-10-08') }),
  });
  expect((await service.sync('PrecBolsNaci')).metrics[0]).toMatchObject({
    outcome: 'SYNCED', latestCompleteAvailableDate: '2026-10-07', persistedUntil: '2026-10-07',
    requestedFrom: '2026-10-06', requestedTo: '2026-10-07', newDays: 2, ingestedRows: 48,
  });
  expect(calls.ingest).toEqual(['PrecBolsNaci:2026-10-06:2026-10-07']);
});

test('no complete day confirmed leaves provider metadata null rather than inventing a date', async () => {
  const { service, calls } = dependencies({ query: async () => ({ records: [] }) });
  expect((await service.sync('Gene')).metrics[0]).toMatchObject({
    outcome: 'NO_NEW_DATA', latestCompleteAvailableDate: null, requestedTo: null,
    newDays: 0, ingestedRows: 0,
  });
  expect(calls.ingest).toEqual([]); expect(calls.materialize).toEqual([]);
  expect(calls.validate).toEqual([]); expect(calls.prepare).toEqual([]);
});

test.each(['DemaSIN', 'PrecBolsNaci'] as const)('%s with news remains independent of Gene without news', async changedMetric => {
  const { service, calls } = dependencies({
    readCoverage: async () => coverage('2026-10-05'),
    now: () => new Date('2026-10-08T17:00:00Z'),
    query: async input => ({ records: input.dataset === changedMetric || input.startDate === '2026-10-05'
      ? records(input.dataset, input.startDate) : [] }),
  });
  const result = await service.sync();
  expect(result.metrics.find(item => item.metric === changedMetric)).toMatchObject({ outcome: 'SYNCED', newDays: 3 });
  for (const item of result.metrics.filter(item => item.metric !== changedMetric)) {
    expect(item).toMatchObject({ outcome: 'NO_NEW_DATA', newDays: 0, ingestedRows: 0 });
  }
  expect(calls.ingest).toEqual([`${changedMetric}:2026-10-06:2026-10-08`]);
  expect(calls.materialize).toHaveLength(1); expect(calls.validate).toHaveLength(1); expect(calls.prepare).toHaveLength(1);
});

test('reused complete ingestion windows do not count as newly ingested rows', async () => {
  const { service } = dependencies({
    ingest: async () => ({ manifestId: 1, energyDatasetId: 901, reused: true }),
  });
  expect((await service.sync('Gene')).metrics[0]).toMatchObject({ outcome: 'SYNCED', newDays: 2, ingestedRows: 0 });
});

test('price without news does not suppress simultaneous Gene and DemaSIN increments', async () => {
  const { service, calls } = dependencies({
    readCoverage: async () => coverage('2026-10-05'),
    now: () => new Date('2026-10-08T17:00:00Z'),
    query: async input => ({ records: input.dataset !== 'PrecBolsNaci' || input.startDate === '2026-10-05'
      ? records(input.dataset, input.startDate) : [] }),
  });
  const result = await service.sync();
  expect(result.metrics.map(item => item.outcome)).toEqual(['SYNCED', 'SYNCED', 'NO_NEW_DATA']);
  expect(calls.ingest).toEqual(['Gene:2026-10-06:2026-10-08', 'DemaSIN:2026-10-06:2026-10-08']);
  expect(calls.materialize).toHaveLength(2); expect(calls.validate).toHaveLength(2); expect(calls.prepare).toHaveLength(2);
});

test('an incomplete internal ingestion day fails without materializing or claiming advanced coverage', async () => {
  const { service, calls } = dependencies({
    ingest: async () => { throw Object.assign(new Error('XM no devolvio una ventana completa.'), { code: 'XM_WINDOW_INCOMPLETE' }); },
  });
  const result = (await service.sync('PrecBolsNaci')).metrics[0]!;
  expect(result).toMatchObject({ status: 'failed', error: { code: 'XM_WINDOW_INCOMPLETE' } });
  expect(result.persistedUntil).toBeUndefined(); expect(result.outcome).toBeUndefined();
  expect(calls.materialize).toEqual([]); expect(calls.validate).toEqual([]); expect(calls.prepare).toEqual([]);
});

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

test('forecast availability keeps Gene D+7, Price D+1 and Demand D+6', async () => {
  const { service } = dependencies({ readCoverage: async metric => coverage(metric === 'DemaSIN' ? '2026-09-16' : '2026-09-15') });
  await expect(service.availability()).resolves.toMatchObject([
    { series: 'Gene', currentDate: '2026-09-23', latestObservationDate: '2026-09-15', latestReceivedDate: '2026-09-15', latestIndividuallyUsableDate: '2026-09-15', semanticExcludedDates: [], eligibleFutureTargetDates: [], nextForecastDate: '2026-09-16', supportedHorizonDays: 7, modelMinTargetDate: '2026-09-16', modelMaxTargetDate: '2026-09-22', effectiveFutureMinDate: null, effectiveFutureMaxDate: null, hasFutureForecastWindow: false, dataFreshnessDays: 8 },
    { series: 'DemaSIN', currentDate: '2026-09-23', latestObservationDate: '2026-09-16', latestReceivedDate: '2026-09-16', latestIndividuallyUsableDate: '2026-09-16', semanticExcludedDates: [], eligibleFutureTargetDates: [], nextForecastDate: '2026-09-24', supportedHorizonDays: 6, supportedHorizonMinDays: 1, supportedHorizonMaxDays: 6, modelMinTargetDate: '2026-09-17', modelMaxTargetDate: '2026-09-22', effectiveFutureMinDate: null, effectiveFutureMaxDate: null, hasFutureForecastWindow: false, dataFreshnessDays: 7 },
    { series: 'PrecBolsNaci', currentDate: '2026-09-23', latestObservationDate: '2026-09-15', latestReceivedDate: '2026-09-15', latestIndividuallyUsableDate: '2026-09-15', semanticExcludedDates: [], eligibleFutureTargetDates: [], nextForecastDate: '2026-09-16', supportedHorizonDays: 1, modelMinTargetDate: '2026-09-16', modelMaxTargetDate: '2026-09-16', effectiveFutureMinDate: null, effectiveFutureMaxDate: null, hasFutureForecastWindow: false, dataFreshnessDays: 8 },
  ]);
});

test('DemaSIN availability distinguishes receipt, individual usability and sample eligibility', async () => {
  const { service } = dependencies({ now: () => new Date('2026-10-01T12:00:00'), readCoverage: async metric => metric === 'DemaSIN' ? coverage('2026-09-29', '2026-09-27', ['2026-09-16','2026-09-28','2026-09-29']) : coverage('2026-09-29') });
  const demand = (await service.availability()).find(value => value.series === 'DemaSIN')!;
  expect(demand).toMatchObject({ latestReceivedDate: '2026-09-29', latestIndividuallyUsableDate: '2026-09-27', latestObservationDate: '2026-09-27', semanticExcludedDates: ['2026-09-16','2026-09-28','2026-09-29'], eligibleFutureTargetDates: [], hasFutureForecastWindow: false, dataFreshnessDays: 4 });
});

test('semantic warning persists and prepares DemaSIN with per-observation metadata', async () => {
  const { service, calls } = dependencies({
    readCoverage: async () => coverage('2026-09-27'),
    query: async input => ({ records: input.startDate === '2026-09-29' ? records(input.dataset, input.startDate) : [] }),
    validate: async () => ({ status: 'advertencia', canProceed: true, semanticValidation: { latestIndividuallyUsableDate: '2026-09-27', semanticExcludedDates: ['2026-09-28','2026-09-29'] } }),
    now: () => new Date('2026-10-01T12:00:00'),
  });
  const result = (await service.sync('DemaSIN')).metrics[0]!;
  expect(result).toMatchObject({ status: 'synchronized', providerAvailableUntil: '2026-09-29', persistedUntil: '2026-09-29', latestIndividuallyUsableDate: '2026-09-27', semanticExcludedDates: ['2026-09-28','2026-09-29'], validationStatus: 'advertencia' });
  expect(calls.ingest).toEqual(['DemaSIN:2026-09-28:2026-09-29']); expect(calls.prepare).toEqual([970]);
});

test('received anomalous DemaSIN coverage remains idempotent without reingestion', async () => {
  const { service, calls } = dependencies({ readCoverage: async () => coverage('2026-09-29', '2026-09-27'), query: async () => ({ records: [] }), now: () => new Date('2026-10-01T12:00:00') });
  const result = (await service.sync('DemaSIN')).metrics[0]!;
  expect(result).toMatchObject({ status: 'up_to_date', persistedUntil: '2026-09-29', latestIndividuallyUsableDate: '2026-09-27' });
  expect(calls.ingest).toEqual([]); expect(calls.materialize).toEqual([]); expect(calls.prepare).toEqual([]);
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

test('DemaSIN coverage recovers individual usability after an earlier severe anomaly', () => {
  const records = Array.from({ length: 18 }, (_, index) => ({ fecha_xm: `2026-09-${String(index + 1).padStart(2, '0')}`, demanda_kwh: index === 14 ? 433_980 : 220_000_000 + (index % 3) * 2_000_000 }));
  expect(coverageFromConsolidated('DemaSIN', [{ energyDataset: { content: { records } } }])).toMatchObject({ latestReceivedDate: '2026-09-18', latestIndividuallyUsableDate: '2026-09-18', semanticExcludedDates: ['2026-09-15'] });
});

test('DemaSIN V5 availability requires coherent prepared inputs and a closed origin', async () => {
  const observations = Array.from({ length: 31 }, (_, index) => ({ date: `2026-05-${String(index + 1).padStart(2, '0')}`, value: 220_000_000 + (index % 3) * 2_000_000 }));
  const readCoverage = async (metric: XmSyncMetric) => metric === 'DemaSIN' ? { ...coverage('2026-05-31'), historicalFrom: '2026-05-01', demandObservations: observations } : coverage('2026-05-31');
  const prepared = { id: 1, sourceDatasetId: 10, profileId: 'xm_demandasin_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_demandasin_base', sourceRulesetVersion: '1.0.0', content: { variables: { minimum: [{ name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' }, { name: 'demanda_kwh', type: 'number', unit: 'kWh' }] }, records: observations.map(row => ({ fecha_xm: row.date, demanda_kwh: row.value })) } };
  const { service } = dependencies({ now: () => new Date('2026-06-01T12:00:00Z'), readCoverage, readDemandPrepared: async () => [prepared] });
  const demand = (await service.availability()).find(item => item.series === 'DemaSIN')!;
  expect(demand).toMatchObject({ supportedHorizonMinDays: 1, supportedHorizonMaxDays: 6, eligibleFutureTargetDates: ['2026-06-02','2026-06-03','2026-06-04','2026-06-05','2026-06-06'], effectiveFutureMinDate: '2026-06-02', effectiveFutureMaxDate: '2026-06-06' });
  expect(demand.eligibleFutureTargetDates).not.toContain('2026-06-07');
  const { service: unavailable } = dependencies({ now: () => new Date('2026-06-01T12:00:00Z'), readCoverage });
  expect((await unavailable.availability()).find(item => item.series === 'DemaSIN')!.eligibleFutureTargetDates).toEqual([]);
});

test('DemaSIN availability does not advertise targets when prepared history disagrees with consolidated coverage', async () => {
  const observations = Array.from({ length: 31 }, (_, index) => ({ date: `2026-05-${String(index + 1).padStart(2, '0')}`, value: 220_000_000 + (index % 3) * 2_000_000 }));
  const prepared = { id: 1, sourceDatasetId: 10, profileId: 'xm_demandasin_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_demandasin_base', sourceRulesetVersion: '1.0.0', content: { variables: { minimum: [{ name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' }, { name: 'demanda_kwh', type: 'number', unit: 'kWh' }] }, records: observations.filter(item => item.date !== '2026-05-25').map(item => ({ fecha_xm: item.date, demanda_kwh: item.value })) } };
  const { service } = dependencies({ now: () => new Date('2026-05-31T12:00:00'), readCoverage: async metric => metric === 'DemaSIN' ? { ...coverage('2026-05-31'), demandObservations: observations } : coverage('2026-05-31'), readDemandPrepared: async () => [prepared] });
  expect((await service.availability()).find(item => item.series === 'DemaSIN')).toMatchObject({
    hasFutureForecastWindow: false, availabilityError: { code: 'PREPARED_DATASET_INCONSISTENT' },
  });
});
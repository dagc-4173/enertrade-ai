import { expect, test } from 'bun:test';
import { candidateFutureDates } from '@/services/forecast-future-dates';
import { createXmDailySyncService, type XmDailySyncDependencies } from '@/services/xm-daily-sync.service';
import { coverageFromConsolidated } from '@/services/xm-coverage.service';
import { supplyCompatibility, type StoredPrepared } from '@/services/forecast.service';
import { demandCompatibility } from '@/services/demand-direct-forecast.service';
import { priceCompatibility } from '@/services/price-forecast.service';
import { offsetDate } from '@/models/xm-gene-ridge-direct-v2/features';
import { loadDirectSupplyModel } from '@/models/xm-gene-ridge-direct-v2/model-loader';
import { ForecastError } from '@/services/forecast.contract';

const currentDate = '2026-10-08';
const dates = (count: number) => Array.from({ length: count }, (_, index) => offsetDate(currentDate, index + 1));
const supplyVariables = { minimum: [
  { name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' },
  { name: 'hora_xm', type: 'number', representation: 'integer 1..24' },
  { name: 'energia_kwh', type: 'number', unit: 'kWh' },
] };
const priceVariables = { minimum: [
  { name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' },
  { name: 'periodo', type: 'number', representation: 'integer 1..24' },
  { name: 'precio_cop_kwh', type: 'number', unit: 'COP/kWh' },
] };
function supply(origin = currentDate): StoredPrepared {
  return { id: 1, sourceDatasetId: 10, ...supplyCompatibility, content: {
    variables: supplyVariables,
    records: Array.from({ length: 40 }, (_, day) => Array.from({ length: 24 }, (_, period) =>
      ({ fecha_xm: offsetDate(origin, -day), hora_xm: period + 1, energia_kwh: 10_000_000 + period }))).flat(),
  } };
}
function demandRecords(origin = currentDate, excluded: string[] = []) {
  return Array.from({ length: 70 }, (_, index) => {
    const fecha_xm = offsetDate(origin, index - 69);
    return { fecha_xm, demanda_kwh: excluded.includes(fecha_xm) ? 1 : 220_000_000 + (index % 3) * 1_000_000 };
  });
}
function demand(records = demandRecords()) {
  return { id: 2, sourceDatasetId: 20, ...demandCompatibility, content: {
    variables: { minimum: [{ name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' }, { name: 'demanda_kwh', type: 'number', unit: 'kWh' }] }, records,
  } };
}
function price(day = currentDate, periods = 24) {
  return { id: 3, sourceDatasetId: 30, ...priceCompatibility, content: {
    variables: priceVariables, records: Array.from({ length: periods }, (_, index) => ({
      fecha_xm: day, periodo: index + 1, precio_cop_kwh: index - 1, sourceRecordIndex: index,
    })),
  } };
}
function service(options: { supplyOrigin?: string; demandRows?: ReturnType<typeof demandRecords>; priceRows?: ReturnType<typeof price>[]; overrides?: Partial<XmDailySyncDependencies> } = {}) {
  const rows = options.demandRows ?? demandRecords();
  const origin = options.supplyOrigin ?? currentDate;
  const forbidden = async (): Promise<never> => { throw new Error('Availability must not query XM, infer or write.'); };
  const dependencies: XmDailySyncDependencies = {
    now: () => new Date('2026-10-08T17:00:00Z'),
    readCoverage: async metric => metric === 'DemaSIN'
      ? coverageFromConsolidated(metric, [{ energyDataset: { content: { records: rows } } }])
      : { historicalFrom: '2026-07-01', persistedUntil: origin, latestReceivedDate: origin, latestIndividuallyUsableDate: origin, semanticExcludedDates: [] },
    readSupplyPrepared: async () => [supply(origin)],
    readDemandPrepared: async () => [demand(rows)],
    readPricePrepared: async () => options.priceRows ?? [price()],
    query: forbidden, ingest: forbidden, materialize: forbidden, validate: forbidden, prepare: forbidden,
    ...options.overrides,
  };
  return createXmDailySyncService(dependencies);
}

test('product candidates start tomorrow and never exceed model or seven-day limits', () => {
  expect(candidateFutureDates(currentDate, 7)).toEqual(dates(7));
  expect(candidateFutureDates(currentDate, 6)).toEqual(dates(6));
  expect(candidateFutureDates(currentDate, 1)).toEqual(dates(1));
  expect(candidateFutureDates(currentDate, 10)).toEqual(dates(7));
  expect(() => candidateFutureDates('2026-02-30', 7)).toThrow();
  expect(() => candidateFutureDates(currentDate, 0)).toThrow();
});

test('HU04 A: real h1..h7 and complete origin/features advertise October 9..15 without inference', async () => {
  const result = (await service().availability())[0]!;
  expect(result).toMatchObject({ modelMaxHorizonDays: 7, productMaxHorizonDays: 7, candidateFutureTargetDates: dates(7), eligibleFutureTargetDates: dates(7), availabilityReason: 'AVAILABLE', hasFutureForecastWindow: true });
});

test('HU04 B: only three future targets fit the real origin horizon', async () => {
  const result = (await service({ supplyOrigin: '2026-10-04' }).availability())[0]!;
  expect(result.candidateFutureTargetDates).toEqual(dates(7));
  expect(result.eligibleFutureTargetDates).toEqual(dates(3));
});

test('HU04: only loaded h1..h3 are advertised, with holes preserved for missing models', async () => {
  const limited = (h: number) => { if (h > 3) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); return loadDirectSupplyModel(h); };
  expect((await service({ overrides: { loadSupplyModel: limited } }).availability())[0]!.eligibleFutureTargetDates).toEqual(dates(3));
  const withHole = (h: number) => { if (h === 2) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); return loadDirectSupplyModel(h); };
  expect((await service({ overrides: { loadSupplyModel: withHole } }).availability())[0]!.eligibleFutureTargetDates).toEqual(dates(7).filter(date => date !== '2026-10-10'));
});

test('HU04: missing origin features or conflicting artifacts never advertise targets', async () => {
  expect((await service({ overrides: { readSupplyPrepared: async () => [] } }).availability())[0]).toMatchObject({ eligibleFutureTargetDates: [], availabilityReason: 'NO_BUILDABLE_ORIGIN' });
  const first = supply(), second = supply();
  second.id = 4;
  const content = second.content as { records: { energia_kwh: number }[] };
  content.records[0]!.energia_kwh++;
  await expect(service({ overrides: { readSupplyPrepared: async () => [first, second] } }).availability()).rejects.toMatchObject({ code: 'PREPARED_DATASET_INCONSISTENT' });
});

test('HU06 A: six candidates, but latest closed origin October 7 permits only October 9..13', async () => {
  const result = (await service().availability())[1]!;
  expect(result).toMatchObject({ modelMaxHorizonDays: 6, candidateFutureTargetDates: dates(6), eligibleFutureTargetDates: dates(5), modelMinTargetDate: '2026-10-08', modelMaxTargetDate: '2026-10-13' });
  expect(result.eligibleFutureTargetDates).not.toContain('2026-10-14');
  expect(result.candidateFutureTargetDates).not.toContain('2026-10-15');
});

test('HU06 B: semantically excluded latest origin falls back without promising h7', async () => {
  const result = (await service({ demandRows: demandRecords(currentDate, ['2026-10-07']) }).availability())[1]!;
  expect(result.semanticExcludedDates).toContain('2026-10-07');
  expect(result.eligibleFutureTargetDates).toEqual(dates(4));
  expect(result.modelMinTargetDate).toBe('2026-10-07');
});

test('HU06: missing prepared history gives a concrete reason, not theoretical availability', async () => {
  expect((await service({ overrides: { readDemandPrepared: async () => [] } }).availability())[1]).toMatchObject({ eligibleFutureTargetDates: [], availabilityReason: 'NO_BUILDABLE_ORIGIN' });
});

test('HU08 A: complete D-1 in one B1 artifact advertises only October 9', async () => {
  expect((await service().availability())[2]).toMatchObject({ candidateFutureTargetDates: dates(1), eligibleFutureTargetDates: dates(1), eligiblePreparedDatasetIds: [3], modelMaxHorizonDays: 1, productMaxHorizonDays: 7, availabilityReason: 'AVAILABLE' });
});

test('HU08: multiple valid artifacts advertise the target once and only valid prepared IDs', async () => {
  const complete = price(), otherComplete = price(), incomplete = price(currentDate, 23), stale = price('2026-10-05');
  otherComplete.id = 7; incomplete.id = 8; stale.id = 9;
  const before = structuredClone([complete, otherComplete, incomplete, stale]);
  expect((await service({ priceRows: [complete, otherComplete, incomplete, stale] }).availability())[2]).toMatchObject({ eligibleFutureTargetDates: dates(1), eligiblePreparedDatasetIds: [3, 7] });
  expect([complete, otherComplete, incomplete, stale]).toEqual(before);
});

test.each(['absent', 'incomplete', 'split', 'duplicate', 'invalid'] as const)('HU08 B: %s D-1 is not constructible', async kind => {
  let rows = [price()];
  if (kind === 'absent') rows = [price('2026-10-05')];
  if (kind === 'incomplete') rows = [price(currentDate, 23)];
  if (kind === 'split') {
    const first = price(), second = price(); second.id = 4;
    first.content.records = first.content.records.slice(0, 12);
    second.content.records = second.content.records.slice(12);
    rows = [first, second];
  }
  if (kind === 'duplicate') rows[0]!.content.records.push({ ...rows[0]!.content.records[0]! });
  if (kind === 'invalid') rows[0]!.content.records[0]!.precio_cop_kwh = NaN;
  expect((await service({ priceRows: rows, supplyOrigin: '2026-10-05' }).availability())[2]).toMatchObject({ eligibleFutureTargetDates: [], hasFutureForecastWindow: false, availabilityReason: kind === 'absent' ? 'SOURCE_DATA_STALE' : 'INCOMPLETE_SOURCE_DAY' });
});

test('unexpected availability failures are surfaced, not silently filtered', async () => {
  await expect(service({ overrides: { loadSupplyModel: () => { throw new Error('model IO failure'); } } }).availability()).rejects.toThrow('model IO failure');
});

import { expect, test } from 'bun:test';
import { createEnergyHistoryLiveService } from '@/services/energy-history-live.service';
import { createEnergySeriesService } from '@/services/energy-series.service';
import { ExternalDataError, type ExternalDataResult } from '@/integrations/types/external-data';

const request = { metric: 'gene', from: '2026-10-01', to: '2026-10-03', granularity: 'hourly' };
const empty = createEnergySeriesService({ findMany: async () => [] });
const now = () => new Date('2026-10-22T12:00:00Z');
const reply = (q: any): ExternalDataResult => ({ ...q, unit: 'kWh', granularity: 'hourly', records: Array.from({ length: 24 }, (_, i) => ({ date: q.startDate, hour: i + 1, value: 100 + i })) });

test('consulta XM en cada solicitud y distingue periodos sin publicar', async () => {
  let calls = 0;
  const service = createEnergyHistoryLiveService(async q => { calls++; return reply(q); }, empty, now);
  const result: any = await service.read(request);
  expect(result.freshness).toMatchObject({ source: 'xm', checkedAt: now().toISOString() });
  expect(result.sourceDatasetId).toBeNull();
  expect(result.pointCount).toBe(24);
  expect(result.completeness.missingObservationCount).toBe(48);
  await service.read(request);
  expect(calls).toBe(2);
});

test('divide intervalos diarios en ventanas XM de máximo 30 días', async () => {
  const queries: any[] = [];
  const service = createEnergyHistoryLiveService(async q => { queries.push(q); return { ...q, unit: 'kWh', granularity: 'daily', records: [{ date: q.startDate, hour: null, value: 5 }] }; }, empty, now);
  const result: any = await service.read({ metric: 'demand', from: '2026-09-01', to: '2026-10-02', granularity: 'monthly' });
  expect(queries.map(q => [q.startDate, q.endDate])).toEqual([['2026-09-01', '2026-09-30'], ['2026-10-01', '2026-10-02']]);
  expect(result.points).toEqual([{ date: '2026-09', value: 5 }, { date: '2026-10', value: 5 }]);
});

test('respuesta vacía de XM es ausencia de publicación, sin inventar registros', async () => {
  const service = createEnergyHistoryLiveService(async q => ({ ...reply(q), records: [] }), empty, now);
  const result: any = await service.read(request);
  expect(result.points).toEqual([]);
  expect(result.coverage.availableUntil).toBeNull();
  expect(result.freshness.source).toBe('xm');
});

test('fallo de XM usa respaldo local explícitamente desactualizado', async () => {
  const local = createEnergySeriesService({ findMany: async () => [{ id: 1, metric: 'Gene', requestedFrom: new Date('2026-10-01'), requestedTo: new Date('2026-10-01'), contentHash: 'a'.repeat(64), energyDatasetId: 2, energyDataset: { content: { records: [{ fecha_xm: '2026-10-01', hora_xm: 1, energia_kwh: 10 }] } } }] });
  const result: any = await createEnergyHistoryLiveService(async () => { throw new ExternalDataError(504, 'EXTERNAL_TIMEOUT', 'timeout'); }, local, now).read(request);
  expect(result.freshness.source).toBe('local');
  expect(result.freshness.checkedAt).toBeNull();
  expect(result.points[0].value).toBe(10);
});

test('fallo sin respaldo y rangos inválidos producen errores seguros', async () => {
  const service = createEnergyHistoryLiveService(async () => { throw new ExternalDataError(502, 'EXTERNAL_NETWORK_ERROR', 'network'); }, empty, now);
  await expect(service.read(request)).rejects.toMatchObject({ status: 503 });
  await expect(service.read({ ...request, from: '2024-01-01', granularity: 'monthly' })).rejects.toMatchObject({ status: 413 });
  await expect(service.read({ ...request, metric: 'demand' })).rejects.toMatchObject({ status: 400 });
});

test('deduplica consultas simultáneas al mismo intervalo', async () => {
  let release!: () => void; let calls = 0;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const service = createEnergyHistoryLiveService(async q => { calls++; await wait; return reply(q); }, empty, now);
  const a = service.read(request), b = service.read(request);
  release(); await Promise.all([a, b]); expect(calls).toBe(1);
});

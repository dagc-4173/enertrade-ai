import { describe, expect, mock, test } from 'bun:test';
import { ExternalDataError } from '@/integrations/types/external-data';
import { createXmWindowIngestionService, XmWindowIngestionError } from '@/integrations/xm-window-ingestion.service';

type Window = { id: number; provider: string; metric: string; requestedFrom: Date; requestedTo: Date; status: 'pending' | 'completed' | 'failed'; energyDatasetId: number | null; contentHash: string | null; updatedAt: Date; [key: string]: unknown };
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const identity = (args: any) => `${args.where.provider_metric_requestedFrom_requestedTo.metric}/${args.where.provider_metric_requestedFrom_requestedTo.requestedFrom.toISOString().slice(0, 10)}/${args.where.provider_metric_requestedFrom_requestedTo.requestedTo.toISOString().slice(0, 10)}`;

function store(options: { collision?: boolean; failCompletion?: boolean } = {}) {
  const windows = new Map<string, Window>();
  const datasets: { id: number; data: unknown }[] = [];
  let nextWindow = 1;
  let nextDataset = 100;
  const database: any = {
    xmIngestionWindow: {
      findUnique: mock(async (args: any) => args.where.id === undefined ? windows.get(identity(args)) ?? null : [...windows.values()].find(item => item.id === args.where.id) ?? null),
      create: mock(async ({ data }: any) => {
        const item = { id: nextWindow++, provider: data.provider, metric: data.metric, requestedFrom: data.requestedFrom, requestedTo: data.requestedTo, status: data.status, energyDatasetId: null, contentHash: null, updatedAt: new Date() } as Window;
        const key = `${item.metric}/${item.requestedFrom.toISOString().slice(0, 10)}/${item.requestedTo.toISOString().slice(0, 10)}`;
        if (options.collision) { const error: any = Error('unique'); error.code = 'P2002'; options.collision = false; windows.set(key, { ...item, status: 'completed', energyDatasetId: 77, contentHash: 'a'.repeat(64) }); throw error; }
        windows.set(key, item); return item;
      }),
      update: mock(async ({ where, data }: any) => {
        const item = [...windows.values()].find(value => value.id === where.id);
        if (!item) throw Error('missing window');
        if (options.failCompletion && data.status === 'completed') throw Error('completion failed');
        Object.assign(item, data, { updatedAt: new Date() }); return item;
      }),
      updateMany: mock(async ({ where, data }: any) => {
        if (options.failCompletion && data.status === 'completed') throw Error('completion failed');
        const matches = [...windows.values()].filter(item => item.id === where.id &&
          (where.status === undefined || item.status === where.status) &&
          (where.updatedAt === undefined || where.updatedAt instanceof Date && item.updatedAt.getTime() === where.updatedAt.getTime() ||
            typeof where.updatedAt === 'object' && where.updatedAt.lt instanceof Date && item.updatedAt < where.updatedAt.lt));
        for (const item of matches) Object.assign(item, data, { updatedAt: new Date() });
        return { count: matches.length };
      }),
    },
    energyDataset: { create: mock(async ({ data }: any) => { const item = { id: nextDataset++, data }; datasets.push(item); return item; }) },
    $transaction: mock(async (action: (transaction: any) => Promise<unknown>) => {
      const beforeWindows = structuredClone([...windows.entries()]);
      const beforeDatasets = structuredClone(datasets);
      try { return await action(database); }
      catch (error) { windows.clear(); for (const [key, value] of beforeWindows) windows.set(key, value); datasets.splice(0, datasets.length, ...beforeDatasets); throw error; }
    }),
  };
  return { database, windows, datasets };
}

function result(metric: 'Gene' | 'DemaSIN' | 'PrecBolsNaci', from = '2024-01-01', days = 1, reverse = false) {
  const records = Array.from({ length: days }, (_, dayIndex) => {
    const current = day(from); current.setUTCDate(current.getUTCDate() + dayIndex);
    const date = current.toISOString().slice(0, 10);
    return metric === 'DemaSIN' ? [{ date, hour: null, value: 100 + dayIndex }] : Array.from({ length: 24 }, (_, index) => ({ date, hour: index + 1, value: index + dayIndex }));
  }).flat();
  return { provider: 'xm', dataset: metric, startDate: from, endDate: from, unit: metric === 'PrecBolsNaci' ? 'COP/kWh' : 'kWh', granularity: metric === 'DemaSIN' ? 'daily' as const : 'hourly' as const, records: reverse ? records.reverse() : records };
}

const request = (metric: 'Gene' | 'DemaSIN' | 'PrecBolsNaci', from = '2024-01-01', to = from) => ({ metric, from, to });

describe('C18b-1 manifiesto de ventanas XM', () => {
  test('ventana valida persiste una vez y una repetición se reutiliza sin consultar XM', async () => {
    const fixture = store(); const query = mock(async () => result('Gene'));
    const service = createXmWindowIngestionService({ query } as any, fixture.database);
    const first = await service.ingest(request('Gene'));
    const second = await service.ingest(request('Gene'));
    expect(first.reused).toBe(false); expect(second).toEqual({ ...first, reused: true });
    expect(query).toHaveBeenCalledTimes(1); expect(fixture.datasets).toHaveLength(1); expect(fixture.windows).toHaveLength(1);
  });

  test('rechaza métrica inválida y ventanas de más de 30 días antes de consultar', async () => {
    const query = mock(async () => result('Gene'));
    const service = createXmWindowIngestionService({ query } as any, store().database);
    await expect(service.ingest({ metric: 'Other', from: '2024-01-01', to: '2024-01-01' })).rejects.toMatchObject({ code: 'INVALID_XM_WINDOW' });
    await expect(service.ingest({ metric: 'Gene', from: '2024-01-01', to: '2024-01-31' })).rejects.toMatchObject({ code: 'INVALID_XM_WINDOW' });
    expect(query).not.toHaveBeenCalled();
  });

  test('fallo XM no crea dataset, deja failed y permite un reintento posterior', async () => {
    const fixture = store(); const query = mock<() => Promise<unknown>>(async () => { throw new ExternalDataError(502, 'EXTERNAL_HTTP_ERROR', 'fallo'); });
    const service = createXmWindowIngestionService({ query } as any, fixture.database);
    await expect(service.ingest(request('DemaSIN'))).rejects.toMatchObject({ code: 'EXTERNAL_HTTP_ERROR' });
    expect(fixture.datasets).toHaveLength(0); expect([...fixture.windows.values()][0]!.status).toBe('failed');
    query.mockImplementation(async () => result('DemaSIN'));
    await expect(service.ingest(request('DemaSIN'))).resolves.toMatchObject({ reused: false });
    expect(fixture.datasets).toHaveLength(1); expect([...fixture.windows.values()][0]!.status).toBe('completed');
  });

  test.each([
    ['Gene', (value: any) => value.records.pop(), 'XM_WINDOW_INCOMPLETE'],
    ['DemaSIN', (value: any) => value.records.push({ ...value.records[0] }), 'XM_WINDOW_RESPONSE_INVALID'],
    ['PrecBolsNaci', (value: any) => value.records.pop(), 'XM_WINDOW_INCOMPLETE'],
  ] as const)('rechaza %s incompleto o duplicado sin dataset', async (metric, mutate, code) => {
    const fixture = store(); const malformed: any = result(metric); mutate(malformed);
    const service = createXmWindowIngestionService({ query: async () => malformed } as any, fixture.database);
    await expect(service.ingest(request(metric))).rejects.toMatchObject({ code });
    expect(fixture.datasets).toHaveLength(0); expect([...fixture.windows.values()][0]!.status).toBe('failed');
  });

  test('hash canónico ignora el orden incidental de las filas normalizadas', async () => {
    const first = store(); const second = store();
    const left = await createXmWindowIngestionService({ query: async () => result('PrecBolsNaci') } as any, first.database).ingest(request('PrecBolsNaci'));
    const right = await createXmWindowIngestionService({ query: async () => result('PrecBolsNaci', '2024-01-01', 1, true) } as any, second.database).ingest(request('PrecBolsNaci'));
    expect(left.contentHash).toBe(right.contentHash);
  });

  test('P2002 recupera el manifiesto completed ganador sin consultar XM', async () => {
    const fixture = store({ collision: true }); const query = mock(async () => result('Gene'));
    const value = await createXmWindowIngestionService({ query } as any, fixture.database).ingest(request('Gene'));
    expect(value).toEqual({ manifestId: 1, energyDatasetId: 77, contentHash: 'a'.repeat(64), reused: true }); expect(query).not.toHaveBeenCalled();
  });

  test('un fallo al completar la transacción no deja EnergyDataset parcial', async () => {
    const fixture = store({ failCompletion: true });
    const service = createXmWindowIngestionService({ query: async () => result('Gene') } as any, fixture.database);
    await expect(service.ingest(request('Gene'))).rejects.toBeInstanceOf(Error);
    expect(fixture.datasets).toHaveLength(0);
  });

  test('pending reciente representa una adquisición activa y no vuelve a consultar XM', async () => {
    const fixture = store(); const pending: Window = { id: 1, provider: 'xm', metric: 'Gene', requestedFrom: day('2024-01-01'), requestedTo: day('2024-01-01'), status: 'pending', energyDatasetId: null, contentHash: null, updatedAt: new Date() };
    fixture.windows.set('Gene/2024-01-01/2024-01-01', pending); const query = mock(async () => result('Gene'));
    await expect(createXmWindowIngestionService({ query } as any, fixture.database).ingest(request('Gene'))).rejects.toMatchObject({ code: 'XM_WINDOW_IN_PROGRESS' });
    expect(query).not.toHaveBeenCalled();
  });

  test('pending abandonado recupera el lease sin crear un segundo manifiesto', async () => {
    const current = new Date(); const fixture = store(); const pending: Window = { id: 1, provider: 'xm', metric: 'DemaSIN', requestedFrom: day('2024-01-01'), requestedTo: day('2024-01-01'), status: 'pending', energyDatasetId: null, contentHash: null, updatedAt: new Date(current.getTime() - 300_001) };
    fixture.windows.set('DemaSIN/2024-01-01/2024-01-01', pending); const query = mock(async () => result('DemaSIN'));
    const service = createXmWindowIngestionService({ query } as any, fixture.database, { now: () => current });
    await expect(service.ingest(request('DemaSIN'))).resolves.toMatchObject({ manifestId: 1, reused: false });
    expect(query).toHaveBeenCalledTimes(1); expect(fixture.windows).toHaveLength(1); expect(fixture.datasets).toHaveLength(1);
  });

  test('dos recuperaciones simultáneas de pending abandonado conceden un único lease', async () => {
    const current = new Date(); const fixture = store(); const pending: Window = { id: 1, provider: 'xm', metric: 'Gene', requestedFrom: day('2024-01-01'), requestedTo: day('2024-01-01'), status: 'pending', energyDatasetId: null, contentHash: null, updatedAt: new Date(current.getTime() - 300_001) };
    fixture.windows.set('Gene/2024-01-01/2024-01-01', pending); const query = mock(async () => result('Gene'));
    const service = createXmWindowIngestionService({ query } as any, fixture.database, { now: () => current });
    const outcomes = await Promise.allSettled([service.ingest(request('Gene')), service.ingest(request('Gene'))]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(1); expect(fixture.windows).toHaveLength(1); expect(fixture.datasets).toHaveLength(1);
  });
});
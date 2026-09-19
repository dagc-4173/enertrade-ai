import { describe, expect, mock, test } from 'bun:test';
import { createXmConsolidatedDatasetService } from '@/integrations/xm-consolidated-dataset.service';

type Metric = 'Gene' | 'DemaSIN' | 'PrecBolsNaci';
const corpus = (metric: Metric = 'Gene', hash = 'a'.repeat(64), windows = [1], datasets = [101]) => ({ metric, from: '2024-01-01', to: '2024-01-03', rowCount: metric === 'DemaSIN' ? 3 : 72, sourceWindowIds: windows, sourceDatasetIds: datasets, contentHash: hash, coverage: { complete: true as const }, unit: metric === 'PrecBolsNaci' ? 'COP/kWh' : 'kWh', granularity: metric === 'DemaSIN' ? 'daily' : 'hourly', records: metric === 'DemaSIN' ? [{ fecha_xm: '2024-01-01', demanda_kwh: 100 }] : metric === 'Gene' ? [{ fecha_xm: '2024-01-01', hora_xm: 1, energia_kwh: 100 }] : [{ fecha_xm: '2024-01-01', periodo: 1, precio_cop_kwh: 100 }] });

function store(options: { rejectProvenance?: boolean; collision?: boolean; failCreate?: boolean } = {}) {
  const rows: any[] = []; const datasets: any[] = []; let next = 1;
  const database: any = {
    xmConsolidatedDataset: {
      findUnique: mock(async ({ where }: any) => rows.find(row => row.metric === where.metric_requestedFrom_requestedTo_contentHash.metric && row.contentHash === where.metric_requestedFrom_requestedTo_contentHash.contentHash) ?? null),
      create: mock(async ({ data }: any) => { if (options.collision) { options.collision = false; const error: any = Error('unique'); error.code = 'P2002'; throw error; } const row = { id: next++, ...data, sources: data.sources.create.map((source: any) => ({ xmIngestionWindowId: source.xmIngestionWindowId })) }; rows.push(row); return row; }),
    },
    xmIngestionWindow: { findMany: mock(async ({ where }: any) => options.rejectProvenance ? [] : where.id.in.map((id: number, index: number) => ({ id, metric: where.metric, status: where.status, energyDatasetId: index + 101 }))) },
    energyDataset: { create: mock(async ({ data }: any) => { if (options.failCreate) throw Error('write failed'); const row = { id: datasets.length + 501, data }; datasets.push(row); return row; }) },
    $transaction: mock(async (action: (transaction: any) => Promise<unknown>) => { const snapshot = structuredClone([rows, datasets]) as [any[], any[]]; try { return await action(database); } catch (error) { rows.splice(0, rows.length, ...snapshot[0]); datasets.splice(0, datasets.length, ...snapshot[1]); throw error; } }),
  };
  return { database, rows, datasets };
}

describe('C18b-1.6 materialización XM consolidada', () => {
  test('materializa contenido canónico y procedencia relacional una sola vez', async () => {
    const fixture = store(); const consolidate = mock(async () => corpus()); const service = createXmConsolidatedDatasetService({ consolidate } as any, fixture.database);
    const first = await service.materialize({ metric: 'Gene', from: '2024-01-01', to: '2024-01-03' }); const second = await service.materialize({ metric: 'Gene', from: '2024-01-01', to: '2024-01-03' });
    expect(first).toMatchObject({ energyDatasetId: 501, sourceWindowIds: [1], sourceDatasetIds: [101], reused: false }); expect(second.reused).toBe(true); expect(fixture.datasets).toHaveLength(1); expect(fixture.rows).toHaveLength(1); expect(fixture.datasets[0].data.content.columns).toEqual([{ name: 'fecha_xm', optional: false }, { name: 'hora_xm', optional: false }, { name: 'energia_kwh', optional: false }]);
  });

  test('un hash diferente materializa otro corpus lógico y conserva dos ventanas fuente', async () => {
    const fixture = store(); let value = corpus('DemaSIN', 'a'.repeat(64), [1, 2], [101, 102]); const service = createXmConsolidatedDatasetService({ consolidate: async () => value } as any, fixture.database);
    await service.materialize({}); value = corpus('DemaSIN', 'b'.repeat(64), [1, 2], [101, 102]); const second = await service.materialize({});
    expect(second.reused).toBe(false); expect(second.sourceWindowIds).toEqual([1, 2]); expect(fixture.rows).toHaveLength(2);
  });

  test('rechaza ventanas no completed antes de crear dataset y revierte ante fallo', async () => {
    const rejected = store({ rejectProvenance: true }); const source = { consolidate: async () => corpus() };
    await expect(createXmConsolidatedDatasetService(source as any, rejected.database).materialize({})).rejects.toMatchObject({ code: 'XM_CONSOLIDATION_PROVENANCE_INVALID' }); expect(rejected.datasets).toHaveLength(0);
    const failed = store({ failCreate: true }); await expect(createXmConsolidatedDatasetService(source as any, failed.database).materialize({})).rejects.toBeInstanceOf(Error); expect(failed.rows).toHaveLength(0); expect(failed.datasets).toHaveLength(0);
  });

  test('P2002 recupera el consolidado ganador sin dataset duplicado', async () => {
    const fixture = store({ collision: true }); fixture.rows.push({ id: 8, metric: 'Gene', contentHash: 'a'.repeat(64), energyDatasetId: 900, sources: [{ xmIngestionWindowId: 1 }] });
    const result = await createXmConsolidatedDatasetService({ consolidate: async () => corpus() } as any, fixture.database).materialize({});
    expect(result).toMatchObject({ consolidatedDatasetId: 8, energyDatasetId: 900, reused: true }); expect(fixture.datasets).toHaveLength(0);
  });
});
import { describe, expect, test } from 'bun:test';
import { createXmWindowConsolidationService } from '@/integrations/xm-window-consolidation.service';

const day = (value: string) => new Date(`${value}T00:00:00Z`);
type Metric = 'Gene' | 'DemaSIN' | 'PrecBolsNaci';

function records(metric: Metric, from: string, days: number) {
  return Array.from({ length: days }, (_, dayIndex) => {
    const current = day(from); current.setUTCDate(current.getUTCDate() + dayIndex); const fecha_xm = current.toISOString().slice(0, 10);
    return metric === 'DemaSIN' ? [{ fecha_xm, demanda_kwh: 100 + dayIndex }] : Array.from({ length: 24 }, (_, index) => metric === 'Gene' ? { fecha_xm, hora_xm: index + 1, energia_kwh: 100 + dayIndex + index } : { fecha_xm, periodo: index + 1, precio_cop_kwh: 100 + dayIndex + index });
  }).flat();
}

function window(id: number, metric: Metric, from: string, days: number, rows = records(metric, from, days)) {
  const to = day(from); to.setUTCDate(to.getUTCDate() + days - 1);
  return { id, metric, requestedFrom: day(from), requestedTo: to, status: 'completed', energyDatasetId: id + 100, energyDataset: { id: id + 100, content: { records: rows } } };
}

function service(windows: ReturnType<typeof window>[]) {
  return createXmWindowConsolidationService({ xmIngestionWindow: { findMany: async () => windows } } as any);
}

describe('C18b-1.5 consolidación multiventana XM', () => {
  test.each([
    ['Gene', 144], ['DemaSIN', 6], ['PrecBolsNaci', 144],
  ] as const)('consolida dos ventanas consecutivas de %s con continuidad', async (metric, rowCount) => {
    const result = await service([window(1, metric, '2024-01-01', 3), window(2, metric, '2024-01-04', 3)]).consolidate({ metric, from: '2024-01-01', to: '2024-01-06' });
    expect(result).toMatchObject({ rowCount, sourceWindowIds: [1, 2], sourceDatasetIds: [101, 102], coverage: { requestedDays: 6, completeDays: 6, complete: true } });
    expect(result.contentHash).toHaveLength(64);
  });

  test('deduplica solapamiento idéntico y falla si el valor de la misma identidad difiere', async () => {
    const first = records('DemaSIN', '2024-01-01', 3); const shared = first.slice(2);
    const duplicate = await service([window(1, 'DemaSIN', '2024-01-01', 3, first), window(2, 'DemaSIN', '2024-01-03', 3, [...shared, ...records('DemaSIN', '2024-01-04', 2)])]).consolidate({ metric: 'DemaSIN', from: '2024-01-01', to: '2024-01-05' });
    expect(duplicate.rowCount).toBe(5);
    await expect(service([window(1, 'DemaSIN', '2024-01-01', 3), window(2, 'DemaSIN', '2024-01-03', 3, [{ fecha_xm: '2024-01-03', demanda_kwh: 999 }, ...records('DemaSIN', '2024-01-04', 2)])]).consolidate({ metric: 'DemaSIN', from: '2024-01-01', to: '2024-01-05' })).rejects.toMatchObject({ code: 'XM_CONSOLIDATION_CONFLICT' });
  });

  test('falla explícitamente cuando existe un hueco entre ventanas', async () => {
    await expect(service([window(1, 'Gene', '2024-01-01', 3), window(2, 'Gene', '2024-01-05', 2)]).consolidate({ metric: 'Gene', from: '2024-01-01', to: '2024-01-06' })).rejects.toMatchObject({ code: 'XM_CONSOLIDATION_INCOMPLETE' });
  });
});
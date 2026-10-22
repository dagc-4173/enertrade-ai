import { describe, expect, test } from 'bun:test';
import { createXmWindowConsolidationService } from '@/integrations/xm-window-consolidation.service';
import type { XmMetric } from '@/integrations/xm-window-ingestion.service';
import { appendCanonicalSnapshot, appendSourceProvenance, type ExperimentalSourceWindow } from './helpers/xm-append-only.experimental';

type RecordRow = Record<string, string | number>;
type Window = {
  id: number; metric: XmMetric; requestedFrom: Date; requestedTo: Date; status: string;
  energyDatasetId: number; energyDataset: { id: number; content: { records: RecordRow[] } };
};
const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
function records(metric: XmMetric, from: number, to: number): RecordRow[] {
  return Array.from({ length: to - from + 1 }, (_, index): RecordRow[] => {
    const day = from + index;
    if (metric === 'DemaSIN') return [{ fecha_xm: date(day), demanda_kwh: 220_000_000 + day }];
    return Array.from({ length: 24 }, (_, period): RecordRow => metric === 'Gene'
      ? { fecha_xm: date(day), hora_xm: period + 1, energia_kwh: 10_000_000 + day * 24 + period }
      : { fecha_xm: date(day), periodo: period + 1, precio_cop_kwh: period === 0 ? 0 : period === 1 ? -day : day + period / 10 });
  }).flat();
}
function window(id: number, metric: XmMetric, from: number, to: number, rows = records(metric, from, to)): Window {
  return { id, metric, requestedFrom: asDate(date(from)), requestedTo: asDate(date(to)), status: 'completed',
    energyDatasetId: 100 + id, energyDataset: { id: 100 + id, content: { records: rows } } };
}
function full(metric: XmMetric, windows: Window[], to = 8) {
  return createXmWindowConsolidationService({
    xmIngestionWindow: { findMany: async () => structuredClone(windows) },
  }).consolidate({ metric, from: date(1), to: date(to) });
}
function descriptor(source: Window): ExperimentalSourceWindow {
  return { id: source.id, energyDatasetId: source.energyDatasetId,
    from: source.requestedFrom.toISOString().slice(0, 10), to: source.requestedTo.toISOString().slice(0, 10) };
}
async function fixture(metric: XmMetric) {
  const historical = [window(7, metric, 3, 5), window(2, metric, 1, 3)];
  const previous = await full(metric, historical, 5);
  return { historical, previous, delta: records(metric, 6, 8) };
}
function identities(metric: XmMetric, rows: RecordRow[]) {
  return rows.map(row => metric === 'DemaSIN' ? row.fecha_xm :
    `${row.fecha_xm}/${row[metric === 'Gene' ? 'hora_xm' : 'periodo']}`);
}

describe('Experimental XM append-only: canonical content, not semantic validation or runtime integration', () => {
  for (const metric of ['Gene', 'DemaSIN', 'PrecBolsNaci'] as const) {
    test(`${metric}: strict posterior multiple-day delta equals full content, order, range and hash`, async () => {
      const { historical, previous, delta } = await fixture(metric);
      const nextWindows = [window(11, metric, 6, 7), window(4, metric, 8, 8)];
      const expected = await full(metric, [...nextWindows, ...historical]);
      const before = structuredClone({ previous, delta });
      const actual = appendCanonicalSnapshot(previous, { to: date(8), records: delta });
      const provenance = appendSourceProvenance(historical.map(descriptor), nextWindows.map(descriptor));
      expect({ ...actual, ...provenance }).toEqual(expected);
      expect(actual.records).toEqual(records(metric, 1, 8));
      expect(identities(metric, actual.records)).toEqual(identities(metric, expected.records));
      expect(new Set(identities(metric, actual.records)).size).toBe(actual.rowCount);
      expect(actual.records[0]!.fecha_xm).toBe(date(1));
      expect(actual.records.at(-1)!.fecha_xm).toBe(date(8));
      expect(actual.rowCount).toBe(metric === 'DemaSIN' ? 8 : 8 * 24);
      expect({ previous, delta }).toEqual(before);
    });

    test(`${metric}: reversed delta and window order preserve canonical representation`, async () => {
      const { historical, previous, delta } = await fixture(metric);
      const reversed = [...delta].reverse().map(row => Object.fromEntries(Object.entries(row).reverse()));
      const expected = await full(metric, [window(3, metric, 6, 8, reversed), ...historical.reverse()]);
      const actual = appendCanonicalSnapshot(previous, { to: date(8), records: reversed });
      expect(actual.records).toEqual(expected.records);
      expect(actual.contentHash).toBe(expected.contentHash);
      expect(JSON.stringify(actual.records)).toBe(JSON.stringify(expected.records));
    });

    test(`${metric}: identical boundary overlap deduplicates without replacing values`, async () => {
      const { historical, previous } = await fixture(metric);
      const delta = records(metric, 5, 8);
      const expected = await full(metric, [...historical, window(3, metric, 5, 8, delta)]);
      const actual = appendCanonicalSnapshot(previous, { to: date(8), records: delta });
      expect(actual.records).toEqual(expected.records);
      expect(actual.contentHash).toBe(expected.contentHash);
      expect(actual.rowCount).toBe(expected.rowCount);
    });

    test(`${metric}: retroactive October 5 X->Y is conflict in both algorithms, never new-wins`, async () => {
      const { historical, previous } = await fixture(metric);
      const changed = records(metric, 5, 8);
      const valueField = metric === 'Gene' ? 'energia_kwh' : metric === 'DemaSIN' ? 'demanda_kwh' : 'precio_cop_kwh';
      changed[0]![valueField] = Number(changed[0]![valueField]) + 1;
      const before = structuredClone(previous);
      await expect(full(metric, [...historical, window(3, metric, 5, 8, changed)])).rejects.toMatchObject({ code: 'XM_CONSOLIDATION_CONFLICT' });
      expect(() => appendCanonicalSnapshot(previous, { to: date(8), records: changed })).toThrow(expect.objectContaining({ code: 'XM_CONSOLIDATION_CONFLICT' }));
      expect(previous).toEqual(before);
    });

    test(`${metric}: missing boundary day is rejected equally, not silently appended`, async () => {
      const { historical, previous } = await fixture(metric);
      const delta = records(metric, 7, 8);
      await expect(full(metric, [...historical, window(3, metric, 7, 8, delta)])).rejects.toMatchObject({ code: 'XM_CONSOLIDATION_INCOMPLETE' });
      expect(() => appendCanonicalSnapshot(previous, { to: date(8), records: delta })).toThrow(expect.objectContaining({ code: 'XM_CONSOLIDATION_INCOMPLETE' }));
    });

    test(`${metric}: missing final observation/day does not certify the requested endpoint`, async () => {
      const { historical, previous, delta } = await fixture(metric);
      delta.pop();
      await expect(full(metric, [...historical, window(3, metric, 6, 8, delta)])).rejects.toMatchObject({ code: 'XM_CONSOLIDATION_INCOMPLETE' });
      expect(() => appendCanonicalSnapshot(previous, { to: date(8), records: delta })).toThrow(expect.objectContaining({ code: 'XM_CONSOLIDATION_INCOMPLETE' }));
    });

    test(`${metric}: overlapping new windows, identical repeated records and retry are deterministic`, async () => {
      const { historical, previous } = await fixture(metric);
      const windows = [window(3, metric, 6, 7), window(9, metric, 7, 8)];
      const delta = windows.flatMap(source => source.energyDataset.content.records);
      const expected = await full(metric, [...historical, ...windows]);
      const first = appendCanonicalSnapshot(previous, { to: date(8), records: delta });
      const retried = appendCanonicalSnapshot(first, { to: date(8), records: delta });
      expect(retried).toEqual(first);
      expect(retried.records).toEqual(expected.records);
      expect(retried.contentHash).toBe(expected.contentHash);
      const sources = appendSourceProvenance(historical.map(descriptor), windows.map(descriptor));
      expect(sources.sourceWindowIds).toEqual(expected.sourceWindowIds);
      expect(sources.sourceDatasetIds).toEqual(expected.sourceDatasetIds);
      expect(appendSourceProvenance([...historical, ...windows].map(descriptor), windows.map(descriptor))).toEqual(sources);
    });

    test(`${metric}: canonical content/hash cannot identify additional identical source windows`, async () => {
      const { historical, previous, delta } = await fixture(metric);
      const newWindow = window(3, metric, 6, 8);
      const fullWithoutAdditionalSource = await full(metric, [...historical, newWindow]);
      const fullWithAdditionalSource = await full(metric, [...historical, window(12, metric, 1, 5), newWindow]);
      const actual = appendCanonicalSnapshot(previous, { to: date(8), records: delta });
      expect(actual.records).toEqual(fullWithAdditionalSource.records);
      expect(actual.contentHash).toBe(fullWithAdditionalSource.contentHash);
      expect(fullWithoutAdditionalSource.contentHash).toBe(fullWithAdditionalSource.contentHash);
      expect(fullWithoutAdditionalSource.sourceWindowIds).not.toEqual(fullWithAdditionalSource.sourceWindowIds);
      expect(fullWithoutAdditionalSource.sourceDatasetIds).not.toEqual(fullWithAdditionalSource.sourceDatasetIds);
      const knownSourcesOnly = appendSourceProvenance(historical.map(descriptor), [descriptor(newWindow)]);
      expect(knownSourcesOnly.sourceWindowIds).not.toEqual(fullWithAdditionalSource.sourceWindowIds);
      expect(knownSourcesOnly.sourceDatasetIds).not.toEqual(fullWithAdditionalSource.sourceDatasetIds);
    });
  }

  test('missing/inconsistent source descriptors cannot be repaired from canonical records', () => {
    expect(() => appendSourceProvenance([{ id: 1, energyDatasetId: 101, from: date(1), to: date(5) }],
      [{ id: 1, energyDatasetId: 102, from: date(1), to: date(5) }])).toThrow(expect.objectContaining({ code: 'XM_CONSOLIDATION_PROVENANCE_INVALID' }));
    expect(() => appendSourceProvenance([], [{ id: 1, energyDatasetId: 0, from: date(1), to: date(5) }])).toThrow(expect.objectContaining({ code: 'XM_CONSOLIDATION_PROVENANCE_INVALID' }));
  });
});

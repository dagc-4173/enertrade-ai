import { expect, test, beforeAll } from 'bun:test';
import { acquireHourlyDemand, type HourlyDemandAcquisition } from '@/integrations/xm-hourly-demand-acquisition';
import { corpusWindows, prepareHourlyDemandCorpus, corpusHash } from '@/integrations/xm-hourly-demand-corpus';

let acquisitions: HourlyDemandAcquisition[];
beforeAll(async () => {
  acquisitions = await Promise.all(corpusWindows().map(range => acquireHourlyDemand(range, async url => {
    if (url.endsWith('/Lists')) return Response.json({ Items: [{ ListEntities: [{ Values: {
      MetricId: 'DemaReal', Entity: 'Sistema', MetricUnits: 'kWh', Type: 'HourlyEntities', MaxDays: 31,
      Url: 'https://servapibi.xm.com.co/hourly', MetricDescription: 'Demanda del SIN (no incluye Alumbrado Público)',
    } }] }] });
    const items = [];
    for (let day = Date.parse(range.startDate); day <= Date.parse(range.endDate); day += 86400000) {
      items.push({ Date: new Date(day).toISOString().slice(0, 10), HourlyEntities: [{ Id: 'Sistema', Values: { code: 'Sistema',
        ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`Hour${String(i + 1).padStart(2, '0')}`, String(8000000 + i)])) } }] });
    }
    return Response.json({ Metric: { Id: 'DemaReal' }, Items: items });
  })));
});
test('CORPUS-01 HU01/02/03: windows contiguous, <=30 days, fixed full leap-year coverage', () => {
  const windows = corpusWindows();
  expect(windows).toHaveLength(37);
  expect(windows[0]?.startDate).toBe('2023-01-01'); expect(windows.at(-1)?.endDate).toBe('2025-12-31');
  windows.forEach((w, i) => {
    expect((Date.parse(w.endDate) - Date.parse(w.startDate)) / 86400000 + 1).toBeLessThanOrEqual(30);
    if (i) expect(Date.parse(w.startDate) - Date.parse(windows[i - 1]!.endDate)).toBe(86400000);
  });
});
test('CORPUS-02 HU03: exact partitions, deterministic output regardless of input order, row provenance', () => {
  const a = prepareHourlyDemandCorpus(acquisitions), b = prepareHourlyDemandCorpus([...acquisitions].reverse());
  expect(a).toEqual(b); expect(a.manifest.rowCount).toBe(26304); expect(a.manifest.completeDays).toBe(1096);
  expect(a.manifest.partitions.map(p => p.rowCount)).toEqual([17544, 4344, 4416]);
  expect(a.manifest.corpusSha256).toBe(corpusHash(a.csv));
  const lines = a.csv.trimEnd().split('\n');
  expect(lines[17544]).toContain('2024-12-31,24,8000023,train,');
  expect(lines[17545]).toContain('2025-01-01,1,8000000,validation,');
  expect(lines[21889]).toContain('2025-07-01,1,8000000,test,');
  expect(lines.filter(line => line.startsWith('2024-02-29,'))).toHaveLength(24);
  expect(a.manifest.sources).toHaveLength(37);
  expect(a.csv).not.toContain('\r'); expect(a.csv.endsWith('\n')).toBe(true);
});
test('CORPUS-03 HU02: missing or repeated windows cannot produce a corpus', () => {
  expect(() => prepareHourlyDemandCorpus(acquisitions.slice(1))).toThrow('CORPUS_WINDOW_COUNT_INVALID');
  expect(() => prepareHourlyDemandCorpus([acquisitions[1]!, ...acquisitions.slice(1)])).toThrow('CORPUS_DUPLICATE_WINDOW');
});
test('CORPUS-04 HU02: tampered acquisition fails before preparation', () => {
  const changed = structuredClone(acquisitions); changed[0]!.normalized.records[0]!.demanda_real_kwh++;
  expect(() => prepareHourlyDemandCorpus(changed)).toThrow();
});

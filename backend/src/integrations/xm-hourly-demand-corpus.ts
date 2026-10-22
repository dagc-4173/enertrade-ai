import { createHash } from 'node:crypto';
import { replayHourlyDemand, type HourlyDemandAcquisition, type HourlyDemandRange } from './xm-hourly-demand-acquisition';

export const corpusProtocol = {
  id: 'xm-demareal-hourly-2023-2025', version: '1.0.0',
  range: { startDate: '2023-01-01', endDate: '2025-12-31' },
  partitions: [
    { id: 'train', startDate: '2023-01-01', endDate: '2024-12-31', expectedRows: 17544 },
    { id: 'validation', startDate: '2025-01-01', endDate: '2025-06-30', expectedRows: 4344 },
    { id: 'test', startDate: '2025-07-01', endDate: '2025-12-31', expectedRows: 4416 },
  ],
  target: 'demanda_real_kwh', metric: 'DemaReal', entity: 'Sistema', unit: 'kWh',
  expectedDays: 1096, expectedRows: 26304, windowDays: 30,
  temporalIdentity: 'fecha_xm + periodo XM 1..24; sin timestamp inferido',
  evaluationScope: 'retrospective; historical publication times and revisions not reconstructed',
  transformations: 'sort only; no imputation, scaling, clipping, rounding or feature fitting',
} as const;
export const corpusHash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function corpusWindows(): HourlyDemandRange[] {
  const result: HourlyDemandRange[] = [];
  const end = Date.parse(corpusProtocol.range.endDate);
  for (let start = Date.parse(corpusProtocol.range.startDate); start <= end; start += 30 * 86400000) {
    result.push({ startDate: date(start), endDate: date(Math.min(end, start + 29 * 86400000)) });
  }
  return result;
}
export const windowId = (range: HourlyDemandRange) => `${range.startDate}_${range.endDate}`;

export function prepareHourlyDemandCorpus(acquisitions: HourlyDemandAcquisition[]) {
  const windows = corpusWindows();
  if (acquisitions.length !== windows.length) throw Error('CORPUS_WINDOW_COUNT_INVALID');
  const byRange = new Map<string, HourlyDemandAcquisition>();
  for (const acquisition of acquisitions) {
    const id = windowId(acquisition.manifest.requestedRange);
    if (byRange.has(id)) throw Error('CORPUS_DUPLICATE_WINDOW');
    byRange.set(id, acquisition);
  }
  const rows: { fecha_xm: string; periodo: number; demanda_real_kwh: number; partition: string; window_id: string; source_record_index: number }[] = [];
  const provenance = [];
  let description: unknown;
  for (const range of windows) {
    const id = windowId(range), acquisition = byRange.get(id);
    if (!acquisition) throw Error('CORPUS_WINDOW_MISSING');
    const normalized = replayHourlyDemand(acquisition);
    const currentDescription = acquisition.manifest.catalogEntry.MetricDescription;
    if (description !== undefined && currentDescription !== description) throw Error('CORPUS_CATALOG_SEMANTICS_CHANGED');
    description = currentDescription;
    normalized.records.forEach((row, source_record_index) => {
      const partition = corpusProtocol.partitions.find(p => row.fecha_xm >= p.startDate && row.fecha_xm <= p.endDate);
      if (!partition) throw Error('CORPUS_PARTITION_INVALID');
      rows.push({ ...row, partition: partition.id, window_id: id, source_record_index });
    });
    provenance.push({ windowId: id, ...range, retrievedAt: acquisition.manifest.retrievedAt,
      catalogRetrievedAt: acquisition.manifest.catalogRetrievedAt, rawSha256: acquisition.manifest.rawSha256,
      catalogSha256: acquisition.manifest.catalogSha256, normalizedSha256: acquisition.manifest.normalizedSha256,
      recordCount: normalized.records.length });
  }
  rows.sort((a, b) => a.fecha_xm.localeCompare(b.fecha_xm) || a.periodo - b.periodo);
  const start = Date.parse(corpusProtocol.range.startDate);
  if (rows.length !== corpusProtocol.expectedRows) throw Error('CORPUS_ROW_COUNT_INVALID');
  rows.forEach((row, i) => {
    if (row.fecha_xm !== date(start + Math.floor(i / 24) * 86400000) || row.periodo !== i % 24 + 1) throw Error('CORPUS_CALENDAR_INVALID');
  });
  const partitions = corpusProtocol.partitions.map(partition => {
    const selected = rows.filter(r => r.partition === partition.id);
    if (selected.length !== partition.expectedRows) throw Error('CORPUS_PARTITION_COUNT_INVALID');
    return { ...partition, rowCount: selected.length, completeDays: selected.length / 24 };
  });
  const csv = 'fecha_xm,periodo,demanda_real_kwh,partition,window_id,source_record_index\n' + rows.map(r =>
    `${r.fecha_xm},${r.periodo},${r.demanda_real_kwh},${r.partition},${r.window_id},${r.source_record_index}`).join('\n') + '\n';
  const manifest = {
    status: 'prepared_experimental', protocol: corpusProtocol, corpusSha256: corpusHash(csv),
    encoding: 'UTF-8 without BOM; LF; final newline', rowCount: rows.length, completeDays: rows.length / 24,
    quality: { missingPeriods: 0, duplicatePeriods: 0, nonfiniteValues: 0, negativeValues: 0 },
    partitions, sources: provenance, catalogDescription: description,
    limitations: ['DemaReal excludes public lighting and is not DemaSIN.',
      'Only structural quality and provenance verified; no claim of historical publication availability or model performance.',
      'Targets in validation/test are for scoring only; no fitting or tuning on final test.',
      'Public access does not establish universal redistribution permission; keep raw snapshots local pending license verification.',
      'No timestamps, weather alignment, Prisma PreparedDataset or trained model created.'],
  };
  return { csv, manifest };
}

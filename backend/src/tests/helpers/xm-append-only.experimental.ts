import { createHash } from 'node:crypto';
import { isDate } from '@/integrations/types/external-data';
import { XmWindowConsolidationError } from '@/integrations/xm-window-consolidation.service';
import type { XmMetric } from '@/integrations/xm-window-ingestion.service';

type CanonicalRecord = Record<string, string | number>;
export type ExperimentalSnapshot = {
  metric: XmMetric; from: string; to: string; records: readonly CanonicalRecord[];
};
export type ExperimentalDelta = { to: string; records: readonly CanonicalRecord[] };
export type ExperimentalSourceWindow = {
  id: number; energyDatasetId: number; from: string; to: string;
};

const definitions = {
  Gene: { unit: 'kWh', granularity: 'hourly', value: 'energia_kwh', period: 'hora_xm' },
  DemaSIN: { unit: 'kWh', granularity: 'daily', value: 'demanda_kwh', period: null },
  PrecBolsNaci: { unit: 'COP/kWh', granularity: 'hourly', value: 'precio_cop_kwh', period: 'periodo' },
} as const;
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
const offset = (day: string, count: number) => {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
};
const fail = (code: string): never => {
  const status = code === 'INVALID_XM_CONSOLIDATION_RANGE' ? 400 : code === 'XM_CONSOLIDATION_INCOMPLETE' ? 422 : 409;
  throw new XmWindowConsolidationError(status, code, `Experimental append-only: ${code}`);
};

function canonical(metric: XmMetric, row: CanonicalRecord): CanonicalRecord {
  const definition = definitions[metric];
  const value = row[definition.value];
  if (!isDate(row.fecha_xm) || typeof value !== 'number' || !Number.isFinite(value)) {
    return fail('XM_CONSOLIDATION_CONTENT_INVALID');
  }
  if (definition.period === null) return { fecha_xm: row.fecha_xm, demanda_kwh: value };
  const period = row[definition.period];
  if (typeof period !== 'number' || !Number.isInteger(period) || period < 1 || period > 24) return fail('XM_CONSOLIDATION_CONTENT_INVALID');
  return metric === 'Gene'
    ? { fecha_xm: row.fecha_xm, hora_xm: period, energia_kwh: value }
    : { fecha_xm: row.fecha_xm, periodo: period, precio_cop_kwh: value };
}

function merge(metric: XmMetric, input: readonly CanonicalRecord[]) {
  const definition = definitions[metric];
  const values = new Map<string, CanonicalRecord>();
  for (const inputRow of input) {
    const row = canonical(metric, inputRow);
    const identity = definition.period === null ? String(row.fecha_xm) : `${row.fecha_xm}/${row[definition.period]}`;
    const previous = values.get(identity);
    if (previous && previous[definition.value] !== row[definition.value]) return fail('XM_CONSOLIDATION_CONFLICT');
    if (!previous) values.set(identity, row);
  }
  return [...values.values()].sort((left, right) => String(left.fecha_xm).localeCompare(String(right.fecha_xm)) ||
    (definition.period === null ? 0 : Number(left[definition.period]) - Number(right[definition.period])));
}

function complete(metric: XmMetric, from: string, to: string, records: readonly CanonicalRecord[]) {
  const periodField = definitions[metric].period;
  const byDay = new Map<string, Set<number | null>>();
  for (const row of records) {
    const day = String(row.fecha_xm);
    if (day < from || day > to) return fail('XM_CONSOLIDATION_CONTENT_INVALID');
    const periods = byDay.get(day) ?? new Set<number | null>();
    periods.add(periodField === null ? null : Number(row[periodField]));
    byDay.set(day, periods);
  }
  const expected = periodField === null ? [null] : Array.from({ length: 24 }, (_, index) => index + 1);
  for (let day = from; day <= to; day = offset(day, 1)) {
    const periods = byDay.get(day);
    if (!periods || periods.size !== expected.length || expected.some(period => !periods.has(period))) return fail('XM_CONSOLIDATION_INCOMPLETE');
  }
}

// Test-only specification, not a production optimization: rechecks the supplied prefix.
export function appendCanonicalSnapshot(previous: ExperimentalSnapshot, delta: ExperimentalDelta) {
  if (!isDate(previous.from) || !isDate(previous.to) || !isDate(delta.to) || previous.from > previous.to || delta.to < previous.to) {
    return fail('INVALID_XM_CONSOLIDATION_RANGE');
  }
  const prefix = merge(previous.metric, previous.records);
  complete(previous.metric, previous.from, previous.to, prefix);
  const records = merge(previous.metric, [...prefix, ...delta.records]);
  complete(previous.metric, previous.from, delta.to, records);
  const definition = definitions[previous.metric];
  // No public production hash helper exists; equality is checked against its real output.
  const contentHash = createHash('sha256').update(JSON.stringify({
    metric: previous.metric, unit: definition.unit, granularity: definition.granularity, records,
  })).digest('hex');
  const count = days(previous.from, delta.to);
  return { metric: previous.metric, from: previous.from, to: delta.to, rowCount: records.length,
    records, unit: definition.unit, granularity: definition.granularity, contentHash,
    coverage: { requestedDays: count, completeDays: count, complete: true as const } };
}

// Descriptors must come from actual source metadata, never from canonical values or hashes.
export function appendSourceProvenance(previous: readonly ExperimentalSourceWindow[], delta: readonly ExperimentalSourceWindow[]) {
  const sources = new Map<number, ExperimentalSourceWindow>();
  for (const source of [...previous, ...delta]) {
    if (!Number.isSafeInteger(source.id) || source.id < 1 || !Number.isSafeInteger(source.energyDatasetId) ||
      source.energyDatasetId < 1 || !isDate(source.from) || !isDate(source.to) || source.from > source.to) {
      return fail('XM_CONSOLIDATION_PROVENANCE_INVALID');
    }
    const existing = sources.get(source.id);
    if (existing && (existing.energyDatasetId !== source.energyDatasetId || existing.from !== source.from || existing.to !== source.to)) {
      return fail('XM_CONSOLIDATION_PROVENANCE_INVALID');
    }
    sources.set(source.id, { ...source });
  }
  const ordered = [...sources.values()].sort((left, right) =>
    left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.id - right.id);
  return { sourceWindowIds: ordered.map(source => source.id), sourceDatasetIds: ordered.map(source => source.energyDatasetId) };
}

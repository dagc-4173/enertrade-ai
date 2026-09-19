import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { isDate } from './types/external-data';
import type { XmMetric } from './xm-window-ingestion.service';

type ConsolidationInput = { metric: XmMetric; from: string; to: string };
type StoredWindow = {
  id: number; metric: string; requestedFrom: Date; requestedTo: Date; status: string;
  energyDatasetId: number | null; energyDataset: { id: number; content: unknown } | null;
};
type ConsolidationStore = { xmIngestionWindow: { findMany(args: unknown): Promise<StoredWindow[]> } };
type CanonicalRecord = Record<string, string | number>;

const store: ConsolidationStore = prisma as unknown as ConsolidationStore;
const definitions = {
  Gene: { unit: 'kWh', granularity: 'hourly', value: 'energia_kwh', period: 'hora_xm' },
  DemaSIN: { unit: 'kWh', granularity: 'daily', value: 'demanda_kwh', period: null },
  PrecBolsNaci: { unit: 'COP/kWh', granularity: 'hourly', value: 'precio_cop_kwh', period: 'periodo' },
} as const;

export class XmWindowConsolidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
const date = (value: Date) => value.toISOString().slice(0, 10);
const expectedPeriods = (metric: XmMetric) => definitions[metric].period === null ? [null] : Array.from({ length: 24 }, (_, index) => index + 1);

function validInput(input: unknown): input is ConsolidationInput {
  return object(input) && Object.keys(input).length === 3 && (input.metric === 'Gene' || input.metric === 'DemaSIN' || input.metric === 'PrecBolsNaci') &&
    isDate(input.from) && isDate(input.to) && input.from <= input.to;
}

function normalize(metric: XmMetric, content: unknown) {
  if (!object(content) || !Array.isArray(content.records)) throw new XmWindowConsolidationError(409, 'XM_CONSOLIDATION_CONTENT_INVALID', 'Una ventana completada no contiene registros XM válidos.');
  const definition = definitions[metric];
  return content.records.map((row): CanonicalRecord => {
    if (!object(row) || !isDate(row.fecha_xm) || typeof row[definition.value] !== 'number' || !Number.isFinite(row[definition.value])) throw new XmWindowConsolidationError(409, 'XM_CONSOLIDATION_CONTENT_INVALID', 'Una ventana completada contiene un registro XM inválido.');
    if (definition.period === null) return { fecha_xm: row.fecha_xm, demanda_kwh: row.demanda_kwh as number };
    const period = row[definition.period];
    if (typeof period !== 'number' || !Number.isInteger(period) || period < 1 || period > 24) throw new XmWindowConsolidationError(409, 'XM_CONSOLIDATION_CONTENT_INVALID', 'Una ventana completada contiene un periodo XM inválido.');
    return metric === 'Gene' ? { fecha_xm: row.fecha_xm, hora_xm: period, energia_kwh: row.energia_kwh as number } : { fecha_xm: row.fecha_xm, periodo: period, precio_cop_kwh: row.precio_cop_kwh as number };
  });
}

function key(metric: XmMetric, row: CanonicalRecord) {
  return definitions[metric].period === null ? row.fecha_xm as string : `${row.fecha_xm}/${row[definitions[metric].period!] as number}`;
}

function compare(metric: XmMetric, left: CanonicalRecord, right: CanonicalRecord) {
  const byDate = String(left.fecha_xm).localeCompare(String(right.fecha_xm));
  if (byDate) return byDate;
  const field = definitions[metric].period;
  return field === null ? 0 : Number(left[field]) - Number(right[field]);
}

function same(metric: XmMetric, left: CanonicalRecord, right: CanonicalRecord) {
  return left[definitions[metric].value] === right[definitions[metric].value];
}

function validateCoverage(metric: XmMetric, from: string, to: string, records: CanonicalRecord[]) {
  const coverage = new Map<string, Set<number | null>>();
  for (const row of records) {
    const current = coverage.get(row.fecha_xm as string) ?? new Set<number | null>();
    current.add(definitions[metric].period === null ? null : row[definitions[metric].period!] as number);
    coverage.set(row.fecha_xm as string, current);
  }
  let completeDays = 0;
  for (let current = new Date(`${from}T00:00:00Z`); date(current) <= to; current.setUTCDate(current.getUTCDate() + 1)) {
    const periods = coverage.get(date(current)); const expected = expectedPeriods(metric);
    if (!periods || periods.size !== expected.length || expected.some(period => !periods.has(period))) throw new XmWindowConsolidationError(422, 'XM_CONSOLIDATION_INCOMPLETE', 'Las ventanas completadas no cubren el rango solicitado sin huecos.');
    completeDays++;
  }
  return { requestedDays: days(from, to), completeDays, complete: true as const };
}

export function createXmWindowConsolidationService(database: ConsolidationStore = store) {
  return {
    async consolidate(input: unknown) {
      if (!validInput(input)) throw new XmWindowConsolidationError(400, 'INVALID_XM_CONSOLIDATION_RANGE', 'El rango de consolidación XM no es válido.');
      const windows = await database.xmIngestionWindow.findMany({ where: { provider: 'xm', metric: input.metric, status: 'completed', requestedFrom: { lte: new Date(`${input.to}T00:00:00Z`) }, requestedTo: { gte: new Date(`${input.from}T00:00:00Z`) } }, include: { energyDataset: { select: { id: true, content: true } } } });
      const ordered = windows.sort((left, right) => date(left.requestedFrom).localeCompare(date(right.requestedFrom)) || date(left.requestedTo).localeCompare(date(right.requestedTo)) || left.id - right.id);
      const merged = new Map<string, CanonicalRecord>();
      for (const window of ordered) {
        if (window.metric !== input.metric || window.status !== 'completed' || window.energyDatasetId === null || !window.energyDataset || window.energyDataset.id !== window.energyDatasetId) throw new XmWindowConsolidationError(409, 'XM_CONSOLIDATION_WINDOW_INVALID', 'El manifiesto completado no está relacionado de forma consistente con su dataset.');
        for (const row of normalize(input.metric, window.energyDataset.content)) {
          if ((row.fecha_xm as string) < input.from || (row.fecha_xm as string) > input.to) continue;
          const identity = key(input.metric, row); const existing = merged.get(identity);
          if (existing && !same(input.metric, existing, row)) throw new XmWindowConsolidationError(409, 'XM_CONSOLIDATION_CONFLICT', 'Dos ventanas completadas contienen valores distintos para la misma identidad temporal.');
          if (!existing) merged.set(identity, row);
        }
      }
      const records = [...merged.values()].sort((left, right) => compare(input.metric, left, right));
      const coverage = validateCoverage(input.metric, input.from, input.to, records);
      const definition = definitions[input.metric];
      const contentHash = createHash('sha256').update(JSON.stringify({ metric: input.metric, unit: definition.unit, granularity: definition.granularity, records })).digest('hex');
      return { metric: input.metric, from: input.from, to: input.to, rowCount: records.length, sourceWindowIds: ordered.map(window => window.id), sourceDatasetIds: ordered.map(window => window.energyDatasetId!), contentHash, coverage, unit: definition.unit, granularity: definition.granularity, records };
    },
  };
}
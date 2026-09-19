import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { ExternalDataError, isDate, type ExternalDataResult } from './types/external-data';
import type { ExternalDataService } from './external-data.service';

export type XmMetric = 'Gene' | 'DemaSIN' | 'PrecBolsNaci';
type WindowInput = { metric: XmMetric; from: string; to: string };
type WindowStatus = 'pending' | 'completed' | 'failed';
type Window = {
  id: number; provider: string; metric: string; requestedFrom: Date; requestedTo: Date;
  status: WindowStatus; energyDatasetId: number | null; contentHash: string | null;
  updatedAt: Date;
};
type WindowStore = {
  xmIngestionWindow: {
    findUnique(args: unknown): Promise<Window | null>;
    create(args: unknown): Promise<Window>;
    update(args: unknown): Promise<Window>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  energyDataset: { create(args: unknown): Promise<{ id: number }> };
  $transaction<T>(action: (transaction: WindowStore) => Promise<T>): Promise<T>;
};

const store: WindowStore = prisma as unknown as WindowStore;
const definitions = {
  Gene: { dataType: 'generacion', unit: 'kWh', granularity: 'hourly', columns: ['fecha_xm', 'hora_xm', 'energia_kwh'], mapping: 'xm-gene-v1' },
  DemaSIN: { dataType: 'demanda', unit: 'kWh', granularity: 'daily', columns: ['fecha_xm', 'demanda_kwh'], mapping: 'xm-demandasin-v1' },
  PrecBolsNaci: { dataType: 'precios', unit: 'COP/kWh', granularity: 'hourly', columns: ['fecha_xm', 'periodo', 'precio_cop_kwh'], mapping: 'xm-preciobolsnaci-v1' },
} as const;

export class XmWindowIngestionError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const calendarDays = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
const date = (value: Date) => value.toISOString().slice(0, 10);
const key = (input: WindowInput) => ({ provider_metric_requestedFrom_requestedTo: { provider: 'xm', metric: input.metric, requestedFrom: new Date(`${input.from}T00:00:00Z`), requestedTo: new Date(`${input.to}T00:00:00Z`) } });

function validInput(input: unknown): input is WindowInput {
  return object(input) && Object.keys(input).length === 3 && (input.metric === 'Gene' || input.metric === 'DemaSIN' || input.metric === 'PrecBolsNaci') &&
    isDate(input.from) && isDate(input.to) && input.from <= input.to && calendarDays(input.from, input.to) <= 30;
}

function records(result: ExternalDataResult, input: WindowInput) {
  const definition = definitions[input.metric];
  if (result.unit !== definition.unit || result.granularity !== definition.granularity) throw new XmWindowIngestionError(502, 'XM_WINDOW_RESPONSE_INVALID', 'XM devolvió una unidad o granularidad no compatible.');
  const byDate = new Map<string, Map<number | null, number>>();
  for (const row of result.records) {
    if (!isDate(row.date) || row.date < input.from || row.date > input.to || typeof row.value !== 'number' || !Number.isFinite(row.value)) throw new XmWindowIngestionError(502, 'XM_WINDOW_RESPONSE_INVALID', 'XM devolvió registros no válidos.');
    if (definition.granularity === 'daily' ? row.hour !== null : typeof row.hour !== 'number' || !Number.isInteger(row.hour) || row.hour < 1 || row.hour > 24) throw new XmWindowIngestionError(502, 'XM_WINDOW_RESPONSE_INVALID', 'XM devolvió periodos no válidos.');
    const periods = byDate.get(row.date) ?? new Map<number | null, number>();
    if (periods.has(row.hour)) throw new XmWindowIngestionError(502, 'XM_WINDOW_RESPONSE_INVALID', 'XM devolvió registros duplicados.');
    periods.set(row.hour, row.value); byDate.set(row.date, periods);
  }
  for (let current = new Date(`${input.from}T00:00:00Z`); date(current) <= input.to; current.setUTCDate(current.getUTCDate() + 1)) {
    const periods = byDate.get(date(current));
    const expected = definition.granularity === 'daily' ? [null] : Array.from({ length: 24 }, (_, index) => index + 1);
    if (!periods || periods.size !== expected.length || expected.some(period => !periods.has(period))) throw new XmWindowIngestionError(422, 'XM_WINDOW_INCOMPLETE', 'XM no devolvió una ventana completa.');
  }
  return [...byDate.entries()].flatMap(([fecha_xm, periods]) => [...periods.entries()].sort(([left], [right]) => (left ?? 0) - (right ?? 0)).map(([period, value]) =>
    input.metric === 'Gene' ? { fecha_xm, hora_xm: period!, energia_kwh: value } : input.metric === 'DemaSIN' ? { fecha_xm, demanda_kwh: value } : { fecha_xm, periodo: period!, precio_cop_kwh: value },
  )).sort((left, right) => String(left.fecha_xm).localeCompare(String(right.fecha_xm)) || Number(('hora_xm' in left ? left.hora_xm : 'periodo' in left ? left.periodo : 0)) - Number(('hora_xm' in right ? right.hora_xm : 'periodo' in right ? right.periodo : 0)));
}

function hash(metric: XmMetric, unit: string, granularity: string, values: object[]) {
  return createHash('sha256').update(JSON.stringify({ metric, unit, granularity, records: values })).digest('hex');
}

function source(input: WindowInput, unit: string) {
  return `XM/SINERGOX;metric=${input.metric};unit=${unit};startDate=${input.from};endDate=${input.to};mapping=${definitions[input.metric].mapping}`;
}

function reused(window: Window) {
  if (window.energyDatasetId === null || window.contentHash === null) throw new XmWindowIngestionError(409, 'XM_WINDOW_INCONSISTENT', 'El manifiesto de ingesta está incompleto.');
  return { manifestId: window.id, energyDatasetId: window.energyDatasetId, contentHash: window.contentHash, reused: true as const };
}

function uniqueError(error: unknown) {
  return object(error) && error.code === 'P2002';
}

const pendingLeaseMs = 5 * 60_000;
type IngestionOptions = { now?: () => Date; pendingLeaseMs?: number };

export function createXmWindowIngestionService(external: Pick<ExternalDataService, 'query'>, database: WindowStore = store, options: IngestionOptions = {}) {
  const now = options.now ?? (() => new Date());
  const leaseMs = options.pendingLeaseMs ?? pendingLeaseMs;
  if (!Number.isInteger(leaseMs) || leaseMs <= 0) throw new Error('pendingLeaseMs must be a positive integer.');

  async function claimFailed(window: Window) {
    const claimed = await database.xmIngestionWindow.updateMany({ where: { id: window.id, status: 'failed' }, data: { status: 'pending', errorCode: null, fetchedAt: null } });
    if (claimed.count !== 1) return null;
    return database.xmIngestionWindow.findUnique({ where: key({ metric: window.metric as XmMetric, from: date(window.requestedFrom), to: date(window.requestedTo) }) });
  }

  async function recoverPending(window: Window) {
    const cutoff = new Date(now().getTime() - leaseMs);
    if (window.updatedAt >= cutoff) return null;
    const recovered = await database.xmIngestionWindow.updateMany({ where: { id: window.id, status: 'pending', updatedAt: { lt: cutoff } }, data: { errorCode: null, fetchedAt: null } });
    if (recovered.count !== 1) return null;
    return database.xmIngestionWindow.findUnique({ where: key({ metric: window.metric as XmMetric, from: date(window.requestedFrom), to: date(window.requestedTo) }) });
  }

  return {
    async ingest(input: unknown) {
      if (!validInput(input)) throw new XmWindowIngestionError(400, 'INVALID_XM_WINDOW', 'La ventana XM no es válida.');
      let window = await database.xmIngestionWindow.findUnique({ where: key(input) });
      if (window?.status === 'completed') return reused(window);
      if (window?.status === 'pending') window = await recoverPending(window);
      if (window?.status === 'failed') window = await claimFailed(window);
      if (!window) {
        const existing = await database.xmIngestionWindow.findUnique({ where: key(input) });
        if (existing?.status === 'completed') return reused(existing);
        if (existing) throw new XmWindowIngestionError(409, 'XM_WINDOW_IN_PROGRESS', 'La ventana XM ya está en proceso.');
      }
      if (!window) {
        try { window = await database.xmIngestionWindow.create({ data: { provider: 'xm', metric: input.metric, requestedFrom: new Date(`${input.from}T00:00:00Z`), requestedTo: new Date(`${input.to}T00:00:00Z`), status: 'pending' } }); }
        catch (error) {
          if (!uniqueError(error)) throw error;
          const winner = await database.xmIngestionWindow.findUnique({ where: key(input) });
          if (winner?.status === 'completed') return reused(winner);
          throw new XmWindowIngestionError(409, 'XM_WINDOW_IN_PROGRESS', 'La ventana XM ya está en proceso.');
        }
      }
      try {
        const result = await external.query({ provider: 'xm', dataset: input.metric, startDate: input.from, endDate: input.to });
        const normalized = records(result, input);
        const contentHash = hash(input.metric, result.unit, result.granularity, normalized);
        const saved = await database.$transaction(async transaction => {
          const dataset = await transaction.energyDataset.create({ data: {
            source: source(input, result.unit), dataType: definitions[input.metric].dataType,
            content: { columns: definitions[input.metric].columns.map(name => ({ name, optional: false })), records: normalized }, pendingOptionalFields: [],
          } });
          const completed = await transaction.xmIngestionWindow.updateMany({ where: { id: window.id, status: 'pending', updatedAt: window.updatedAt }, data: {
            status: 'completed', source: source(input, result.unit), receivedFrom: new Date(`${input.from}T00:00:00Z`), receivedTo: new Date(`${input.to}T00:00:00Z`), rowCount: normalized.length,
            contentHash, fetchedAt: now(), errorCode: null, energyDatasetId: dataset.id,
          } });
          if (completed.count !== 1) throw new XmWindowIngestionError(409, 'XM_WINDOW_LEASE_LOST', 'La recuperación de la ventana fue reemplazada por otro proceso.');
          const current = await transaction.xmIngestionWindow.findUnique({ where: { id: window.id } });
          if (!current) throw new Error('Missing completed XM window.');
          return current;
        });
        return { manifestId: saved.id, energyDatasetId: saved.energyDatasetId!, contentHash, reused: false as const };
      } catch (error) {
        if (!(error instanceof XmWindowIngestionError && error.code === 'XM_WINDOW_LEASE_LOST')) await database.xmIngestionWindow.updateMany({ where: { id: window.id, status: 'pending', updatedAt: window.updatedAt }, data: { status: 'failed', errorCode: error instanceof ExternalDataError || error instanceof XmWindowIngestionError ? error.code : 'XM_WINDOW_FAILED', fetchedAt: now() } });
        throw error;
      }
    },
  };
}
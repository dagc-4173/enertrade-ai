import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { isObject } from '@/integrations/types/external-data';
import { forecastObservationsService } from './forecast-observations.service';
import { ForecastHistoryError, historyDay, historyErrors, historyFilters, snapshotForecast, type HistorySnapshot, type HistoryFilters } from './forecast-history.contract';

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (isObject(v)) return Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])]));
  return v;
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export type HistoryEvaluation = ReturnType<typeof historyErrors> & { source: string; checkedAt: string; observationSha256: string; forecastSha256: string };
export type HistoryRow = { id: string; userId: string; requestId: string; createdAt: Date; targetDate: Date; originDate: Date; series: string; method: string; modelId: string; modelVersion: string; unit: string; source: string; horizonDays: number; forecastSha256: string; forecastSnapshot: unknown; evaluationSnapshot: unknown; evaluatedAt: Date | null; lastCheckedAt: Date | null; lastCheckStatus: string | null };
type SaveInput = { userId: string; requestId: string; createdAt: Date; snapshot: HistorySnapshot; forecastSha256: string };
export interface HistoryRepository {
  save(input: SaveInput): Promise<HistoryRow>;
  list(userId: string, filters: HistoryFilters): Promise<{ items: HistoryRow[]; total: number }>;
  find(userId: string, id: string): Promise<HistoryRow | null>;
  evaluate(userId: string, id: string, evaluation: HistoryEvaluation, at: Date): Promise<HistoryRow | null>;
  checked(userId: string, id: string, state: string, at: Date): Promise<void>;
}
export function createHistoryRepository(db = prisma): HistoryRepository {
  return {
    async save({ snapshot, forecastSha256, ...identity }) {
      const { predictions: _predictions, traceId: _traceId, artifactSha256: _artifactSha256, ...metadata } = snapshot;
      const row = await db.forecastHistory.upsert({ where: { userId_requestId: { userId: identity.userId, requestId: identity.requestId } }, update: {}, create: { ...identity, ...metadata, targetDate: new Date(snapshot.targetDate), originDate: new Date(snapshot.originDate), forecastSha256, forecastSnapshot: snapshot as unknown as Prisma.InputJsonValue } });
      if (row.forecastSha256 !== forecastSha256) throw new ForecastHistoryError(409,'HISTORY_REQUEST_CONFLICT','La ejecución ya tiene otro resultado registrado.');
      return row;
    },
    async list(userId, filters) {
      const where: Prisma.ForecastHistoryWhereInput = { userId, ...(filters.series ? { series: filters.series } : {}), ...(filters.method ? { method: filters.method } : {}), ...(filters.status === 'pending' ? { evaluatedAt: null } : filters.status === 'evaluated' ? { evaluatedAt: { not: null } } : {}), ...((filters.from || filters.to) ? { targetDate: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } } : {}) };
      const [items,total] = await db.$transaction([db.forecastHistory.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (filters.page - 1) * 20, take: 20 }), db.forecastHistory.count({ where })]);
      return { items, total };
    },
    find: (userId,id) => db.forecastHistory.findFirst({ where: { userId, id } }),
    async evaluate(userId,id,evaluation,at) {
      // First complete evaluation wins, including across processes. Never replace the original forecast.
      await db.forecastHistory.updateMany({ where: { id, userId, evaluatedAt: null }, data: { evaluatedAt: at, lastCheckedAt: at, lastCheckStatus: 'evaluated', evaluationSnapshot: evaluation as unknown as Prisma.InputJsonValue } });
      return db.forecastHistory.findFirst({ where: { userId, id } });
    },
    async checked(userId,id,state,at) { await db.forecastHistory.updateMany({ where: { id, userId, evaluatedAt: null }, data: { lastCheckedAt: at, lastCheckStatus: state } }); }
  };
}
const notFound = (): never => { throw new ForecastHistoryError(404,'FORECAST_HISTORY_NOT_FOUND','El pronóstico no está disponible en tu historial.'); };
export function historyDto(row: HistoryRow, detail = false) {
  const evaluation = row.evaluationSnapshot as HistoryEvaluation | null;
  return { id: row.id, createdAt: row.createdAt.toISOString(), targetDate: row.targetDate.toISOString().slice(0,10), originDate: row.originDate.toISOString().slice(0,10), series: row.series, method: row.method, modelId: row.modelId, modelVersion: row.modelVersion, source: row.source, unit: row.unit, horizonDays: row.horizonDays, forecastSha256: row.forecastSha256, status: row.evaluatedAt ? 'evaluated' : 'pending', evaluatedAt: row.evaluatedAt?.toISOString() ?? null, lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null, lastCheckStatus: row.lastCheckStatus, metrics: evaluation?.metrics ?? null, ...(detail ? { predictions: (row.forecastSnapshot as HistorySnapshot).predictions, evaluation } : {}) };
}
export function createForecastHistoryService(repo: HistoryRepository = createHistoryRepository(), observations = forecastObservationsService, now = () => new Date()) {
  const pending = new Map<string, Promise<ReturnType<typeof historyDto>>>();
  async function owned(userId: string,id: string) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return notFound();
    return await repo.find(userId,id) ?? notFound();
  }
  return {
    async record(userId: string, requestId: string, result: unknown) {
      const snapshot = snapshotForecast(result), createdAt = now();
      // Do not create misleading prospective records for old B1/debug calls.
      if (snapshot.originDate > historyDay(createdAt)) throw new ForecastHistoryError(422,'HISTORY_FUTURE_ORIGIN','El origen observado no puede ser futuro.');
      if (snapshot.targetDate <= historyDay(createdAt)) return { status: 'not_registered' as const, id: null };
      const saved = await repo.save({ userId, requestId, createdAt, snapshot, forecastSha256: hash(snapshot) });
      return { status: 'saved' as const, id: saved.id };
    },
    async list(userId: string,query: unknown) {
      const filters = historyFilters(query), result = await repo.list(userId,filters);
      return { items: result.items.map(r => historyDto(r)), total: result.total, page: filters.page, pageSize: 20 };
    },
    async get(userId: string,id: string) { return historyDto(await owned(userId,id),true); },
    async evaluate(userId: string,id: string) {
      const original = await owned(userId,id);
      if (original.evaluatedAt) return historyDto(original,true);
      const key = `${userId}/${id}`;
      if (pending.has(key)) return pending.get(key)!;
      if (pending.size >= 2) throw new ForecastHistoryError(429,'HISTORY_EVALUATION_BUSY','Hay otras evaluaciones en curso. Intenta nuevamente.');
      const task = (async () => {
        const snapshot = original.forecastSnapshot as HistorySnapshot;
        if (hash(snapshot) !== original.forecastSha256) throw new ForecastHistoryError(409,'HISTORY_INTEGRITY_FAILED','El pronóstico guardado requiere revisión de integridad.');
        const actual = await observations.read({ series: snapshot.series, date: snapshot.targetDate });
        if (!isObject(actual) || actual.series !== snapshot.series || actual.date !== snapshot.targetDate || actual.unit !== snapshot.unit || actual.source !== snapshot.source || !Array.isArray(actual.points)) throw new ForecastHistoryError(502,'HISTORY_OBSERVATIONS_INVALID','Las observaciones no corresponden al pronóstico.');
        if (actual.status !== 'available') {
          if (actual.status !== 'pending' && actual.status !== 'unavailable') throw new ForecastHistoryError(502,'HISTORY_OBSERVATIONS_INVALID','No se pudo interpretar la publicación XM.');
          await repo.checked(userId,id,actual.status === 'pending' ? 'day_not_finished' : 'not_published',now());
          return historyDto(await owned(userId,id),true);
        }
        if (snapshot.targetDate >= historyDay(now()) || typeof actual.checkedAt !== 'string' || !Number.isFinite(Date.parse(actual.checkedAt))) throw new ForecastHistoryError(409,'HISTORY_DAY_NOT_FINISHED','El día objetivo aún no ha finalizado en Colombia.');
        const result = historyErrors(snapshot.predictions,actual.points as { period: number; value: number }[]);
        const evaluated = await repo.evaluate(userId,id,{ ...result, source: snapshot.source, checkedAt: actual.checkedAt, forecastSha256: original.forecastSha256, observationSha256: hash(actual.points) },now());
        return historyDto(evaluated ?? notFound(),true);
      })().finally(() => pending.delete(key));
      pending.set(key,task);
      return task;
    }
  };
}
export const forecastHistoryService = createForecastHistoryService();

import { createHash } from 'node:crypto';
import { ExternalDataService } from '@/integrations/external-data.service';
import { XmProvider } from '@/integrations/providers/xm.provider';
import { ExternalDataError, type ExternalDataResult } from '@/integrations/types/external-data';
import { aggregate, definitions, valid, limit, EnergySeriesError, energySeriesService } from './energy-series.service';

const external = new ExternalDataService([new XmProvider()]);
const add = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
type Query = (input: { provider: string; dataset: string; startDate: string; endDate: string }) => Promise<ExternalDataResult>;

export function createEnergyHistoryLiveService(query: Query = input => external.query(input), fallback = energySeriesService, now = () => new Date()) {
  const pending = new Map<string, Promise<unknown>>();
  return {
    async read(input: unknown): Promise<unknown> {
      if (!valid(input)) throw new EnergySeriesError(400, 'INVALID_ENERGY_SERIES_QUERY', 'Selecciona un intervalo histórico válido.');
      limit(input);
      const definition = definitions[input.metric];
      if (!(definition.allowed as readonly string[]).includes(input.granularity)) throw new EnergySeriesError(400, 'UNSUPPORTED_ENERGY_SERIES_GRANULARITY', 'La demanda histórica DemaSIN tiene resolución diaria.');
      if (input.to > add(input.from, 365)) throw new EnergySeriesError(413, 'ENERGY_SERIES_RANGE_TOO_LARGE', 'La consulta actualizada a XM permite hasta 366 días por solicitud.');
      const key = JSON.stringify([input.metric, input.from, input.to, input.granularity]);
      if (pending.has(key)) return pending.get(key)!;
      if (pending.size >= 2) throw new EnergySeriesError(429, 'ENERGY_HISTORY_BUSY', 'Hay consultas a XM en curso. Intenta de nuevo en unos segundos.');
      const task = (async () => {
        const checkedAt = now().toISOString();
        try {
          const records: ExternalDataResult['records'] = [];
          for (let start = input.from; start <= input.to; start = add(start, 30)) {
            if (now().getTime() - Date.parse(checkedAt) > 45000) throw new ExternalDataError(504, 'EXTERNAL_TIMEOUT', 'La consulta a XM superó el tiempo permitido.');
            const end = add(start, 29) < input.to ? add(start, 29) : input.to;
            const result = await query({ provider: 'xm', dataset: definition.xmMetric, startDate: start, endDate: end });
            records.push(...result.records);
          }
          const unique = new Map(records.map(row => [`${row.date}|${row.hour ?? ''}`, row]));
          const raw = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.hour ?? 0) - (b.hour ?? 0)).map(row => ({ date: row.date, ...(row.hour === null ? {} : { period: row.hour }), value: row.value }));
          const counts = new Map<string, number>();
          for (const row of raw) counts.set(row.date, (counts.get(row.date) ?? 0) + 1);
          const missingDates: string[] = []; let missingObservationCount = 0;
          for (let day = input.from; day <= input.to; day = add(day, 1)) {
            const missing = (definition.period === null ? 1 : 24) - (counts.get(day) ?? 0);
            if (missing > 0) { missingDates.push(day); missingObservationCount += missing; }
          }
          const points = aggregate(raw, input.granularity, input.granularity === 'daily' ? definition.daily : definition.monthly);
          return { metric: input.metric, granularity: input.granularity, unit: definition.unit, requestedFrom: input.from, requestedTo: input.to,
            returnedFrom: raw[0]?.date ?? null, returnedTo: raw.at(-1)?.date ?? null,
            coverage: { availableFrom: raw[0]?.date ?? null, availableUntil: raw.at(-1)?.date ?? null },
            sourceDatasetId: null, consolidatedDatasetId: null, sources: [], contentHash: createHash('sha256').update(JSON.stringify(raw)).digest('hex'),
            completeness: { partial: missingObservationCount > 0, missingDates, missingObservationCount }, pointCount: points.length, points,
            freshness: { source: 'xm', checkedAt, message: 'Observaciones consultadas directamente a XM. Su disponibilidad depende de la publicación del proveedor.' } };
        } catch (error) {
          if (!(error instanceof ExternalDataError)) throw error;
          try {
            const stored = await fallback.read(input);
            return { ...stored, freshness: { source: 'local', checkedAt: null, attemptedAt: checkedAt, message: 'XM no respondió correctamente. Se muestran datos locales; no se pudo verificar su actualización.' } };
          } catch (localError) {
            if (localError instanceof EnergySeriesError && localError.status === 404) throw new EnergySeriesError(503, 'ENERGY_HISTORY_PROVIDER_UNAVAILABLE', 'XM no está disponible y no hay datos locales para este intervalo. Intenta nuevamente.');
            throw localError;
          }
        }
      })();
      pending.set(key, task);
      try { return await task; } finally { pending.delete(key); }
    },
  };
}
export const energyHistoryLiveService = createEnergyHistoryLiveService();

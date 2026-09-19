import { prisma } from '@/lib/prisma';
import { isDate } from '@/integrations/types/external-data';

type Metric = 'gene' | 'demand' | 'price';
type Granularity = 'hourly' | 'daily' | 'monthly';
type SeriesInput = { metric: Metric; from: string; to: string; granularity: Granularity };
type Source = { id: number; metric: string; requestedFrom: Date; requestedTo: Date; contentHash: string; energyDatasetId: number; energyDataset: { content: unknown } };
export type EnergySeriesStore = { findMany(args: unknown): Promise<Source[]> };
type Point = { date: string; period?: number; value: number };

const sources: EnergySeriesStore = { findMany: args => prisma.xmConsolidatedDataset.findMany(args as never) as unknown as Promise<Source[]> };
const definitions = {
  gene: { xmMetric: 'Gene', unit: 'kWh', allowed: ['hourly', 'daily', 'monthly'], value: 'energia_kwh', period: 'hora_xm', daily: 'sum', monthly: 'sum' },
  demand: { xmMetric: 'DemaSIN', unit: 'kWh', allowed: ['daily', 'monthly'], value: 'demanda_kwh', period: null, daily: 'identity', monthly: 'sum' },
  price: { xmMetric: 'PrecBolsNaci', unit: 'COP/kWh', allowed: ['hourly', 'daily', 'monthly'], value: 'precio_cop_kwh', period: 'periodo', daily: 'mean', monthly: 'mean' },
} as const;

export class EnergySeriesError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const date = (value: Date) => value.toISOString().slice(0, 10);
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;

function valid(input: unknown): input is SeriesInput {
  return object(input) && Object.keys(input).length === 4 && (input.metric === 'gene' || input.metric === 'demand' || input.metric === 'price') &&
    (input.granularity === 'hourly' || input.granularity === 'daily' || input.granularity === 'monthly') &&
    isDate(input.from) && isDate(input.to) && input.from <= input.to;
}

function limit(input: SeriesInput) {
  const span = days(input.from, input.to);
  if (input.granularity === 'hourly' && span > 31 || input.granularity === 'daily' && span > 366) throw new EnergySeriesError(413, 'ENERGY_SERIES_RANGE_TOO_LARGE', 'El rango solicitado supera el límite para esta granularidad.');
}

function normalized(input: SeriesInput, content: unknown): Point[] {
  const definition = definitions[input.metric];
  if (!object(content) || !Array.isArray(content.records)) throw new EnergySeriesError(500, 'ENERGY_SERIES_SOURCE_INVALID', 'El corpus histórico almacenado es inválido.');
  return content.records.flatMap<Point>(record => {
    if (!object(record) || !isDate(record.fecha_xm) || typeof record[definition.value] !== 'number' || !Number.isFinite(record[definition.value])) throw new EnergySeriesError(500, 'ENERGY_SERIES_SOURCE_INVALID', 'El corpus histórico almacenado es inválido.');
    if (record.fecha_xm < input.from || record.fecha_xm > input.to) return [];
    if (definition.period === null) return [{ date: record.fecha_xm, value: record[definition.value] as number }];
    const period = record[definition.period];
    if (!Number.isInteger(period) || (period as number) < 1 || (period as number) > 24) throw new EnergySeriesError(500, 'ENERGY_SERIES_SOURCE_INVALID', 'El corpus histórico almacenado es inválido.');
    return [{ date: record.fecha_xm, period: period as number, value: record[definition.value] as number }];
  }).sort((left, right) => left.date.localeCompare(right.date) || (left.period ?? 0) - (right.period ?? 0));
}

function aggregate(points: ReturnType<typeof normalized>, granularity: Granularity, operation: 'sum' | 'mean' | 'identity') {
  if (granularity === 'hourly' || operation === 'identity') return points;
  const grouped = new Map<string, { sum: number; count: number }>();
  for (const point of points) {
    const bucket = granularity === 'daily' ? point.date : point.date.slice(0, 7);
    const current = grouped.get(bucket) ?? { sum: 0, count: 0 };
    current.sum += point.value; current.count++; grouped.set(bucket, current);
  }
  return [...grouped.entries()].map(([date, value]) => ({ date, value: operation === 'sum' ? value.sum : value.sum / value.count }));
}

export function createEnergySeriesService(store: EnergySeriesStore = sources) {
  return {
    async read(input: unknown) {
      if (!valid(input)) throw new EnergySeriesError(400, 'INVALID_ENERGY_SERIES_QUERY', 'Los parámetros de series históricas no son válidos.');
      const definition = definitions[input.metric];
      if (!(definition.allowed as readonly string[]).includes(input.granularity)) throw new EnergySeriesError(400, 'UNSUPPORTED_ENERGY_SERIES_GRANULARITY', 'La granularidad no aplica a esta métrica.');
      limit(input);
      const candidates = await store.findMany({ where: { metric: definition.xmMetric, requestedFrom: { lte: new Date(`${input.from}T00:00:00Z`) }, requestedTo: { gte: new Date(`${input.to}T00:00:00Z`) } }, include: { energyDataset: { select: { content: true } } } });
      const source = candidates.sort((left, right) => date(left.requestedFrom).localeCompare(date(right.requestedFrom)) || date(right.requestedTo).localeCompare(date(left.requestedTo)) || right.id - left.id)[0];
      if (!source || date(source.requestedFrom) > input.from || date(source.requestedTo) < input.to) throw new EnergySeriesError(404, 'ENERGY_SERIES_UNAVAILABLE', 'No existe un corpus histórico consolidado que cubra el rango solicitado.');
      const raw = normalized(input, source.energyDataset.content);
      const points = aggregate(raw, input.granularity, input.granularity === 'daily' ? definition.daily : definition.monthly);
      return { metric: input.metric, unit: definition.unit, granularity: input.granularity, requestedFrom: input.from, requestedTo: input.to,
        returnedFrom: raw[0]?.date ?? null, returnedTo: raw.at(-1)?.date ?? null, coverage: { availableFrom: date(source.requestedFrom), availableUntil: date(source.requestedTo) },
        pointCount: points.length, sourceDatasetId: source.energyDatasetId, consolidatedDatasetId: source.id, contentHash: source.contentHash, points };
    },
  };
}

export const energySeriesService = createEnergySeriesService();
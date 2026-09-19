import { prisma } from '@/lib/prisma';
import { createXmWindowConsolidationService } from './xm-window-consolidation.service';
import type { XmMetric } from './xm-window-ingestion.service';

type CanonicalRecord = Record<string, string | number>;
type Corpus = {
  metric: XmMetric; from: string; to: string; rowCount: number; sourceWindowIds: number[]; sourceDatasetIds: number[];
  contentHash: string; coverage: { complete: true }; unit: string; granularity: string; records: CanonicalRecord[];
};
type Consolidator = { consolidate(input: unknown): Promise<Corpus> };
type Consolidated = { id: number; metric: string; requestedFrom: Date; requestedTo: Date; contentHash: string; energyDatasetId: number; sources: { xmIngestionWindowId: number }[] };
type Window = { id: number; metric: string; status: string; energyDatasetId: number | null };
type MaterializationStore = {
  xmConsolidatedDataset: { findUnique(args: unknown): Promise<Consolidated | null>; create(args: unknown): Promise<Consolidated> };
  xmIngestionWindow: { findMany(args: unknown): Promise<Window[]> };
  energyDataset: { create(args: unknown): Promise<{ id: number }> };
  $transaction<T>(action: (transaction: MaterializationStore) => Promise<T>): Promise<T>;
};

const store: MaterializationStore = prisma as unknown as MaterializationStore;
const definitions = {
  Gene: { dataType: 'generacion', columns: ['fecha_xm', 'hora_xm', 'energia_kwh'] },
  DemaSIN: { dataType: 'demanda', columns: ['fecha_xm', 'demanda_kwh'] },
  PrecBolsNaci: { dataType: 'precios', columns: ['fecha_xm', 'periodo', 'precio_cop_kwh'] },
} as const;

export class XmConsolidatedDatasetError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

const key = (corpus: Corpus) => ({ metric_requestedFrom_requestedTo_contentHash: { metric: corpus.metric, requestedFrom: new Date(`${corpus.from}T00:00:00Z`), requestedTo: new Date(`${corpus.to}T00:00:00Z`), contentHash: corpus.contentHash } });
const uniqueError = (error: unknown) => error !== null && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002';

function response(consolidated: Consolidated, corpus: Corpus, reused: boolean) {
  return { consolidatedDatasetId: consolidated.id, energyDatasetId: consolidated.energyDatasetId, metric: corpus.metric, from: corpus.from, to: corpus.to,
    rowCount: corpus.rowCount, contentHash: corpus.contentHash, sourceWindowIds: consolidated.sources.map(source => source.xmIngestionWindowId).sort((left, right) => left - right), sourceDatasetIds: corpus.sourceDatasetIds, coverage: corpus.coverage, unit: corpus.unit, granularity: corpus.granularity, reused };
}

function source(corpus: Corpus) {
  return `XM consolidated;metric=${corpus.metric};startDate=${corpus.from};endDate=${corpus.to};sha256=${corpus.contentHash}`;
}

export function createXmConsolidatedDatasetService(consolidator: Consolidator = createXmWindowConsolidationService(), database: MaterializationStore = store) {
  return {
    async materialize(input: unknown) {
      const corpus = await consolidator.consolidate(input);
      if (!corpus.coverage.complete) throw new XmConsolidatedDatasetError(422, 'XM_CONSOLIDATION_INCOMPLETE', 'El corpus XM no tiene cobertura completa.');
      let existing = await database.xmConsolidatedDataset.findUnique({ where: key(corpus), include: { sources: { select: { xmIngestionWindowId: true } } } });
      if (existing) return response(existing, corpus, true);
      try {
        const saved = await database.$transaction(async transaction => {
          const windows = await transaction.xmIngestionWindow.findMany({ where: { id: { in: corpus.sourceWindowIds }, provider: 'xm', metric: corpus.metric, status: 'completed' }, select: { id: true, metric: true, status: true, energyDatasetId: true } });
          const expectedWindows = [...corpus.sourceWindowIds].sort((left, right) => left - right);
          const receivedWindows = windows.map(window => window.id).sort((left, right) => left - right);
          const expectedDatasets = [...corpus.sourceDatasetIds].sort((left, right) => left - right);
          const receivedDatasets = windows.map(window => window.energyDatasetId).filter((id): id is number => id !== null).sort((left, right) => left - right);
          if (receivedWindows.length !== expectedWindows.length || expectedWindows.some((id, index) => id !== receivedWindows[index]) || receivedDatasets.length !== expectedDatasets.length || expectedDatasets.some((id, index) => id !== receivedDatasets[index])) throw new XmConsolidatedDatasetError(409, 'XM_CONSOLIDATION_PROVENANCE_INVALID', 'Las ventanas fuente no están completed o ya no corresponden al corpus consolidado.');
          const dataset = await transaction.energyDataset.create({ data: { source: source(corpus), dataType: definitions[corpus.metric].dataType, content: { columns: definitions[corpus.metric].columns.map(name => ({ name, optional: false })), records: corpus.records }, pendingOptionalFields: [] } });
          return transaction.xmConsolidatedDataset.create({ data: { metric: corpus.metric, requestedFrom: new Date(`${corpus.from}T00:00:00Z`), requestedTo: new Date(`${corpus.to}T00:00:00Z`), contentHash: corpus.contentHash, energyDatasetId: dataset.id, sources: { create: corpus.sourceWindowIds.map(xmIngestionWindowId => ({ xmIngestionWindowId })) } }, include: { sources: { select: { xmIngestionWindowId: true } } } });
        });
        return response(saved, corpus, false);
      } catch (error) {
        if (!uniqueError(error)) throw error;
        existing = await database.xmConsolidatedDataset.findUnique({ where: key(corpus), include: { sources: { select: { xmIngestionWindowId: true } } } });
        if (!existing) throw new Error('Missing concurrent XM consolidated dataset.');
        return response(existing, corpus, true);
      }
    },
  };
}
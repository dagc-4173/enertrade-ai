import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { analyzePreparedDataset, type PatternAnalysisTechnicalResult } from '@/services/pattern-analysis.service';

type PreparedDataset = { id: number; profileId: string; profileVersion: string; sourceRulesetId: string; sourceRulesetVersion: string; content: unknown };
export type StoredPatternAnalysis = PatternAnalysisTechnicalResult & { analysisId: string; preparedDatasetId: number; createdAt: Date };
type PublicPatternAnalysis = Omit<StoredPatternAnalysis, 'preparedDatasetId' | 'createdAt'>;
export type PatternPersistence = { analysisId: string; persistence: 'persisted' | 'failed' };
export type PatternAnalysisResult = PublicPatternAnalysis & { persistence: PatternPersistence };
export type PatternFilters = { from?: string; to?: string; dataType?: PatternAnalysisTechnicalResult['dataType']; variable?: PatternAnalysisTechnicalResult['variable'] };

type PatternRepository = {
  findPreparedDataset(id: number): Promise<PreparedDataset | null>;
  createAnalysis(analysis: StoredPatternAnalysis): Promise<unknown>;
  listAnalyses(): Promise<StoredPatternAnalysis[]>;
};

export const patternRepository: PatternRepository = {
  findPreparedDataset: id => prisma.preparedDataset.findUnique({ where: { id } }),
  createAnalysis: analysis => prisma.patternAnalysis.create({ data: {
    id: analysis.analysisId, preparedDatasetId: analysis.preparedDatasetId, status: analysis.status, dataType: analysis.dataType,
    variable: analysis.variable, periodStart: analysis.period.from ? new Date(`${analysis.period.from}T00:00:00Z`) : null,
    periodEnd: analysis.period.to ? new Date(`${analysis.period.to}T00:00:00Z`) : null, methodId: analysis.method.id,
    methodVersion: analysis.method.version, sampleSize: analysis.sampleSize, resultSnapshot: JSON.parse(JSON.stringify(snapshot(analysis))) as Prisma.InputJsonObject, warnings: analysis.warnings,
  } }),
  listAnalyses: async () => (await prisma.patternAnalysis.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })).map(row => ({
    ...(row.resultSnapshot as Omit<StoredPatternAnalysis, 'analysisId' | 'preparedDatasetId' | 'createdAt'>), analysisId: row.id, preparedDatasetId: row.preparedDatasetId, createdAt: row.createdAt,
  })),
};

function snapshot(analysis: StoredPatternAnalysis) {
  const { analysisId, preparedDatasetId: _preparedDatasetId, createdAt: _createdAt, ...result } = analysis;
  return { analysisId, ...result };
}

function publicAnalysis(analysis: StoredPatternAnalysis) {
  const { preparedDatasetId: _preparedDatasetId, ...result } = analysis;
  return result;
}

function overlaps(period: { from: string | null; to: string | null }, filters: PatternFilters): boolean {
  if (period.from === null || period.to === null) return filters.from === undefined && filters.to === undefined;
  return (filters.to === undefined || period.from <= filters.to) && (filters.from === undefined || period.to >= filters.from);
}

export class PatternsError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function createPatternsService(repository: PatternRepository = patternRepository) {
  return {
    async analyze(preparedDatasetId: number): Promise<PatternAnalysisResult> {
      const dataset = await repository.findPreparedDataset(preparedDatasetId);
      if (!dataset) throw new PatternsError(404, 'PREPARED_DATASET_NOT_FOUND', 'Dataset preparado no encontrado.');
      const technical = analyzePreparedDataset(dataset);
      const analysis: StoredPatternAnalysis = { analysisId: randomUUID(), preparedDatasetId, ...technical, createdAt: new Date() };
      try {
        await repository.createAnalysis(analysis);
        return { ...snapshot(analysis), persistence: { analysisId: analysis.analysisId, persistence: 'persisted' } };
      } catch {
        return { ...snapshot(analysis), persistence: { analysisId: analysis.analysisId, persistence: 'failed' } };
      }
    },
    async list(filters: PatternFilters): Promise<PublicPatternAnalysis[]> {
      return (await repository.listAnalyses()).filter(analysis =>
        (filters.dataType === undefined || analysis.dataType === filters.dataType) &&
        (filters.variable === undefined || analysis.variable === filters.variable) && overlaps(analysis.period, filters))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.analysisId.localeCompare(left.analysisId))
        .map(publicAnalysis);
    },
  };
}
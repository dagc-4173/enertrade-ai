import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { capabilityVersionsService, type CapabilityVersion } from '@/services/capability-versions.service';

type Aggregate = { _count: number; _avg: { durationMs: number | null } };
export type IndicatorsStore = {
  aiQueryTrace: { count(args: { where: object }): Promise<number>; aggregate(args: { where: object; _count: true; _avg: { durationMs: true } }): Promise<Aggregate> };
  priceForecastExecution: { count(args: { where: object }): Promise<number> };
  $queryRaw<T>(query: ReturnType<typeof Prisma.sql>): Promise<T>;
};
export type IndicatorsResult = {
  indicators: { forecasts: { supply: number; demand: number; total: number }; priceEstimates: number; matchingSuggestions: number; patternsIdentified: number; errors: { total: number }; averageResponseTimeMs: number | null; capabilities: { active: number; total: number; byArtifactType: { mlModel: number; deterministicRule: number; deterministicMethod: number } } };
  sample: { traceCount: number }; warnings: string[];
};

const store: IndicatorsStore = prisma;
const activeCapabilities = (capabilities: CapabilityVersion[]) => capabilities.filter(item => item.active);
const asNumber = (value: bigint | number | null | undefined) => value === null || value === undefined ? 0 : Number(value);

export function createIndicatorsService(source: IndicatorsStore = store, versions = capabilityVersionsService) {
  return {
    async get(): Promise<IndicatorsResult> {
      const traceFilter = { capability: { not: 'engine_indicators' } };
      const [supply, demand, priceEstimates, errors, traceAggregate, matchingRows, patternRows] = await Promise.all([
        source.aiQueryTrace.count({ where: { capability: 'forecasts_supply', executionStatus: 'succeeded' } }),
        source.aiQueryTrace.count({ where: { capability: 'forecasts_demand', executionStatus: 'succeeded' } }),
        source.priceForecastExecution.count({ where: { status: 'succeeded' } }),
        source.aiQueryTrace.count({ where: { ...traceFilter, executionStatus: 'failed' } }),
        source.aiQueryTrace.aggregate({ where: traceFilter, _count: true, _avg: { durationMs: true } }),
        source.$queryRaw<{ total: bigint | number | null }[]>(Prisma.sql`SELECT COALESCE(SUM(jsonb_array_length("resultSnapshot"->'matches')), 0) AS total FROM "MatchingExecution" WHERE "executionStatus" = 'succeeded' AND "matchingStatus" IN ('matched', 'partial')`),
        source.$queryRaw<{ total: bigint | number | null }[]>(Prisma.sql`SELECT COALESCE(SUM(jsonb_array_length("resultSnapshot"->'patterns')), 0) AS total FROM "PatternAnalysis" WHERE status IN ('completed', 'partial')`),
      ]);
      const matchingSuggestions = asNumber(matchingRows[0]?.total);
      const patternsIdentified = asNumber(patternRows[0]?.total);
      const total = supply + demand;
      const capabilities = activeCapabilities(versions.list());
      const byArtifactType = { mlModel: capabilities.filter(item => item.artifactType === 'ml_model').length, deterministicRule: capabilities.filter(item => item.artifactType === 'deterministic_rule').length, deterministicMethod: capabilities.filter(item => item.artifactType === 'deterministic_method').length };
      const warnings: string[] = [];
      if (traceAggregate._count === 0) warnings.push('NO_TRACE_DATA');
      if (total === 0 && priceEstimates === 0 && matchingSuggestions === 0 && patternsIdentified === 0) warnings.push('NO_FUNCTIONAL_RECORDS');
      return { indicators: { forecasts: { supply, demand, total }, priceEstimates, matchingSuggestions, patternsIdentified, errors: { total: errors }, averageResponseTimeMs: traceAggregate._avg.durationMs === null ? null : Math.round(traceAggregate._avg.durationMs * 100) / 100, capabilities: { active: capabilities.length, total: versions.list().length, byArtifactType } }, sample: { traceCount: traceAggregate._count }, warnings };
    },
  };
}

export const indicatorsService = createIndicatorsService();
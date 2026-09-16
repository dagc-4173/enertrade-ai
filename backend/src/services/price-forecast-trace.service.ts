import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { calendarDate, object } from './forecast.contract';
import type { PriceForecastContext, forecastPrice } from './price-forecast.service';

type Result = Awaited<ReturnType<typeof forecastPrice>>;
type Store = {
  create(args: { data: Prisma.PriceForecastExecutionUncheckedCreateInput }): Promise<unknown>;
  update(args: { where: { id: string }; data: Prisma.PriceForecastExecutionUncheckedUpdateInput }): Promise<unknown>;
};
export type TraceState = { executionId: string | null; context: PriceForecastContext };

// Bound and allowlist even invalid requests. Never persist arbitrary nested values.
export function safePriceRequest(input: unknown): Prisma.InputJsonObject {
  const result: Record<string, string | number> = {};
  if (!object(input)) return result;
  if (typeof input.preparedDatasetId === 'number' && Number.isFinite(input.preparedDatasetId)) result.preparedDatasetId = input.preparedDatasetId;
  else if (typeof input.preparedDatasetId === 'string' && /^\d{1,10}$/.test(input.preparedDatasetId)) result.preparedDatasetId = input.preparedDatasetId;
  if (typeof input.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) result.targetDate = input.targetDate;
  return result;
}

export function createPriceForecastTraceService(store: Store) {
  async function finish(state: TraceState, data: Prisma.PriceForecastExecutionUncheckedUpdateInput) {
    if (state.executionId === null) return { executionId: null, persistence: 'failed' as const };
    try {
      await store.update({ where: { id: state.executionId }, data });
      return { executionId: state.executionId, persistence: 'persisted' as const };
    } catch {
      return { executionId: state.executionId, persistence: 'failed' as const };
    }
  }
  function conditions(state: TraceState, input: unknown) {
    const c = state.context;
    return {
      requestPayload: safePriceRequest(input),
      targetDate: c.targetDate && calendarDate(c.targetDate) ? new Date(c.targetDate + 'T00:00:00Z') : null,
      preparedDatasetId: c.preparedDatasetId ?? null,
      ruleId: c.rule?.id ?? null, ruleVersion: c.rule?.version ?? null, ruleType: c.rule?.type ?? null,
      completedAt: new Date(),
    };
  }
  return {
    async startExecution(): Promise<TraceState> {
      try {
        const id = randomUUID();
        await store.create({ data: { id, forecastType: 'market_reference_price', requestPayload: {}, status: 'pending' } });
        return { executionId: id, context: {} };
      } catch {
        return { executionId: null, context: {} };
      }
    },
    async completeExecution(state: TraceState, input: unknown, result: Result) {
      const trace = await finish(state, {
        ...conditions(state, input), forecastType: result.forecastType,
        inputSnapshot: state.context.inputSnapshot ?? Prisma.DbNull,
        resultPayload: result, status: 'succeeded', httpStatus: 200, errorCode: null,
        conditionsCompleteness: 'partial', partialReasons: [...result.factors.omitted],
      });
      return trace.persistence === 'persisted' ? { ...trace, conditionsCompleteness: 'partial' as const } : trace;
    },
    async failExecution(state: TraceState, input: unknown, httpStatus: number, errorCode: string) {
      return finish(state, {
        ...conditions(state, input), status: 'failed', resultPayload: Prisma.DbNull,
        httpStatus, errorCode,
      });
    },
  };
}

export const priceForecastTrace = createPriceForecastTraceService({
  create: args => prisma.priceForecastExecution.create(args),
  update: args => prisma.priceForecastExecution.update(args),
});

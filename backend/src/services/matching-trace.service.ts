import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import {
  buildMatchingSuggestions,
  type MatchingDemandLike,
  type MatchingOfferLike,
  type MatchingReadRepository,
  type MatchingResponse,
} from '@/services/matching.service';

type Store = {
  create(args: { data: Prisma.MatchingExecutionUncheckedCreateInput }): Promise<unknown>;
  update(args: { where: { id: string }; data: Prisma.MatchingExecutionUncheckedUpdateInput }): Promise<unknown>;
};

type TraceState = { executionId: string; started: boolean };
export type MatchingTrace = { executionId: string; persistence: 'persisted' | 'failed' };
export type TracedMatchingResponse = MatchingResponse & { trace: MatchingTrace };
export type TracedMatchingService = { suggest(): Promise<TracedMatchingResponse> };

const criteriaSnapshot: Prisma.InputJsonObject = {
  activeStatus: 'ACTIVE',
  deliveryDate: 'equal',
  priceCompatibility: 'pricePerKwh <= maxPricePerKwh',
  remainingQuantity: 'positive',
  demandOrder: ['createdAt', 'id'],
  offerOrder: ['pricePerKwh', 'createdAt', 'id'],
  allocation: 'greedy',
};

function decimal(value: string | number | { toString(): string }): string {
  return typeof value === 'string' ? value : value.toString();
}

function date(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function inputSnapshot(offers: MatchingOfferLike[], demands: MatchingDemandLike[]): Prisma.InputJsonObject {
  return {
    offers: offers.filter(item => item.status === 'ACTIVE').map(item => ({
      id: item.id,
      quantityKwh: decimal(item.quantityKwh),
      pricePerKwh: decimal(item.pricePerKwh),
      deliveryDate: date(item.deliveryDate).slice(0, 10),
      createdAt: date(item.createdAt),
    })),
    demands: demands.filter(item => item.status === 'ACTIVE').map(item => ({
      id: item.id,
      quantityKwh: decimal(item.quantityKwh),
      maxPricePerKwh: decimal(item.maxPricePerKwh),
      deliveryDate: date(item.deliveryDate).slice(0, 10),
      createdAt: date(item.createdAt),
    })),
  };
}

export function createMatchingTraceService(store: Store) {
  async function finish(state: TraceState, data: Prisma.MatchingExecutionUncheckedUpdateInput): Promise<MatchingTrace> {
    if (!state.started) return { executionId: state.executionId, persistence: 'failed' };
    try {
      await store.update({ where: { id: state.executionId }, data });
      return { executionId: state.executionId, persistence: 'persisted' };
    } catch {
      return { executionId: state.executionId, persistence: 'failed' };
    }
  }

  return {
    async startExecution(): Promise<TraceState> {
      const executionId = randomUUID();
      try {
        await store.create({ data: {
          id: executionId,
          executionStatus: 'pending',
          criteriaVersion: 'matching-v1',
          criteriaSnapshot,
        } });
        return { executionId, started: true };
      } catch {
        return { executionId, started: false };
      }
    },
    completeExecution(state: TraceState, input: Prisma.InputJsonObject, result: MatchingResponse) {
      return finish(state, {
        executionStatus: 'succeeded',
        matchingStatus: result.status,
        inputSnapshot: input,
        resultSnapshot: result,
        errorCode: null,
        completedAt: new Date(),
      });
    },
    failExecution(state: TraceState) {
      return finish(state, {
        executionStatus: 'failed',
        errorCode: 'MATCHING_OPERATION_FAILED',
        completedAt: new Date(),
      });
    },
  };
}

export function createTracedMatchingService(
  repository: MatchingReadRepository,
  trace: ReturnType<typeof createMatchingTraceService>,
): TracedMatchingService {
  return {
    async suggest(): Promise<TracedMatchingResponse> {
      const state = await trace.startExecution();
      try {
        const [offers, demands] = await Promise.all([
          repository.listActiveOffers(),
          repository.listActiveDemands(),
        ]);
        const result = buildMatchingSuggestions(offers, demands);
        return { ...result, trace: await trace.completeExecution(state, inputSnapshot(offers, demands), result) };
      } catch (error) {
        await trace.failExecution(state);
        throw error;
      }
    },
  };
}

export const matchingTrace = createMatchingTraceService({
  create: args => prisma.matchingExecution.create(args),
  update: args => prisma.matchingExecution.update(args),
});

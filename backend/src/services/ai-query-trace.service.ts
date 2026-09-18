import { prisma } from '@/lib/prisma';
import { safeLogger } from '@/lib/safe-logger';
import { Prisma } from '@/generated/prisma/client';

export type AiQueryTraceInput = {
  requestId: string; startedAt: Date; completedAt: Date; durationMs: number;
  requesterType: 'authenticated_user' | 'system'; requesterId: string | null;
  httpMethod: string; endpoint: string; capability: string;
  parametersSnapshot: Prisma.InputJsonObject; modelId?: string; modelVersion?: string;
  methodId?: string; methodVersion?: string; executionStatus: 'succeeded' | 'empty' | 'failed';
  resultStatus?: string; errorCode?: string; resourceType?: string; resourceId?: string;
};

export type AiQueryTraceStore = { create(input: AiQueryTraceInput): Promise<unknown> };

export const aiQueryTraceStore: AiQueryTraceStore = {
  create: input => prisma.aiQueryTrace.create({ data: input }),
};

export async function recordAiQueryTrace(store: AiQueryTraceStore, input: AiQueryTraceInput): Promise<void> {
  try { await store.create(input); }
  catch {
    safeLogger.error({ timestamp: new Date().toISOString(), level: 'error', requestId: input.requestId, method: input.httpMethod,
      path: input.endpoint, status: 500, errorCode: 'AUDIT_TRACE_PERSISTENCE_FAILED', errorName: 'AuditTracePersistenceError' });
  }
}
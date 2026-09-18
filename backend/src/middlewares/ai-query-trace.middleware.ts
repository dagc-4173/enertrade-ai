import type { RequestHandler } from 'express';
import { performance } from 'node:perf_hooks';
import { Prisma } from '@/generated/prisma/client';
import { aiQueryTraceStore, recordAiQueryTrace, type AiQueryTraceInput, type AiQueryTraceStore } from '@/services/ai-query-trace.service';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);

type Route = { endpoint: string; capability: string; authenticated: boolean };
function route(req: { method: string; path: string }): Route | null {
  const key = `${req.method} ${req.path}`;
  if (['POST /forecasts/supply', 'POST /forecasts/demand', 'POST /forecasts/price', 'GET /forecasts/supply/metrics', 'GET /forecasts/demand/metrics', 'POST /matches/suggest', 'POST /patterns/analyze', 'GET /patterns', 'GET /models'].includes(key)) {
    const endpoint = key.slice(req.method.length + 1);
    return { endpoint, capability: endpoint.replaceAll('/', '_').replace(/^_/, ''), authenticated: key.includes('/matches') || key.includes('/patterns') };
  }
  if (req.method === 'GET' && /^\/models\/[^/]+\/metrics$/.test(req.path)) return { endpoint: '/models/:id/metrics', capability: 'model_catalog', authenticated: false };
  if (req.method === 'GET' && /^\/models\/[^/]+$/.test(req.path)) return { endpoint: '/models/:id', capability: 'model_catalog', authenticated: false };
  return null;
}
function allowed(input: unknown, keys: string[]): JsonObject {
  if (!object(input)) return {};
  return Object.fromEntries(keys.flatMap(key => typeof input[key] === 'string' || typeof input[key] === 'number' ? [[key, input[key]]] : []));
}
function metadata(req: Parameters<RequestHandler>[0], target: Route, response: unknown, status: number, startedAt: Date, durationMs: number): AiQueryTraceInput {
  const data = object(response) ? response : {};
  const endpoint = target.endpoint;
  const parametersSnapshot = endpoint.startsWith('/forecasts/') ? allowed(req.body, ['preparedDatasetId', 'targetDate'])
    : endpoint === '/patterns/analyze' ? allowed(req.body, ['preparedDatasetId'])
    : endpoint === '/patterns' ? allowed(req.query, ['from', 'to', 'dataType', 'variable'])
    : endpoint.startsWith('/models/:id') ? { modelId: req.path.split('/')[2] ?? '' }
    : endpoint === '/matches/suggest' ? { criteriaVersion: 'matching-v1', offerCount: object(data.summary) && typeof data.summary.offersConsidered === 'number' ? data.summary.offersConsidered : 0, demandCount: object(data.summary) && typeof data.summary.demandsConsidered === 'number' ? data.summary.demandsConsidered : 0 }
    : {};
  const resultStatus = typeof data.status === 'string' ? data.status : undefined;
  const empty = data.error === 'PREDICTIVE_ARTIFACT_NOT_FOUND' || resultStatus === 'unavailable' || resultStatus === 'no_matches' || resultStatus === 'no_results' || (Array.isArray(response) && response.length === 0);
  const trace = object(data.trace) ? data.trace : {};
  const persistence = object(data.persistence) ? data.persistence : {};
  const resourceId = typeof trace.executionId === 'string' ? trace.executionId : typeof persistence.analysisId === 'string' && persistence.persistence === 'persisted' ? persistence.analysisId : undefined;
  return {
    requestId: req.requestId, startedAt, completedAt: new Date(), durationMs: Math.max(0, Math.round(durationMs)),
    requesterType: req.authUser ? 'authenticated_user' : 'system', requesterId: req.authUser?.id ?? null,
    httpMethod: req.method, endpoint, capability: target.capability, parametersSnapshot: JSON.parse(JSON.stringify(parametersSnapshot)) as Prisma.InputJsonObject,
    ...(typeof data.modelId === 'string' ? { modelId: data.modelId } : endpoint.startsWith('/models/:id') && typeof data.id === 'string' ? { modelId: data.id } : {}),
    ...(typeof data.modelVersion === 'string' ? { modelVersion: data.modelVersion } : endpoint.startsWith('/models/:id') && typeof data.version === 'string' ? { modelVersion: data.version } : {}),
    ...(object(data.rule) && typeof data.rule.id === 'string' ? { modelId: data.rule.id, modelVersion: typeof data.rule.version === 'string' ? data.rule.version : undefined } : {}),
    ...(endpoint === '/matches/suggest' ? { methodId: 'matching-v1' } : {}),
    ...(object(data.method) && typeof data.method.id === 'string' ? { methodId: data.method.id, methodVersion: typeof data.method.version === 'string' ? data.method.version : undefined } : {}),
    executionStatus: empty ? 'empty' : status >= 400 ? 'failed' : 'succeeded', ...(resultStatus ? { resultStatus } : {}),
    ...(status >= 400 && typeof data.error === 'string' ? { errorCode: data.error } : {}),
    ...(resourceId ? { resourceId, resourceType: endpoint === '/forecasts/price' ? 'price_forecast_execution' : endpoint === '/matches/suggest' ? 'matching_execution' : 'pattern_analysis' } : {}),
  };
}

export function createAiQueryTraceMiddleware(store: AiQueryTraceStore = aiQueryTraceStore): RequestHandler {
  return (req, res, next) => {
    const target = route(req);
    if (!target) return next();
    const startedAt = new Date(); const started = performance.now(); let response: unknown;
    const json = res.json.bind(res);
    res.json = ((body: unknown) => { response = body; return json(body); }) as typeof res.json;
    res.once('finish', () => {
      if (target.authenticated && !req.authUser) return;
      void recordAiQueryTrace(store, metadata(req, target, response, res.statusCode, startedAt, performance.now() - started));
    });
    next();
  };
}
import { afterAll, expect, test } from 'bun:test';
import express from 'express';
import { request as httpRequest } from 'node:http';
import { createIndicatorsRouter } from '@/controllers/indicators.controller';
import { createIndicatorsService, type IndicatorsStore } from '@/services/indicators.service';
import { capabilityVersionsService } from '@/services/capability-versions.service';
import { createAiQueryTraceMiddleware } from '@/middlewares/ai-query-trace.middleware';
import { requestIdMiddleware } from '@/middlewares/request-id.middleware';
import type { AiQueryTraceInput } from '@/services/ai-query-trace.service';

type Trace = { capability: string; executionStatus: string; durationMs: number };
function store(traces: Trace[] = [], prices = 0, matching = 0, patterns = 0): IndicatorsStore {
  const selected = (where: Record<string, unknown>) => traces.filter(trace => Object.entries(where).every(([key, value]) => key === 'capability' && typeof value === 'object' ? trace.capability !== (value as { not: string }).not : trace[key as keyof Trace] === value));
  let aggregateQuery = 0;
  return {
    aiQueryTrace: {
      count: async ({ where }) => selected(where as Record<string, unknown>).length,
      groupBy: async ({ where }) => (['succeeded', 'empty', 'failed'] as const)
        .map(executionStatus => selected({ ...(where as Record<string, unknown>), executionStatus }))
        .filter(rows => rows.length > 0)
        .map(rows => ({ executionStatus: rows[0]!.executionStatus as 'succeeded' | 'empty' | 'failed', _count: rows.length, _sum: { durationMs: rows.reduce((sum, row) => sum + row.durationMs, 0) } })),
    },
    priceForecastExecution: { count: async ({ where }) => (where as { status: string }).status === 'succeeded' ? prices : 0 },
    $queryRaw: async <T>() => [{ total: BigInt(aggregateQuery++ === 0 ? matching : patterns) }] as T,
  };
}

test('IND-01 e IND-10: sin datos devuelve ceros, null y warnings objetivos', async () => {
  expect(await createIndicatorsService(store()).get()).toMatchObject({ indicators: { forecasts: { supply: 0, demand: 0, total: 0 }, priceEstimates: 0, matchingSuggestions: 0, patternsIdentified: 0, errors: { total: 0 }, executions: { total: 0, succeeded: 0, empty: 0, failed: 0, successRate: null }, averageResponseTimeMs: null }, sample: { traceCount: 0 }, warnings: ['NO_TRACE_DATA', 'NO_FUNCTIONAL_RECORDS'] });
});

test('IND-02 a IND-09: consolida fuentes canónicas, empty/failed y excluye engine_indicators', async () => {
  const service = createIndicatorsService(store([
    { capability: 'forecasts_supply', executionStatus: 'succeeded', durationMs: 10 }, { capability: 'forecasts_demand', executionStatus: 'succeeded', durationMs: 20 },
    { capability: 'forecasts_supply', executionStatus: 'empty', durationMs: 30 }, { capability: 'models', executionStatus: 'failed', durationMs: 40 }, { capability: 'engine_indicators', executionStatus: 'failed', durationMs: 999 },
  ], 1, 3, 5));
  expect(await service.get()).toMatchObject({ indicators: { forecasts: { supply: 1, demand: 1, total: 2 }, priceEstimates: 1, matchingSuggestions: 3, patternsIdentified: 5, errors: { total: 1 }, executions: { total: 4, succeeded: 2, empty: 1, failed: 1, successRate: 50 }, averageResponseTimeMs: 25, capabilities: { active: 5, total: 5, byArtifactType: { mlModel: 2, deterministicRule: 1, deterministicMethod: 2 } } }, sample: { traceCount: 4 }, warnings: [] });
});

test('IND-EXEC-01: calcula total, tasa de éxito redondeada a 2 decimales y coherencia con errors.total', async () => {
  const service = createIndicatorsService(store([
    { capability: 'forecasts_supply', executionStatus: 'succeeded', durationMs: 10 },
    { capability: 'matching', executionStatus: 'empty', durationMs: 10 },
    { capability: 'patterns_analyze', executionStatus: 'failed', durationMs: 10 },
  ]));
  const result = await service.get();
  expect(result.indicators.executions).toEqual({ total: 3, succeeded: 1, empty: 1, failed: 1, successRate: 33.33 });
  expect(result.indicators.errors.total).toBe(result.indicators.executions.failed);
});

test('IND-11: la misma fuente produce respuesta determinística', async () => {
  const service = createIndicatorsService(store([{ capability: 'forecasts_supply', executionStatus: 'succeeded', durationMs: 12 }]));
  expect(await service.get()).toEqual(await service.get());
});

const service = createIndicatorsService(store());
const app = express(); app.use('/indicators', createIndicatorsRouter(service));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address() as { port: number }; const base = `http://127.0.0.1:${address.port}`;
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

test('IND-13 e IND-14: endpoint público no filtra datos internos y valida request', async () => {
  const body = await (await fetch(`${base}/indicators`)).json() as object;
  expect(JSON.stringify(body)).not.toMatch(/snapshot|sql|stack|password|token|manifest/i);
  expect((await fetch(`${base}/indicators?from=2024-01-01`)).status).toBe(400);
  const status = await new Promise<number>((resolve, reject) => { const request = httpRequest({ hostname: '127.0.0.1', port: address.port, path: '/indicators', method: 'GET', headers: { 'Content-Length': '2' } }, response => resolve(response.statusCode ?? 0)); request.on('error', reject); request.end('{}'); });
  expect(status).toBe(400);
  expect(capabilityVersionsService.list()).toHaveLength(5);
});

test('IND-12: la traza HU17 se crea después de responder sin autocontarse', async () => {
  const rows: AiQueryTraceInput[] = [];
  const traced = express(); traced.use(requestIdMiddleware); traced.use(createAiQueryTraceMiddleware({ create: async input => { rows.push(input); } })); traced.use('/indicators', createIndicatorsRouter(createIndicatorsService(store())));
  const listener = traced.listen(0, '127.0.0.1'); await new Promise<void>(resolve => listener.once('listening', resolve));
  const port = (listener.address() as { port: number }).port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/indicators`);
    const body = await response.json() as { sample: { traceCount: number } };
    expect(body.sample.traceCount).toBe(0); await new Promise(resolve => setImmediate(resolve));
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ requestId: response.headers.get('x-request-id'), capability: 'engine_indicators', endpoint: '/indicators', httpMethod: 'GET', requesterType: 'system', executionStatus: 'succeeded' });
  } finally { await new Promise<void>(resolve => listener.close(() => resolve())); }
});
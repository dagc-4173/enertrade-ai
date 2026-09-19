import { describe, expect, test } from 'bun:test';
import express from 'express';
import { createAiQueryTraceMiddleware } from '../middlewares/ai-query-trace.middleware';
import { requestIdMiddleware } from '../middlewares/request-id.middleware';
import type { AiQueryTraceInput } from '../services/ai-query-trace.service';

function harness(handler: express.RequestHandler, authenticated = false, fails = false) {
  const rows: AiQueryTraceInput[] = [];
  const app = express(); app.use(express.json()); app.use(requestIdMiddleware);
  app.use(createAiQueryTraceMiddleware({ create: async input => { if (fails) throw new Error('private database password=secret'); rows.push(input); } }));
  if (authenticated) app.use((req, _res, next) => { req.authUser = { id: '00000000-0000-4000-8000-000000000001', email: 'not-stored@example.test', name: 'Trace', createdAt: new Date() }; next(); });
  app.use(handler); return { app, rows };
}
async function request(app: express.Express, path: string, init: RequestInit = {}) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected address.');
  try { const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init); await new Promise(resolve => setTimeout(resolve, 10)); return { status: response.status, requestId: response.headers.get('x-request-id'), body: await response.json() as Record<string, unknown> }; }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

describe('HU17 AiQueryTrace', () => {
  test('TRACE-01, TRACE-02, TRACE-09 a TRACE-13: forecasts exitosos usan metadata mínima', async () => {
    const h = harness((_req, res) => res.json({ status: 'available', modelId: 'xm-gene-ridge', modelVersion: '1.0.0' }));
    const result = await request(h.app, '/forecasts/supply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 7, targetDate: '2024-01-01', secret: 'ignored' }) });
    expect(result.status).toBe(200); expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ requestId: result.requestId, requesterType: 'system', endpoint: '/forecasts/supply', capability: 'forecasts_supply', modelId: 'xm-gene-ridge', modelVersion: '1.0.0', executionStatus: 'succeeded', parametersSnapshot: { preparedDatasetId: 7, targetDate: '2024-01-01' } });
    expect(h.rows[0]!.durationMs).toBeGreaterThanOrEqual(0); expect(JSON.stringify(h.rows[0])).not.toContain('secret');
  });

  test('TRACE-02 y TRACE-11: demand exitoso conserva método, correlación y parámetros permitidos', async () => {
    const h = harness((_req, res) => res.json({ status: 'available', modelId: 'xm-demandasin-ridge', modelVersion: '1.0.0' }));
    const result = await request(h.app, '/forecasts/demand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 8, targetDate: '2024-01-02', password: 'ignored' }) });
    expect(h.rows[0]).toMatchObject({ requestId: result.requestId, requesterType: 'system', endpoint: '/forecasts/demand', httpMethod: 'POST', capability: 'forecasts_demand', executionStatus: 'succeeded', modelId: 'xm-demandasin-ridge', modelVersion: '1.0.0', parametersSnapshot: { preparedDatasetId: 8, targetDate: '2024-01-02' } });
    expect(h.rows[0]!.durationMs).toBeGreaterThanOrEqual(0); expect(JSON.stringify(h.rows[0])).not.toContain('password');
  });

  test('TRACE-03 a TRACE-05: price y matching enlazan recurso y mapean no_matches', async () => {
    const price = harness((_req, res) => res.json({ status: 'available', rule: { id: 'xm-preciobolsnaci-b1', version: '1.0.0' }, trace: { executionId: 'price-run' } }));
    await request(price.app, '/forecasts/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 9, targetDate: '2024-01-01' }) });
    expect(price.rows[0]).toMatchObject({ resourceType: 'price_forecast_execution', resourceId: 'price-run', modelId: 'xm-preciobolsnaci-b1' });
    const matching = harness((_req, res) => res.json({ status: 'no_matches', summary: { offersConsidered: 2, demandsConsidered: 3 }, trace: { executionId: 'match-run' } }), true);
    await request(matching.app, '/matches/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(matching.rows[0]).toMatchObject({ requesterType: 'authenticated_user', requesterId: '00000000-0000-4000-8000-000000000001', methodId: 'matching-v1', executionStatus: 'empty', resultStatus: 'no_matches', resourceType: 'matching_execution', resourceId: 'match-run', parametersSnapshot: { criteriaVersion: 'matching-v1', offerCount: 2, demandCount: 3 } });
  });

  test('TRACE-04 y TRACE-11: matching matched registra éxito autenticado y recurso existente', async () => {
    const h = harness((_req, res) => res.json({ status: 'matched', summary: { offersConsidered: 1, demandsConsidered: 1 }, trace: { executionId: 'matched-run' } }), true);
    const result = await request(h.app, '/matches/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(h.rows[0]).toMatchObject({ requestId: result.requestId, endpoint: '/matches/suggest', httpMethod: 'POST', requesterType: 'authenticated_user', requesterId: '00000000-0000-4000-8000-000000000001', methodId: 'matching-v1', executionStatus: 'succeeded', resultStatus: 'matched', resourceType: 'matching_execution', resourceId: 'matched-run' });
    expect(h.rows[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('TRACE-06 y TRACE-07: Patterns conserva método y no_results es empty', async () => {
    const h = harness((_req, res) => res.json({ status: 'no_results', method: { id: 'energy-pattern-descriptive', version: '1.0.0' }, persistence: { analysisId: 'pattern-run', persistence: 'persisted' } }), true);
    await request(h.app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 18 }) });
    expect(h.rows[0]).toMatchObject({ executionStatus: 'empty', methodId: 'energy-pattern-descriptive', methodVersion: '1.0.0', resourceType: 'pattern_analysis', resourceId: 'pattern-run' });
  });

  test('TRACE-06 y TRACE-11: patterns completed registra éxito y metadata autenticada', async () => {
    const h = harness((_req, res) => res.json({ status: 'completed', method: { id: 'energy-pattern-descriptive', version: '1.0.0' }, persistence: { analysisId: 'completed-run', persistence: 'persisted' } }), true);
    const result = await request(h.app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 18, token: 'ignored' }) });
    expect(h.rows[0]).toMatchObject({ requestId: result.requestId, endpoint: '/patterns/analyze', httpMethod: 'POST', requesterType: 'authenticated_user', requesterId: '00000000-0000-4000-8000-000000000001', parametersSnapshot: { preparedDatasetId: 18 }, executionStatus: 'succeeded', resultStatus: 'completed', methodId: 'energy-pattern-descriptive', methodVersion: '1.0.0', resourceType: 'pattern_analysis', resourceId: 'completed-run' });
    expect(h.rows[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('TRACE-08 y TRACE-15: 4xx se registra failed y catálogo ausente es empty', async () => {
    const failed = harness((_req, res) => res.status(400).json({ error: 'INVALID_FORECAST_REQUEST' }));
    await request(failed.app, '/forecasts/demand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(failed.rows[0]).toMatchObject({ executionStatus: 'failed', errorCode: 'INVALID_FORECAST_REQUEST', requesterType: 'system' });
    const missing = harness((_req, res) => res.status(404).json({ error: 'PREDICTIVE_ARTIFACT_NOT_FOUND' }));
    await request(missing.app, '/models/missing');
    expect(missing.rows[0]).toMatchObject({ endpoint: '/models/:id', executionStatus: 'empty', errorCode: 'PREDICTIVE_ARTIFACT_NOT_FOUND', parametersSnapshot: { modelId: 'missing' } });
    const catalog = harness((_req, res) => res.json({ artifacts: [] }));
    await request(catalog.app, '/models');
    expect(catalog.rows[0]).toMatchObject({ endpoint: '/models', httpMethod: 'GET', capability: 'models', executionStatus: 'succeeded' });
    const metrics = harness((_req, res) => res.json({ id: 'xm-gene-ridge', version: '1.0.0' }));
    await request(metrics.app, '/models/xm-gene-ridge/metrics');
    expect(metrics.rows[0]).toMatchObject({ endpoint: '/models/:id/metrics', modelId: 'xm-gene-ridge', modelVersion: '1.0.0' });
    const capabilities = harness((_req, res) => res.json({ capabilities: [] }));
    const capabilityResult = await request(capabilities.app, '/capabilities/versions');
    expect(capabilities.rows[0]).toMatchObject({ requestId: capabilityResult.requestId, endpoint: '/capabilities/versions', httpMethod: 'GET', capability: 'capability_versions', requesterType: 'system', executionStatus: 'succeeded', parametersSnapshot: {} });
  });

  test('TRACE-08: 500 conserva envelope público y no persiste detalles privados', async () => {
    const h = harness((_req, res) => res.status(500).json({ error: 'FORECAST_FAILED', message: 'No fue posible generar el pronóstico.' }));
    const result = await request(h.app, '/forecasts/supply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 1, targetDate: '2024-01-01', password: 'secret', token: 'token', cookie: 'cookie', DATABASE_URL: 'private database error' }) });
    expect(result).toMatchObject({ status: 500, body: { error: 'FORECAST_FAILED', message: 'No fue posible generar el pronóstico.' } });
    expect(h.rows[0]).toMatchObject({ executionStatus: 'failed', errorCode: 'FORECAST_FAILED' });
    const persisted = JSON.stringify(h.rows[0]);
    for (const privateValue of ['private database error', 'password', 'secret', 'token', 'cookie', 'DATABASE_URL', 'stack']) expect(persisted).not.toContain(privateValue);
  });

  test('TRACE-16: fallo de almacenamiento no altera la respuesta', async () => {
    const h = harness((_req, res) => res.json({ status: 'available', modelId: 'xm-demandasin-ridge', modelVersion: '1.0.0' }), false, true);
    expect(await request(h.app, '/forecasts/demand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 1, targetDate: '2024-01-01' }) })).toMatchObject({ status: 200, body: { status: 'available' } });
  });
});
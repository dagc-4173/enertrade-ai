import { describe, expect, test } from 'bun:test';
import express from 'express';
import { createForecastRouter } from '../controllers/forecast.controller';
import { createHealthRouter } from '../controllers/health.controller';
import { createMatchingRouter } from '../controllers/matching.controller';
import { createPatternsRouter } from '../controllers/patterns.controller';
import { requestIdMiddleware } from '../middlewares/request-id.middleware';
import type { SafeErrorEvent, SafeLogger } from '../lib/safe-logger';
import { ForecastError } from '../services/forecast.contract';

async function request(app: express.Express, path: string, init: RequestInit = {}) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener.');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    return { status: response.status, headers: response.headers, body: await response.json() as Record<string, unknown> };
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function logger() {
  const events: SafeErrorEvent[] = [];
  const sink: SafeLogger = { error: event => events.push(event) };
  return { events, sink };
}

function appFor(router: express.Router) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(router);
  return app;
}

describe('HU15 observabilidad mínima', () => {
  test('HU15-REQ-01 a REQ-04: expone UUID interno y no acepta el del cliente', async () => {
    const app = appFor(createHealthRouter({ check: async () => ({ status: 'ok', service: 'enertrade-backend', dependencies: { database: 'ok' } }) }));
    const first = await request(app, '/', { headers: { 'X-Request-Id': 'client-controlled' } });
    const second = await request(app, '/');
    const firstId = first.headers.get('x-request-id');
    const secondId = second.headers.get('x-request-id');
    expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
    expect(firstId).not.toBe('client-controlled');
    expect(secondId).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondId).not.toBe(firstId);
  });

  test('HU15-HEALTH-01: DB sana responde 200', async () => {
    const result = await request(appFor(createHealthRouter({ check: async () => ({ status: 'ok', service: 'enertrade-backend', dependencies: { database: 'ok' } }) })), '/');
    expect(result).toMatchObject({ status: 200, body: { status: 'ok', service: 'enertrade-backend', dependencies: { database: 'ok' } } });
  });

  test('HU15-HEALTH-02 a HEALTH-04: DB caída o timeout responden 503 sin detalles', async () => {
    const unavailable = await request(appFor(createHealthRouter({ check: async () => ({ status: 'degraded', service: 'enertrade-backend', dependencies: { database: 'unavailable' } }) })), '/');
    expect(unavailable).toMatchObject({ status: 503, body: { status: 'degraded', dependencies: { database: 'unavailable' } } });
    expect(JSON.stringify(unavailable.body)).not.toMatch(/private|database_url|stack/i);
    const { createHealthService } = await import('../services/health.service');
    const timeout = createHealthService(() => new Promise(() => {}), 1);
    expect(await timeout.check()).toEqual({ status: 'degraded', service: 'enertrade-backend', dependencies: { database: 'unavailable' } });
  });

  test('HU15-LOG-01 a LOG-04: Forecast 500 seguro se registra con el mismo requestId', async () => {
    const captured = logger();
    const app = appFor(createForecastRouter(async input => {
      if (input !== null && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 0) throw new ForecastError(400, 'INVALID_FORECAST_REQUEST');
      throw new Error('private database error password=secret token=value');
    }, undefined, undefined, undefined, undefined, undefined, captured.sink));
    const result = await request(app, '/supply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 1, targetDate: '2024-01-01' }) });
    expect(result).toMatchObject({ status: 500, body: { error: 'FORECAST_FAILED' } });
    expect(captured.events).toEqual([expect.objectContaining({ requestId: result.headers.get('x-request-id'), method: 'POST', path: '/supply', status: 500, errorCode: 'FORECAST_FAILED', errorName: 'Error' })]);
    expect(JSON.stringify(captured.events)).not.toMatch(/password|secret|token|private database|stack/i);
    const invalid = await request(app, '/supply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(invalid.status).toBe(400);
    expect(captured.events).toHaveLength(1);
  });

  test('HU15-LOG-MATCH: Matching 500 seguro se registra', async () => {
    const captured = logger();
    const service = { suggest: async () => { throw new Error('private matching token=secret'); } };
    const app = appFor(createMatchingRouter(service, (_req, _res, next) => next(), captured.sink));
    const result = await request(app, '/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(result).toMatchObject({ status: 500, body: { error: 'MATCHING_OPERATION_FAILED' } });
    expect(captured.events[0]).toMatchObject({ requestId: result.headers.get('x-request-id'), errorCode: 'MATCHING_OPERATION_FAILED' });
  });

  test('HU15-LOG-PATTERN: Patterns 500 seguro se registra', async () => {
    const captured = logger();
    const service = { analyze: async (_id: number) => { throw new Error('private pattern cookie=secret'); }, list: async () => [] };
    const app = appFor(createPatternsRouter(service, (_req, _res, next) => next(), captured.sink));
    const result = await request(app, '/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 1 }) });
    expect(result).toMatchObject({ status: 500, body: { error: 'PATTERN_OPERATION_FAILED' } });
    expect(captured.events[0]).toMatchObject({ requestId: result.headers.get('x-request-id'), errorCode: 'PATTERN_OPERATION_FAILED' });
  });
});
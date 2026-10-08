import { expect, test } from 'bun:test';
import express from 'express';
import { createXmDailySyncRouter } from '@/controllers/xm-daily-sync.controller';
import { createXmDailySyncService } from '@/services/xm-daily-sync.service';

const availability = [{ series: 'Gene', latestObservationDate: '2026-09-15', nextForecastDate: '2026-09-16', supportedHorizonDays: 1 }];
const service = { availability: async () => availability, sync: async (metric?: 'Gene' | 'DemaSIN' | 'PrecBolsNaci') => ({ metrics: [{ metric: metric ?? 'Gene', status: 'up_to_date' }] }) };

async function request(app: express.Express, path: string, init: RequestInit = {}) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected address.');
  try { const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init); return { status: response.status, body: await response.json() }; }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('XM sync and availability routes require the existing authentication boundary', async () => {
  const app = express(); app.use(createXmDailySyncRouter(service, (_req, res) => res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Sesión requerida.' })));
  expect((await request(app, '/forecast-availability')).status).toBe(401);
  expect((await request(app, '/admin/xm/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
});

test('authenticated routes validate input and expose only requested XM metric', async () => {
  const app = express(); app.use(createXmDailySyncRouter(service, (_req, _res, next) => next()));
  expect(await request(app, '/forecast-availability')).toEqual({ status: 200, body: { availability } });
  expect(await request(app, '/admin/xm/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).toEqual({ status: 200, body: { metrics: [{ metric: 'Gene', status: 'up_to_date' }] } });
  expect(await request(app, '/admin/xm/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"metric":"DemaSIN"}' })).toEqual({ status: 200, body: { metrics: [{ metric: 'DemaSIN', status: 'up_to_date' }] } });
  expect((await request(app, '/admin/xm/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"metric":"Other"}' })).status).toBe(400);
  expect((await request(app, '/admin/xm/sync', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
});

test('global availability database failure remains HTTP 500 and never a partial success', async () => {
  const events: unknown[] = [];
  const app = express();
  app.use(createXmDailySyncRouter({ ...service, availability: async () => { throw new Error('database unavailable'); } },
    (_req, _res, next) => next(), { error: event => events.push(event) }));
  expect((await request(app, '/forecast-availability')).status).toBe(500);
  expect(events).toHaveLength(1);
});

test('single-metric sync exposes additive NO_NEW_DATA metadata without invoking artifact services', async () => {
  const metrics: string[] = [];
  const forbidden = async (): Promise<never> => { throw new Error('Artifact operation forbidden.'); };
  const syncService = createXmDailySyncService({
    readCoverage: async metric => {
      metrics.push(metric);
      return { historicalFrom: '2024-01-01', persistedUntil: '2026-10-05', latestReceivedDate: '2026-10-05',
        latestIndividuallyUsableDate: '2026-10-05', semanticExcludedDates: [] };
    },
    now: () => new Date('2026-10-08T17:00:00Z'),
    query: async input => ({ records: input.startDate === '2026-10-05'
      ? Array.from({ length: 24 }, (_, index) => ({ date: input.startDate, hour: index + 1, value: index })) : [] }),
    ingest: forbidden, materialize: forbidden, validate: forbidden, prepare: forbidden,
  });
  const app = express(); app.use(createXmDailySyncRouter(syncService, (_req, _res, next) => next()));
  const result = await request(app, '/admin/xm/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"metric":"PrecBolsNaci"}',
  });
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ metrics: [{
    metric: 'PrecBolsNaci', status: 'up_to_date', outcome: 'NO_NEW_DATA',
    persistedUntil: '2026-10-05', latestCompleteAvailableDate: '2026-10-05',
    requestedFrom: '2026-10-06', requestedTo: '2026-10-05', newDays: 0, ingestedRows: 0,
  }] });
  expect(metrics).toEqual(['PrecBolsNaci']);
});
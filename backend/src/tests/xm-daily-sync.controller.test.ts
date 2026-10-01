import { expect, test } from 'bun:test';
import express from 'express';
import { createXmDailySyncRouter } from '@/controllers/xm-daily-sync.controller';

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
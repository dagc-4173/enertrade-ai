import { afterAll, expect, test } from 'bun:test';
import { app } from '@/app';

const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected app address.');
const base = `http://127.0.0.1:${address.port}`;
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
const errorCode = async (response: Response) => (await response.json() as { error: string }).error;

test('full app keeps public health and auth flow outside XM sync authentication', async () => {
  const health = await fetch(`${base}/health`);
  expect([200, 503]).toContain(health.status);
  expect(await health.json()).toMatchObject({ service: 'enertrade-backend' });

  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  expect(login.status).toBe(400);
  expect(await errorCode(login)).toBe('INVALID_EMAIL');
});

test('full app protects only XM availability and manual sync routes', async () => {
  const availability = await fetch(`${base}/forecast-availability`);
  expect(availability.status).toBe(401);
  expect(await errorCode(availability)).toBe('UNAUTHENTICATED');

  const sync = await fetch(`${base}/admin/xm/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  expect(sync.status).toBe(401);
  expect(await errorCode(sync)).toBe('UNAUTHENTICATED');
});
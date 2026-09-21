import { expect, test } from 'bun:test';
import express from 'express';
import { createHealthRouter } from '@/controllers/health.controller';
import { createHealthService } from '@/services/health.service';

test('HEALTH-01: base de datos disponible produce estado ok sin detalles internos', async () => {
  const service = createHealthService(async () => undefined);
  expect(await service.check()).toEqual({ status: 'ok', service: 'enertrade-backend', dependencies: { database: 'ok' } });
});

test('HEALTH-02: base de datos no disponible produce estado degraded sin filtrar el error', async () => {
  const service = createHealthService(async () => { throw new Error('conexión rechazada con credenciales secretas'); });
  const result = await service.check();
  expect(result).toEqual({ status: 'degraded', service: 'enertrade-backend', dependencies: { database: 'unavailable' } });
  expect(JSON.stringify(result)).not.toMatch(/credenciales|secretas|conexión rechazada/i);
});

test('HEALTH-03: tiempo de espera agotado produce estado degraded', async () => {
  const service = createHealthService(() => new Promise(() => {}), 10);
  expect(await service.check()).toEqual({ status: 'degraded', service: 'enertrade-backend', dependencies: { database: 'unavailable' } });
});

test('HEALTH-04: el endpoint responde 200 y el contrato exacto cuando la base de datos está disponible', async () => {
  const app = express();
  app.use('/health', createHealthRouter(createHealthService(async () => undefined)));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', service: 'enertrade-backend', dependencies: { database: 'ok' } });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('HEALTH-05: el endpoint responde 503 sin exponer detalles internos cuando la base de datos falla', async () => {
  const app = express();
  app.use('/health', createHealthRouter(createHealthService(async () => { throw new Error('detalle interno no público'); })));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'degraded', service: 'enertrade-backend', dependencies: { database: 'unavailable' } });
    expect(JSON.stringify(body)).not.toMatch(/stack|detalle interno|no público/i);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('HEALTH-06: el endpoint responde 503 cuando la verificación agota el tiempo de espera', async () => {
  const app = express();
  app.use('/health', createHealthRouter(createHealthService(() => new Promise(() => {}), 10)));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'degraded', service: 'enertrade-backend', dependencies: { database: 'unavailable' } });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

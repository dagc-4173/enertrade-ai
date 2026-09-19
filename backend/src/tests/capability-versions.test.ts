import { afterAll, expect, mock, test } from 'bun:test';
import express from 'express';
import { request as httpRequest } from 'node:http';
import { createCapabilityVersionsRouter } from '@/controllers/capability-versions.controller';
import { createCapabilityVersionsService } from '@/services/capability-versions.service';
import { loadModel as loadGene } from '@/models/xm-gene-ridge/model-loader';
import { loadModel as loadDemand } from '@/models/xm-demandasin-ridge/model-loader';
import { loadRule } from '@/models/xm-preciobolsnaci-b1/rule-loader';

const app = express(); app.use('/capabilities', createCapabilityVersionsRouter());
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('listener');
const base = `http://127.0.0.1:${address.port}`;
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

test('VERSION-01 a VERSION-08/VERSION-11: expone las cinco capacidades activas con taxonomía y fecha honesta', async () => {
  const response = await fetch(`${base}/capabilities/versions`); expect(response.status).toBe(200);
  const body = await response.json() as { capabilities: Array<Record<string, unknown>> };
  expect(body.capabilities).toEqual([
    { capability: 'supply_forecast', artifactType: 'ml_model', id: 'xm-gene-ridge', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
    { capability: 'demand_forecast', artifactType: 'ml_model', id: 'xm-demandasin-ridge', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
    { capability: 'price_estimation', artifactType: 'deterministic_rule', id: 'xm-preciobolsnaci-b1', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
    { capability: 'matching', artifactType: 'deterministic_method', id: 'matching-v1', version: 'v1', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
    { capability: 'pattern_recognition', artifactType: 'deterministic_method', id: 'energy-pattern-descriptive', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  ]);
});

test('VERSION-09: fallo del loader conserva un envelope seguro', async () => {
  const service = createCapabilityVersionsService({ gene: () => { throw new Error('private manifest path'); }, demand: loadDemand, price: loadRule });
  const isolated = express(); isolated.use('/capabilities', createCapabilityVersionsRouter(service));
  const listener = isolated.listen(0, '127.0.0.1'); await new Promise<void>(resolve => listener.once('listening', resolve));
  const port = (listener.address() as { port: number }).port;
  const response = await fetch(`http://127.0.0.1:${port}/capabilities/versions`);
  expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: 'CAPABILITY_VERSIONS_FAILED', message: 'No fue posible consultar las versiones activas.' });
  await new Promise<void>(resolve => listener.close(() => resolve()));
});

test('VERSION-10 no aplica: solo existe una versión real; VERSION-12 conserva salida determinística', async () => {
  const first = await (await fetch(`${base}/capabilities/versions`)).json();
  const second = await (await fetch(`${base}/capabilities/versions`)).json();
  expect(second).toEqual(first);
});

test('rechaza query o body no admitidos sin cambiar el contrato', async () => {
  expect((await fetch(`${base}/capabilities/versions?active=true`)).status).toBe(400);
  const bodyStatus = await new Promise<number>((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port: address.port, path: '/capabilities/versions', method: 'GET', headers: { 'Content-Length': '2' } }, response => resolve(response.statusCode ?? 0));
    request.on('error', reject); request.end('{}');
  });
  expect(bodyStatus).toBe(400);
  expect(loadGene().modelVersion).toBe('1.0.0');
});
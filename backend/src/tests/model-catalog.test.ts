import { afterAll, expect, mock, test } from 'bun:test';
import express from 'express';
import { createModelCatalogRouter } from '@/controllers/model-catalog.controller';
import { createModelCatalogService } from '@/services/model-catalog.service';
import { loadModel as loadGeneModel } from '@/models/xm-gene-ridge/model-loader';
import { loadModel as loadDemandModel } from '@/models/xm-demandasin-ridge/model-loader';
import { loadRule } from '@/models/xm-preciobolsnaci-b1/rule-loader';

const forbidden = mock(() => { throw Error('database must not be used'); });
mock.module('@/lib/prisma', () => ({ prisma: { preparedDataset: { findUnique: forbidden } } }));
const app = express();
app.use('/models', createModelCatalogRouter());
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw Error('listener');
const base = `http://127.0.0.1:${address.port}`;
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

test('GET /models exposes all active horizons and preserves historical artifacts', async () => {
  const response = await fetch(`${base}/models`);
  expect(response.status).toBe(200);
  const body = await response.json() as { artifacts: { id: string; kind: string; type: string }[] };
  expect(body.artifacts.map(artifact => artifact.id)).toEqual([...Array.from({ length: 7 }, (_, i) => `xm-gene-ridge-direct-h${i + 1}-v2`), ...Array.from({ length: 6 }, (_, i) => `xm-demandasin-ridge-direct-h${i + 1}-v5`), ...Array.from({ length: 7 }, (_, i) => `xm-demareal-ridge-direct-h${i + 1}-v1`), ...[4,5,6].map(h => `xm-preciobolsnaci-ridge-direct-h${h}-v1`), 'xm-gene-ridge', 'xm-demandasin-ridge', 'xm-preciobolsnaci-b1']);
  expect(body.artifacts).toHaveLength(26);
  expect(body.artifacts.find(artifact => artifact.id === 'xm-gene-ridge')).toMatchObject({ kind: 'model', type: 'ridge' });
  expect(body.artifacts.find(artifact => artifact.id === 'xm-demandasin-ridge')).toMatchObject({ kind: 'model', type: 'ridge' });
  expect(body.artifacts.find(artifact => artifact.id === 'xm-preciobolsnaci-b1')).toMatchObject({ kind: 'rule', type: 'deterministic_baseline' });
});

test.each(['xm-gene-ridge', 'xm-demandasin-ridge', 'xm-preciobolsnaci-b1'])('GET /models/%s returns loader metadata', async id => {
  const response = await fetch(`${base}/models/${id}`);
  expect(response.status).toBe(200);
  const body = await response.json() as any;
  const artifact = id === 'xm-gene-ridge' ? loadGeneModel() : id === 'xm-demandasin-ridge' ? loadDemandModel() : loadRule();
  expect(body.id).toBe(id);
  expect(body.version).toBe('1.0.0');
  expect(body.method.features).toEqual(id === 'xm-preciobolsnaci-b1' ? [] : (artifact as { orderedFeatures: string[] }).orderedFeatures);
  expect(JSON.stringify(body)).not.toMatch(/sha256|confidence.*value/);
});

test('metadata declares scope and deterministic price equation', async () => {
  const gene = await (await fetch(`${base}/models/xm-gene-ridge`)).json() as any;
  const demand = await (await fetch(`${base}/models/xm-demandasin-ridge`)).json() as any;
  const price = await (await fetch(`${base}/models/xm-preciobolsnaci-b1`)).json() as any;
  expect(gene.limitations.join(' ')).toContain('agregada XM');
  expect(demand.limitations.join(' ')).toContain('No usa temperatura');
  expect(demand.limitations.join(' ')).toContain('No usa precio');
  expect(demand.limitations.join(' ')).toContain('No zonal');
  expect(price.kind).toBe('rule');
  expect(price.method.equation).toBe('P_hat(D,p) = P(D-1,p)');
  expect(price.limitations.join(' ')).toMatch(/not a trained ML model/i);
});

test.each(['xm-gene-ridge', 'xm-demandasin-ridge', 'xm-preciobolsnaci-b1'])('GET /models/%s/metrics uses stored values', async id => {
  const response = await fetch(`${base}/models/${id}/metrics`);
  expect(response.status).toBe(200);
  const body = await response.json() as any;
  expect(body.id).toBe(id);
  expect(body.metrics.MAE.value).toBeGreaterThanOrEqual(0);
  expect(body.metrics.RMSE.value).toBeGreaterThanOrEqual(0);
});

test('unknown artifact is a safe 404', async () => {
  const response = await fetch(`${base}/models/unknown`);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'PREDICTIVE_ARTIFACT_NOT_FOUND', message: 'Artefacto predictivo no encontrado.' });
});

test('incompatible loader fails safely', async () => {
  const service = createModelCatalogService({
    geneModel: () => { throw new Error('private detail'); },
    geneEvaluation: (() => { throw new Error('private detail'); }) as never,
    demandModel: loadDemandModel,
    priceRule: loadRule,
  });
  const isolated = express();
  isolated.use('/models', createModelCatalogRouter(service));
  const isolatedServer = isolated.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => isolatedServer.listening ? resolve() : isolatedServer.once('listening', resolve));
  const isolatedAddress = isolatedServer.address();
  if (!isolatedAddress || typeof isolatedAddress === 'string') throw Error('listener');
  const response = await fetch(`http://127.0.0.1:${isolatedAddress.port}/models`);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('private detail');
  isolatedServer.close();
});
test('current catalog identifies every runtime horizon and keeps V5 validation distinct', async () => {
  const service = createModelCatalogService();
  for (const a of service.list()) {
    const detail = service.get(a.id)!;
    if (a.id === 'xm-gene-ridge' || a.id === 'xm-demandasin-ridge') { expect(a.activeInRuntime).toBe(false); continue }
    expect(a.activeInRuntime).toBe(true);
    const metrics = service.metrics(a.id, a.version);
    expect(metrics.id).toBe(a.id); expect(metrics.version).toBe(a.version);
    if (a.id.endsWith('-v5')) { expect(detail.lifecycle.promoted).toBe(false); expect(metrics.evaluationType).toBe('validation_technical') }
    if (a.id.endsWith('-v2')) expect(metrics.evaluationType).toBe('external_temporal_holdout');
  }
});

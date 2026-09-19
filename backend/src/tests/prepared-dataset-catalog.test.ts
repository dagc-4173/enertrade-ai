import { describe, expect, test } from 'bun:test';
import express from 'express';
import { createPreparedDatasetCatalogRouter } from '@/controllers/prepared-dataset-catalog.controller';
import { createPreparedDatasetCatalogService, type PreparedDatasetCatalogStore } from '@/services/prepared-dataset-catalog.service';

const first = {
  id: 9, sourceDatasetId: 4, profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0',
  preparedAt: new Date('2026-09-18T10:00:00.000Z'), content: { records: [{}, {}] }, sourceDataset: { dataType: 'generacion' },
};
const second = { ...first, id: 8, preparedAt: new Date('2026-09-17T10:00:00.000Z'), content: { records: [{}] } };
function store(rows: typeof first[] = [first, second], failure?: Error): PreparedDatasetCatalogStore {
  return { findMany: async () => {
    if (failure) throw failure;
    return rows;
  } };
}
async function request(app: express.Express, path = '/prepared-datasets', init: RequestInit = {}) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected listener');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    return { status: response.status, body: await response.json() };
  }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
function appFor(source: PreparedDatasetCatalogStore) {
  const app = express(); app.use('/prepared-datasets', createPreparedDatasetCatalogRouter(createPreparedDatasetCatalogService(source))); return app;
}

describe('GET /prepared-datasets', () => {
  test('devuelve un resumen acotado, ordenado y sin contenido', async () => {
    const result = await request(appFor(store()));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ preparedDatasets: [
      { id: 9, sourceDatasetId: 4, dataType: 'generacion', profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', preparedAt: '2026-09-18T10:00:00.000Z', recordCount: 2 },
      { id: 8, sourceDatasetId: 4, dataType: 'generacion', profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', preparedAt: '2026-09-17T10:00:00.000Z', recordCount: 1 },
    ] });
    expect(JSON.stringify(result.body)).not.toContain('records');
  });
  test('devuelve una lista vacía controlada', async () => { expect(await request(appFor(store([])))).toEqual({ status: 200, body: { preparedDatasets: [] } }); });
  test('rechaza cuerpo o query', async () => {
    expect((await request(appFor(store()), '/prepared-datasets?profile=x')).status).toBe(400);
    expect((await request(appFor(store()), '/prepared-datasets', { headers: { 'Content-Length': '1' } })).status).toBe(400);
  });
  test('falla de Prisma devuelve un error seguro', async () => {
    const result = await request(appFor(store([], new Error('DATABASE_URL secret stack'))));
    expect(result).toEqual({ status: 500, body: { error: 'PREPARED_DATASET_CATALOG_FAILED', message: 'No fue posible consultar los datasets preparados.' } });
  });
});
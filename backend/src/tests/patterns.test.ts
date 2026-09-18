import { describe, expect, test } from 'bun:test';
import express from 'express';
import { createPatternsRouter } from '../controllers/patterns.controller';
import { createPatternsService, type StoredPatternAnalysis } from '../services/patterns.service';

const prepared = { id: 7, profileId: 'xm_demandasin_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_demandasin_base', sourceRulesetVersion: '1.0.0', content: { records: [{ fecha_xm: '2024-01-01', demanda_kwh: 10 }, { fecha_xm: '2024-01-08', demanda_kwh: 20 }] } };
function harness(options: { missing?: boolean; persistenceFails?: boolean } = {}) {
  const rows: StoredPatternAnalysis[] = [];
  const service = createPatternsService({
    findPreparedDataset: async id => options.missing || id !== 7 ? null : prepared,
    createAnalysis: async analysis => { if (options.persistenceFails) throw new Error('private database error'); rows.push(structuredClone(analysis)); },
    listAnalyses: async () => rows,
  });
  const app = express();
  app.use('/patterns', createPatternsRouter(service, (_req, _res, next) => next()));
  return { app, rows };
}

async function request(app: express.Express, path: string, init: RequestInit = {}) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener.');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    return { status: response.status, body: await response.json() as unknown };
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe('HU12/HU13 análisis y consulta de patrones', () => {
  test('PATTERN-09 y PATTERN-10: POST persiste método y snapshot igual a respuesta técnica', async () => {
    const h = harness();
    const result = await request(h.app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 7 }) });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'completed', method: { id: 'energy-pattern-descriptive', version: '1.0.0' }, persistence: { persistence: 'persisted' } });
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]!.method).toEqual({ id: 'energy-pattern-descriptive', version: '1.0.0', type: 'deterministic-statistical' });
    const { persistence, ...technical } = result.body as Record<string, unknown>;
    const { createdAt: _createdAt, preparedDatasetId: _preparedDatasetId, ...stored } = h.rows[0]!;
    expect(stored).toEqual(technical as typeof stored);
  });

  test('persistencia fallida conserva el resultado técnico sin filtrar error interno', async () => {
    const result = await request(harness({ persistenceFails: true }).app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 7 }) });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'completed', persistence: { persistence: 'failed' } });
    expect(JSON.stringify(result.body)).not.toContain('private database');
  });

  test.each([
    { label: 'object vacío', body: {} }, { label: 'null', body: null }, { label: 'array', body: [] },
    { label: 'id cero', body: { preparedDatasetId: 0 } }, { label: 'campo extra', body: { preparedDatasetId: 7, extra: true } },
  ])('POST rechaza body inválido $label', async ({ body }) => {
    const result = await request(harness().app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(result.status).toBe(400);
  });

  test('dataset inexistente e incompatible devuelven errores funcionales', async () => {
    const missing = await request(harness({ missing: true }).app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 7 }) });
    expect(missing).toMatchObject({ status: 404, body: { error: 'PREPARED_DATASET_NOT_FOUND' } });
    const incompatible = { ...prepared, profileId: 'other' };
    const service = createPatternsService({ findPreparedDataset: async () => incompatible, createAnalysis: async () => undefined, listAnalyses: async () => [] });
    const app = express(); app.use('/patterns', createPatternsRouter(service, (_req, _res, next) => next()));
    expect(await request(app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 7 }) })).toMatchObject({ status: 422, body: { error: 'PATTERN_PROFILE_NOT_APPLICABLE' } });
  });

  test('PATTERN-Q-01 a Q-05/Q-08: GET filtra intersección, tipo, variable y orden', async () => {
    const h = harness();
    const first = await request(h.app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 7 }) });
    const second = await request(h.app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 7 }) });
    h.rows[0]!.createdAt = new Date('2024-01-01T00:00:00Z'); h.rows[1]!.createdAt = new Date('2024-01-02T00:00:00Z');
    const listed = await request(h.app, '/patterns?from=2024-01-08&to=2024-01-08&dataType=demanda&variable=demanda_kwh');
    expect(listed.status).toBe(200);
    expect((listed.body as unknown[]).map(item => (item as Record<string, unknown>).analysisId)).toEqual([(second.body as Record<string, unknown>).analysisId, (first.body as Record<string, unknown>).analysisId]);
    expect(await request(h.app, '/patterns?dataType=precios')).toEqual({ status: 200, body: [] });
  });

  test('PATTERN-Q-07 y Q-09: GET valida filtros y no expone campos internos', async () => {
    const h = harness();
    await request(h.app, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 7 }) });
    expect(await request(h.app, '/patterns?from=bad')).toMatchObject({ status: 400, body: { error: 'INVALID_PATTERN_QUERY' } });
    const listed = await request(h.app, '/patterns');
    expect(JSON.stringify(listed.body)).not.toMatch(/preparedDatasetId|sourceDatasetId|userId|token|password/);
  });

  test('PATTERN-Q-06: requiere autenticación', async () => {
    const app = express();
    app.use('/patterns', createPatternsRouter(createPatternsService({ findPreparedDataset: async () => prepared, createAnalysis: async () => undefined, listAnalyses: async () => [] }), async (_req, res) => { res.status(401).json({ error: 'UNAUTHENTICATED' }); }));
    expect(await request(app, '/patterns')).toMatchObject({ status: 401, body: { error: 'UNAUTHENTICATED' } });
  });
});
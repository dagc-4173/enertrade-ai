import { describe, expect, test } from 'bun:test';
import express from 'express';
import { createMatchingRouter } from '../controllers/matching.controller';
import { buildMatchingSuggestions, type MatchingDemandLike, type MatchingOfferLike, type MatchingReadRepository } from '../services/matching.service';
import { createMatchingTraceService, createTracedMatchingService } from '../services/matching-trace.service';

const date = (value: string) => new Date(`${value}T00:00:00Z`);
const offer = (overrides: Partial<MatchingOfferLike> = {}): MatchingOfferLike => ({
  id: 'offer-1', quantityKwh: '30.00', pricePerKwh: '400.00000', deliveryDate: date('2026-09-18'), createdAt: date('2026-09-16'), status: 'ACTIVE', ...overrides,
});
const demand = (overrides: Partial<MatchingDemandLike> = {}): MatchingDemandLike => ({
  id: 'demand-1', quantityKwh: '30.00', maxPricePerKwh: '450.00000', deliveryDate: date('2026-09-18'), createdAt: date('2026-09-15'), status: 'ACTIVE', ...overrides,
});

type Options = { startFails?: boolean; finishFails?: boolean; matchingFails?: boolean };
function harness(options: Options = {}, initialOffers = [offer()], initialDemands = [demand()]) {
  const rows = new Map<string, Record<string, unknown>>();
  let creates = 0;
  let updates = 0;
  const trace = createMatchingTraceService({
    create: async ({ data }) => {
      creates += 1;
      if (options.startFails) throw new Error('PRIVATE_PRISMA stack');
      rows.set(data.id, { ...data, createdAt: new Date() });
    },
    update: async ({ where, data }) => {
      updates += 1;
      if (options.finishFails) throw new Error('PRIVATE_PRISMA stack');
      Object.assign(rows.get(where.id)!, data);
    },
  });
  const repository: MatchingReadRepository = {
    listActiveOffers: async () => {
      if (options.matchingFails) throw new Error('PRIVATE_DB stack');
      return initialOffers;
    },
    listActiveDemands: async () => initialDemands,
  };
  return { service: createTracedMatchingService(repository, trace), rows, counts: () => ({ creates, updates }) };
}

function row(rows: Map<string, Record<string, unknown>>, executionId: string) {
  const value = rows.get(executionId);
  expect(value).toBeDefined();
  return value!;
}

describe('HU11 matching execution trace', () => {
  test('TRACE-MATCH-01: FULL se persiste', async () => {
    const h = harness();
    const result = await h.service.suggest();
    expect(result.status).toBe('matched');
    expect(row(h.rows, result.trace.executionId).executionStatus).toBe('succeeded');
  });

  test('TRACE-MATCH-02: PARTIAL se persiste como partial', async () => {
    const h = harness({}, [offer()], [demand({ quantityKwh: '60.00' })]);
    const result = await h.service.suggest();
    expect(result.status).toBe('partial');
    expect(row(h.rows, result.trace.executionId).matchingStatus).toBe('partial');
  });

  test('TRACE-MATCH-02A: el snapshot conserva resumen entero exacto', async () => {
    const h = harness(
      {},
      [offer({ id: 'offer-10000', quantityKwh: '10000', pricePerKwh: '950', deliveryDate: date('2026-09-23') })],
      [demand({ id: 'demand-10000', quantityKwh: '10000', maxPricePerKwh: '1000', deliveryDate: date('2026-09-23') })],
    );
    const result = await h.service.suggest();
    const snapshot = row(h.rows, result.trace.executionId).resultSnapshot as { matches: Array<{ suggestedQuantityKwh: string }>; demands: Array<{ suggestedQuantityKwh: string; unmatchedQuantityKwh: string; compatibility: string }> };
    expect(snapshot.matches[0]?.suggestedQuantityKwh).toBe('10000');
    expect(snapshot.demands[0]).toMatchObject({
      suggestedQuantityKwh: '10000',
      unmatchedQuantityKwh: '0',
      compatibility: 'FULL',
    });
  });

  test('TRACE-MATCH-03: NO_MATCH se persiste como succeeded/no_matches', async () => {
    const h = harness({}, [], [demand()]);
    const result = await h.service.suggest();
    const saved = row(h.rows, result.trace.executionId);
    expect(result.status).toBe('no_matches');
    expect(saved.executionStatus).toBe('succeeded');
    expect(saved.matchingStatus).toBe('no_matches');
  });

  test('TRACE-MATCH-04: inputSnapshot contiene ofertas y demandas utilizadas', async () => {
    const h = harness();
    const result = await h.service.suggest();
    expect(row(h.rows, result.trace.executionId).inputSnapshot).toEqual({
      offers: [{ id: 'offer-1', quantityKwh: '30.00', pricePerKwh: '400.00000', deliveryDate: '2026-09-18', createdAt: '2026-09-16T00:00:00.000Z' }],
      demands: [{ id: 'demand-1', quantityKwh: '30.00', maxPricePerKwh: '450.00000', deliveryDate: '2026-09-18', createdAt: '2026-09-15T00:00:00.000Z' }],
    });
  });

  test('TRACE-MATCH-05: snapshots preservan decimales como strings exactos', async () => {
    const h = harness({}, [offer({ quantityKwh: '30.00', pricePerKwh: '412.50000' })], [demand({ quantityKwh: '30.00', maxPricePerKwh: '500.00000' })]);
    const result = await h.service.suggest();
    expect(JSON.stringify(row(h.rows, result.trace.executionId))).toContain('"412.50000"');
  });

  test('TRACE-MATCH-06: criteriaVersion y criteriaSnapshot se guardan', async () => {
    const h = harness();
    const result = await h.service.suggest();
    const saved = row(h.rows, result.trace.executionId);
    expect(saved.criteriaVersion).toBe('matching-v1');
    expect(saved.criteriaSnapshot).toMatchObject({ activeStatus: 'ACTIVE', allocation: 'greedy' });
  });

  test('TRACE-MATCH-07: solicitudes idénticas reciben UUID distintos', async () => {
    const h = harness();
    const [first, second] = await Promise.all([h.service.suggest(), h.service.suggest()]);
    expect(first.trace.executionId).not.toBe(second.trace.executionId);
  });

  test('TRACE-MATCH-08: lifecycle crea y completa la ejecución', async () => {
    const h = harness();
    const result = await h.service.suggest();
    const saved = row(h.rows, result.trace.executionId);
    expect(h.counts()).toEqual({ creates: 1, updates: 1 });
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.completedAt).toBeInstanceOf(Date);
  });

  test('TRACE-MATCH-09: fallo de start conserva resultado técnico', async () => {
    const h = harness({ startFails: true });
    const result = await h.service.suggest();
    expect(result.status).toBe('matched');
    expect(result.trace.persistence).toBe('failed');
    expect(result.trace.executionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.counts()).toEqual({ creates: 1, updates: 0 });
  });

  test('TRACE-MATCH-10: fallo de finish conserva resultado técnico', async () => {
    const h = harness({ finishFails: true });
    const result = await h.service.suggest();
    expect(result.status).toBe('matched');
    expect(result.trace.persistence).toBe('failed');
    expect(row(h.rows, result.trace.executionId).executionStatus).toBe('pending');
  });

  test('TRACE-MATCH-11: fallo del matching intenta marcar failed', async () => {
    const h = harness({ matchingFails: true });
    await expect(h.service.suggest()).rejects.toThrow('PRIVATE_DB stack');
    const saved = row(h.rows, Array.from(h.rows.keys())[0]!);
    expect(saved.executionStatus).toBe('failed');
  });

  test('TRACE-MATCH-12: error persistido es sanitizado', async () => {
    const h = harness({ matchingFails: true });
    await expect(h.service.suggest()).rejects.toThrow();
    const saved = row(h.rows, Array.from(h.rows.keys())[0]!);
    expect(saved.errorCode).toBe('MATCHING_OPERATION_FAILED');
    expect(JSON.stringify(saved)).not.toContain('PRIVATE_DB');
  });

  test('TRACE-MATCH-13: no modifica las ofertas ni demandas leídas', async () => {
    const offers = [offer()];
    const demands = [demand()];
    const h = harness({}, offers, demands);
    await h.service.suggest();
    expect(offers).toEqual([offer()]);
    expect(demands).toEqual([demand()]);
  });

  test('TRACE-MATCH-14: no crea transacciones comerciales', async () => {
    const h = harness();
    await h.service.suggest();
    expect(h.counts()).toEqual({ creates: 1, updates: 1 });
  });

  test('TRACE-MATCH-15: resultSnapshot coincide con el resultado técnico', async () => {
    const offers = [offer()];
    const demands = [demand()];
    const h = harness({}, offers, demands);
    const result = await h.service.suggest();
    const { trace, ...technical } = result;
    expect(row(h.rows, trace.executionId).resultSnapshot).toEqual(technical);
    expect(technical).toEqual(buildMatchingSuggestions(offers, demands));
  });

  test('TRACE-MATCH-16: executionStatus y matchingStatus no se confunden', async () => {
    const h = harness({}, [offer()], [demand({ quantityKwh: '60.00' })]);
    const result = await h.service.suggest();
    const saved = row(h.rows, result.trace.executionId);
    expect(saved.executionStatus).toBe('succeeded');
    expect(saved.matchingStatus).toBe('partial');
  });

  test('TRACE-MATCH-17: endpoint conserva HU10 y añade trace', async () => {
    const h = harness();
    const app = express();
    app.use('/matches', createMatchingRouter(h.service, (_req, _res, next) => next()));
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address.');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/matches/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const body = await response.json() as { status: string; matches: unknown[]; demands: unknown[]; summary: unknown; warnings: unknown[]; trace: { executionId: string; persistence: string } };
      expect(response.status).toBe(200);
      expect(body.status).toBe('matched');
      expect(body.matches).toHaveLength(1);
      expect(body.demands).toHaveLength(1);
      expect(body.summary).toBeDefined();
      expect(body.warnings).toEqual([]);
      expect(body.trace.persistence).toBe('persisted');
      expect(body.trace.executionId).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});

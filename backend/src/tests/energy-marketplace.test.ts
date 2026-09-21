import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import express from 'express';
import { createOfferRouter } from '@/controllers/offer.controller';
import { createDemandRouter } from '@/controllers/demand.controller';
import { AuthError, type AuthUser } from '@/services/auth.service';
import { createDemandService, type DemandRepository } from '@/services/demand.service';
import { createOfferService, type OfferRepository } from '@/services/offer.service';
import { requireAuth } from '@/middlewares/auth.middleware';

const userA: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.test', name: 'A', createdAt: new Date('2026-09-17T00:00:00Z') };
const userB: AuthUser = { id: '22222222-2222-4222-8222-222222222222', email: 'b@example.test', name: 'B', createdAt: new Date('2026-09-17T00:00:00Z') };
const createdAt = new Date('2026-09-17T01:00:00Z');
const updatedAt = createdAt;
const auth = { me: async (token?: string) => {
  if (token === 'a') return userA;
  if (token === 'b') return userB;
  throw new AuthError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión.');
} };
const offerRows = new Map<string, any[]>();
const demandRows = new Map<string, any[]>();
const offerLocks = new Set<string>();
const demandLocks = new Set<string>();
const offerRepo: OfferRepository = {
  async create(data) {
    const row = { id: crypto.randomUUID(), ...data, status: 'ACTIVE', createdAt, updatedAt };
    offerRows.set(data.userId, [...(offerRows.get(data.userId) ?? []), row]); return row;
  },
  async findMine(userId) { return offerRows.get(userId) ?? []; },
  async findOwn(userId, id) { return (offerRows.get(userId) ?? []).find(row => row.id === id) ?? null; },
  async hasBlockingTransaction(id) { return offerLocks.has(id); },
  async update(id, data) { const row = [...offerRows.values()].flat().find(value => value.id === id); if (!row) throw new Error('Not found'); Object.assign(row, data, { updatedAt: new Date('2026-09-17T02:00:00Z') }); return row; },
  async cancel(id) { const row = [...offerRows.values()].flat().find(value => value.id === id); if (!row) throw new Error('Not found'); Object.assign(row, { status: 'CANCELLED', updatedAt: new Date('2026-09-17T02:00:00Z') }); return row; },
};
const demandRepo: DemandRepository = {
  async create(data) {
    const row = { id: crypto.randomUUID(), ...data, status: 'ACTIVE', createdAt, updatedAt };
    demandRows.set(data.userId, [...(demandRows.get(data.userId) ?? []), row]); return row;
  },
  async findMine(userId) { return demandRows.get(userId) ?? []; },
  async findOwn(userId, id) { return (demandRows.get(userId) ?? []).find(row => row.id === id) ?? null; },
  async hasBlockingTransaction(id) { return demandLocks.has(id); },
  async update(id, data) { const row = [...demandRows.values()].flat().find(value => value.id === id); if (!row) throw new Error('Not found'); Object.assign(row, data, { updatedAt: new Date('2026-09-17T02:00:00Z') }); return row; },
  async cancel(id) { const row = [...demandRows.values()].flat().find(value => value.id === id); if (!row) throw new Error('Not found'); Object.assign(row, { status: 'CANCELLED', updatedAt: new Date('2026-09-17T02:00:00Z') }); return row; },
};
const app = express();
app.use('/offers', createOfferRouter(createOfferService(offerRepo), requireAuth(auth)));
app.use('/demands', createDemandRouter(createDemandService(demandRepo), requireAuth(auth)));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test server');
const base = `http://127.0.0.1:${address.port}`;
async function request(path: string, body?: unknown, token?: string, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Cookie: `enertrade_session=${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
beforeEach(() => { offerRows.clear(); demandRows.clear(); offerLocks.clear(); demandLocks.clear(); });
afterAll(() => server.close());

describe('EnergyOffer', () => {
  test('POST válido autenticado -> 201 y DTO numérico sin userId', async () => {
    const result = await request('/offers', { quantityKwh: 9851831.89, pricePerKwh: 412.5, deliveryDate: '2026-09-18' }, 'a');
    expect(result.status).toBe(201); expect(result.body.offer).toMatchObject({ quantityKwh: 9851831.89, pricePerKwh: 412.5, deliveryDate: '2026-09-18', status: 'ACTIVE' }); expect(result.body.offer).not.toHaveProperty('userId');
  });
  test('sin auth -> 401', async () => { expect((await request('/offers', { quantityKwh: 1, pricePerKwh: 1, deliveryDate: '2026-09-18' })).status).toBe(401); });
  test.each([{ quantityKwh: 0 }, { quantityKwh: -1 }])('quantity inválida -> 400', async values => { expect((await request('/offers', { quantityKwh: values.quantityKwh, pricePerKwh: 1, deliveryDate: '2026-09-18' }, 'a')).status).toBe(400); });
  test('price <= 0 -> 400', async () => { expect((await request('/offers', { quantityKwh: 1, pricePerKwh: 0, deliveryDate: '2026-09-18' }, 'a')).status).toBe(400); });
  test('fecha inválida -> 400', async () => { expect((await request('/offers', { quantityKwh: 1, pricePerKwh: 1, deliveryDate: '2026-02-30' }, 'a')).status).toBe(400); });
  test('userId extra -> 400', async () => { expect((await request('/offers', { quantityKwh: 1, pricePerKwh: 1, deliveryDate: '2026-09-18', userId: userB.id }, 'a')).status).toBe(400); });
  test('GET /mine solo devuelve registros propios', async () => { await request('/offers', { quantityKwh: 1, pricePerKwh: 2, deliveryDate: '2026-09-18' }, 'a'); await request('/offers', { quantityKwh: 3, pricePerKwh: 4, deliveryDate: '2026-09-18' }, 'b'); const result = await request('/offers/mine', undefined, 'a'); expect(result.status).toBe(200); expect(result.body.offers).toHaveLength(1); expect(result.body.offers[0].quantityKwh).toBe(1); });
  test('PATCH propia ACTIVE actualiza todos los campos', async () => { const created = await request('/offers', { quantityKwh: 1, pricePerKwh: 2, deliveryDate: '2026-09-18' }, 'a'); const result = await request(`/offers/${created.body.offer.id}`, { quantityKwh: 21_000, pricePerKwh: 900, deliveryDate: '2026-09-25' }, 'a', 'PATCH'); expect(result.status).toBe(200); expect(result.body.offer).toMatchObject({ quantityKwh: 21_000, pricePerKwh: 900, deliveryDate: '2026-09-25' }); });
  test('PATCH y cancelación se bloquean con reserva pendiente o confirmada', async () => { const created = await request('/offers', { quantityKwh: 1, pricePerKwh: 2, deliveryDate: '2026-09-18' }, 'a'); offerLocks.add(created.body.offer.id); expect((await request(`/offers/${created.body.offer.id}`, { quantityKwh: 2, pricePerKwh: 3, deliveryDate: '2026-09-19' }, 'a', 'PATCH')).status).toBe(409); expect((await request(`/offers/${created.body.offer.id}/cancel`, {}, 'a')).status).toBe(409); });
  test('cancelación propia ACTIVE es lógica y no permite repetirla', async () => { const created = await request('/offers', { quantityKwh: 1, pricePerKwh: 2, deliveryDate: '2026-09-18' }, 'a'); expect((await request(`/offers/${created.body.offer.id}/cancel`, {}, 'a')).body.offer.status).toBe('CANCELLED'); expect((await request(`/offers/${created.body.offer.id}/cancel`, {}, 'a')).status).toBe(409); });
});

describe('EnergyDemand', () => {
  test('POST válido autenticado -> 201 y DTO numérico sin userId', async () => { const result = await request('/demands', { quantityKwh: 252444558.83, maxPricePerKwh: 960.71104, deliveryDate: '2026-09-18' }, 'a'); expect(result.status).toBe(201); expect(result.body.demand).toMatchObject({ quantityKwh: 252444558.83, maxPricePerKwh: 960.71104, deliveryDate: '2026-09-18', status: 'ACTIVE' }); expect(result.body.demand).not.toHaveProperty('userId'); });
  test('sin auth -> 401', async () => { expect((await request('/demands', { quantityKwh: 1, maxPricePerKwh: 1, deliveryDate: '2026-09-18' })).status).toBe(401); });
  test('quantity inválida -> 400', async () => { expect((await request('/demands', { quantityKwh: 0, maxPricePerKwh: 1, deliveryDate: '2026-09-18' }, 'a')).status).toBe(400); });
  test('maxPricePerKwh <= 0 -> 400', async () => { expect((await request('/demands', { quantityKwh: 1, maxPricePerKwh: -1, deliveryDate: '2026-09-18' }, 'a')).status).toBe(400); });
  test('fecha inválida -> 400', async () => { expect((await request('/demands', { quantityKwh: 1, maxPricePerKwh: 1, deliveryDate: '2026-02-30' }, 'a')).status).toBe(400); });
  test('userId extra -> 400', async () => { expect((await request('/demands', { quantityKwh: 1, maxPricePerKwh: 1, deliveryDate: '2026-09-18', userId: userB.id }, 'a')).status).toBe(400); });
  test('GET /mine aislado por usuario', async () => { await request('/demands', { quantityKwh: 1, maxPricePerKwh: 2, deliveryDate: '2026-09-18' }, 'a'); await request('/demands', { quantityKwh: 3, maxPricePerKwh: 4, deliveryDate: '2026-09-18' }, 'b'); const result = await request('/demands/mine', undefined, 'b'); expect(result.status).toBe(200); expect(result.body.demands).toHaveLength(1); expect(result.body.demands[0].quantityKwh).toBe(3); });
  test('PATCH ajeno y cancelación con reserva se rechazan', async () => { const created = await request('/demands', { quantityKwh: 1, maxPricePerKwh: 2, deliveryDate: '2026-09-18' }, 'a'); expect((await request(`/demands/${created.body.demand.id}`, { quantityKwh: 2, maxPricePerKwh: 3, deliveryDate: '2026-09-19' }, 'b', 'PATCH')).status).toBe(404); demandLocks.add(created.body.demand.id); expect((await request(`/demands/${created.body.demand.id}/cancel`, {}, 'a')).status).toBe(409); });
});

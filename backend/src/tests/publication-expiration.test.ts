import { describe, expect, test } from 'bun:test';
import { createDemandService, type DemandRepository } from '@/services/demand.service';
import { createOfferService, type OfferRepository } from '@/services/offer.service';
import { businessDateInColombia, expireActivePublications, isPublicationExpired } from '@/services/publication-expiration.service';

const now = () => new Date('2026-09-21T12:00:00.000Z');
const record = { id: 'publication-1', userId: 'user-1', quantityKwh: 1, pricePerKwh: 1, maxPricePerKwh: 1, deliveryDate: new Date('2026-10-01T00:00:00.000Z'), status: 'ACTIVE', createdAt: now(), updatedAt: now() };

describe('C21a.2 expiración de publicaciones', () => {
  test('EXP-01: Colombia conserva el día local y solo vence fechas estrictamente anteriores', () => {
    expect(businessDateInColombia(new Date('2026-09-21T04:30:00.000Z'))).toBe('2026-09-20');
    expect(isPublicationExpired('2026-09-20', '2026-09-21')).toBe(true);
    expect(isPublicationExpired('2026-09-21', '2026-09-21')).toBe(false);
    expect(isPublicationExpired('2026-10-01', '2026-09-21')).toBe(false);
  });

  test('EXP-02: la operación central solo actualiza ACTIVE con fecha previa', async () => {
    const updates: unknown[] = [];
    await expireActivePublications({ energyOffer: { updateMany: async args => { updates.push(args); return {}; } }, energyDemand: { updateMany: async args => { updates.push(args); return {}; } } }, now());
    expect(updates).toEqual([
      { where: { status: 'ACTIVE', deliveryDate: { lt: new Date('2026-09-21T00:00:00.000Z') } }, data: { status: 'EXPIRED' } },
      { where: { status: 'ACTIVE', deliveryDate: { lt: new Date('2026-09-21T00:00:00.000Z') } }, data: { status: 'EXPIRED' } },
    ]);
  });

  test('EXP-03: crear o editar hacia una fecha pasada se rechaza, hoy y futuro se conservan ACTIVE', async () => {
    const offers: OfferRepository = { create: async data => ({ ...record, ...data, pricePerKwh: data.pricePerKwh }), findMine: async () => [record], findOwn: async () => record, hasBlockingTransaction: async () => false, update: async (_id, data) => ({ ...record, ...data, pricePerKwh: data.pricePerKwh }), cancel: async () => record };
    const demands: DemandRepository = { create: async data => ({ ...record, ...data, maxPricePerKwh: data.maxPricePerKwh }), findMine: async () => [record], findOwn: async () => record, hasBlockingTransaction: async () => false, update: async (_id, data) => ({ ...record, ...data, maxPricePerKwh: data.maxPricePerKwh }), cancel: async () => record };
    const offerService = createOfferService(offers, now);
    const demandService = createDemandService(demands, now);
    await expect(offerService.create('user-1', { quantityKwh: 1, pricePerKwh: 1, deliveryDate: '2026-09-20' })).rejects.toMatchObject({ code: 'DELIVERY_DATE_PAST' });
    await expect(demandService.update('user-1', 'publication-1', { quantityKwh: 1, maxPricePerKwh: 1, deliveryDate: '2026-09-20' })).rejects.toMatchObject({ code: 'DELIVERY_DATE_PAST' });
    expect((await offerService.create('user-1', { quantityKwh: 1, pricePerKwh: 1, deliveryDate: '2026-09-21' })).status).toBe('ACTIVE');
    expect((await demandService.create('user-1', { quantityKwh: 1, maxPricePerKwh: 1, deliveryDate: '2026-10-01' })).status).toBe('ACTIVE');
  });

  test('EXP-04: una publicación vencida se conserva en el historial propio sin acciones mutables', async () => {
    const expired = { ...record, deliveryDate: new Date('2026-09-20T00:00:00.000Z') };
    const offers: OfferRepository = { create: async data => ({ ...record, ...data }), findMine: async () => [expired], findOwn: async () => expired, hasBlockingTransaction: async () => false, update: async () => expired, cancel: async () => expired, expire: async () => { expired.status = 'EXPIRED'; } };
    const service = createOfferService(offers, now);
    expect(await service.findMine('user-1')).toMatchObject([{ status: 'EXPIRED', deliveryDate: '2026-09-20' }]);
    await expect(service.update('user-1', 'publication-1', { quantityKwh: 1, pricePerKwh: 1, deliveryDate: '2026-10-01' })).rejects.toMatchObject({ code: 'PUBLICATION_NOT_EDITABLE' });
    await expect(service.cancel('user-1', 'publication-1')).rejects.toMatchObject({ code: 'PUBLICATION_NOT_CANCELLABLE' });
  });
});
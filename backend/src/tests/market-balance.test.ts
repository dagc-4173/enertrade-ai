import { expect, test } from 'bun:test';
import { createMarketService } from '@/services/market.service';

const date = new Date('2026-09-23T00:00:00.000Z');
const transactions = [
  { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '10000', status: 'CONFIRMED' },
  { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '5000', status: 'PENDING_ACCEPTANCE' },
  { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '4000', status: 'CANCELLED' },
  { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '3000', status: 'REJECTED' },
  { offerId: 'offer-2', demandId: 'demand-2', quantityKwh: '30000', status: 'PENDING_ACCEPTANCE' },
];

const database = {
  energyOffer: {
    findMany: async () => [
      { id: 'offer-1', userId: 'seller', quantityKwh: '30000', pricePerKwh: '950', deliveryDate: date, status: 'ACTIVE', createdAt: date },
      { id: 'offer-2', userId: 'other', quantityKwh: '30000', pricePerKwh: '950', deliveryDate: date, status: 'ACTIVE', createdAt: date },
    ],
  },
  energyDemand: {
    findMany: async () => [
      { id: 'demand-1', userId: 'buyer', quantityKwh: '30000', maxPricePerKwh: '1000', deliveryDate: date, status: 'ACTIVE', createdAt: date },
      { id: 'demand-2', userId: 'other', quantityKwh: '30000', maxPricePerKwh: '1000', deliveryDate: date, status: 'ACTIVE', createdAt: date },
    ],
  },
  energyTransaction: {
    aggregate: async ({ where }: { where: { offerId?: string; demandId?: string; status: { in: string[] } } }) => {
      const field = where.offerId ? 'offerId' : 'demandId';
      const id = where[field]!;
      const total = transactions.filter(item => item[field] === id && where.status.in.includes(item.status)).reduce((sum, item) => sum + BigInt(item.quantityKwh), 0n);
      return { _sum: { quantityKwh: total.toString() } };
    },
  },
};

test('mercado expone saldo derivado y omite publicaciones ACTIVE sin saldo disponible', async () => {
  const market = createMarketService(database as any);
  await expect(market.offers('viewer')).resolves.toEqual([{ id: 'offer-1', availableQuantityKwh: '15000', pricePerKwh: '950', deliveryDate: '2026-09-23', status: 'ACTIVE' }]);
  await expect(market.demands('viewer')).resolves.toEqual([{ id: 'demand-1', availableQuantityKwh: '15000', maxPricePerKwh: '1000', deliveryDate: '2026-09-23', status: 'ACTIVE' }]);
});

test('refrescar mercado vence publicaciones previas y no las expone', async () => {
  const offerRows = [{ id: 'expired-offer', userId: 'seller', quantityKwh: '1', pricePerKwh: '950', deliveryDate: new Date('2026-09-20T00:00:00.000Z'), status: 'ACTIVE', createdAt: date }];
  const demandRows = [{ id: 'expired-demand', userId: 'buyer', quantityKwh: '1', maxPricePerKwh: '1000', deliveryDate: new Date('2026-09-20T00:00:00.000Z'), status: 'ACTIVE', createdAt: date }];
  const expiringDatabase = {
    energyOffer: {
      updateMany: async () => { offerRows[0]!.status = 'EXPIRED'; return {}; },
      findMany: async () => offerRows.filter(row => row.status === 'ACTIVE'),
    },
    energyDemand: {
      updateMany: async () => { demandRows[0]!.status = 'EXPIRED'; return {}; },
      findMany: async () => demandRows.filter(row => row.status === 'ACTIVE'),
    },
    energyTransaction: { aggregate: async () => ({ _sum: { quantityKwh: '0' } }) },
  };
  const market = createMarketService(expiringDatabase as any, () => new Date('2026-09-21T12:00:00.000Z'));
  await expect(market.offers('viewer')).resolves.toEqual([]);
  await expect(market.demands('viewer')).resolves.toEqual([]);
  expect(offerRows[0]!.status).toBe('EXPIRED');
  expect(demandRows[0]!.status).toBe('EXPIRED');
});
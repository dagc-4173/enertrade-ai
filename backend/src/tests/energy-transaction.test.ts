import { describe, expect, test } from 'bun:test';
import { EnergyMarketStatus, EnergyTransactionStatus } from '@/generated/prisma/client';
import { createEnergyTransactionService, type EnergyTransactionRepository, type TransactionRecord } from '@/services/energy-transaction.service';

const seller = '11111111-1111-4111-8111-111111111111';
const buyer = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const matchingExecutionId = '44444444-4444-4444-8444-444444444444';
const deliveryDate = new Date('2026-09-23T00:00:00.000Z');

function market(id: string, userId: string, quantityKwh: string, priceKey: 'pricePerKwh' | 'maxPricePerKwh', price: string, date = deliveryDate) {
  return { id, userId, quantityKwh, [priceKey]: price, deliveryDate: date, status: EnergyMarketStatus.ACTIVE };
}

function createRepository(overrides: { offer?: any; demand?: any } = {}) {
  const offers = new Map([[overrides.offer?.id ?? 'offer-1', overrides.offer ?? market('offer-1', seller, '10000', 'pricePerKwh', '950')]]);
  const demands = new Map([[overrides.demand?.id ?? 'demand-1', overrides.demand ?? market('demand-1', buyer, '10000', 'maxPricePerKwh', '1000')]]);
  const transactions = new Map<string, TransactionRecord>();
  let sequence = 0;
  let queue = Promise.resolve();
  const lock = async <T>(action: () => Promise<T>) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await action(); } finally { release(); }
  };
  const sum = (field: 'offerId' | 'demandId', id: string, statuses: EnergyTransactionStatus[]) => Array.from(transactions.values()).filter(value => value[field] === id && statuses.includes(value.status)).reduce((total, value) => total + BigInt(String(value.quantityKwh)), 0n).toString();
  const repository: EnergyTransactionRepository = {
    withLockedPublications: (offerId, demandId, action) => lock(() => action({
      offer: async () => offers.get(offerId) ?? null,
      demand: async () => demands.get(demandId) ?? null,
      reservedOfferQuantity: async () => sum('offerId', offerId, [EnergyTransactionStatus.PENDING_ACCEPTANCE, EnergyTransactionStatus.CONFIRMED]),
      reservedDemandQuantity: async () => sum('demandId', demandId, [EnergyTransactionStatus.PENDING_ACCEPTANCE, EnergyTransactionStatus.CONFIRMED]),
      activeDuplicate: async quantityKwh => Array.from(transactions.values()).find(value => value.offerId === offerId && value.demandId === demandId && String(value.quantityKwh) === quantityKwh && value.status === EnergyTransactionStatus.PENDING_ACCEPTANCE) ?? null,
      create: async data => {
        const now = new Date(`2026-09-21T09:30:${String(sequence).padStart(2, '0')}.000Z`);
        const value: TransactionRecord = { id: `transaction-${++sequence}`, ...data, sellerAcceptedAt: null, buyerAcceptedAt: null, createdAt: now, updatedAt: now, confirmedAt: null, cancelledAt: null };
        transactions.set(value.id, value);
        return value;
      },
    })),
    withLockedTransaction: (id, action) => lock(() => action({
      transaction: async () => transactions.get(id) ?? null,
      update: async data => {
        const value = transactions.get(id)!;
        Object.assign(value, data, { updatedAt: new Date() });
        return value;
      },
      reservedOfferQuantity: async () => { const value = transactions.get(id); return value ? sum('offerId', value.offerId, [EnergyTransactionStatus.PENDING_ACCEPTANCE, EnergyTransactionStatus.CONFIRMED]) : '0'; },
      reservedDemandQuantity: async () => { const value = transactions.get(id); return value ? sum('demandId', value.demandId, [EnergyTransactionStatus.PENDING_ACCEPTANCE, EnergyTransactionStatus.CONFIRMED]) : '0'; },
      confirmedOfferQuantity: async () => { const value = transactions.get(id); return value ? sum('offerId', value.offerId, [EnergyTransactionStatus.CONFIRMED]) : '0'; },
      confirmedDemandQuantity: async () => { const value = transactions.get(id); return value ? sum('demandId', value.demandId, [EnergyTransactionStatus.CONFIRMED]) : '0'; },
      offer: async () => { const value = transactions.get(id); return value ? offers.get(value.offerId) ?? null : null; },
      demand: async () => { const value = transactions.get(id); return value ? demands.get(value.demandId) ?? null : null; },
      setOfferStatus: async status => { const value = transactions.get(id); if (value) offers.get(value.offerId)!.status = status; },
      setDemandStatus: async status => { const value = transactions.get(id); if (value) demands.get(value.demandId)!.status = status; },
    })),
    findMine: async (userId, status) => Array.from(transactions.values()).filter(value => (value.sellerUserId === userId || value.buyerUserId === userId) && (!status || value.status === status)),
    findForParticipant: async (id, userId) => { const value = transactions.get(id); return value && (value.sellerUserId === userId || value.buyerUserId === userId) ? value : null; },
  };
  return { repository, offers, demands, transactions };
}

function fixture(overrides?: { offer?: any; demand?: any }) {
  const memory = createRepository(overrides);
  return { ...memory, service: createEnergyTransactionService(memory.repository, () => new Date('2026-09-21T10:00:00.000Z')) };
}

describe('C20a simulated energy transactions', () => {
  test('TX-01: crea propuesta cross-user con precio de oferta, total exacto y DTO privado', async () => {
    const { service } = fixture();
    const result = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000, matchingExecutionId });
    expect(result).toMatchObject({ quantityKwh: '10000', pricePerKwh: '950', totalAmountCop: '9500000', status: 'PENDING_ACCEPTANCE', matchingExecutionId, proposalOwnership: 'CREATED_BY_ME' });
    expect(result).not.toHaveProperty('sellerUserId');
    expect(result).not.toHaveProperty('buyerUserId');
  });

  test.each([
    ['misma persona', () => fixture({ demand: market('demand-1', seller, '10000', 'maxPricePerKwh', '1000') }), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 }, 'SAME_TRANSACTION_PARTICIPANT'],
    ['oferta inexistente', () => fixture(), seller, { offerId: 'missing', demandId: 'demand-1', quantityKwh: 1 }, 'OFFER_NOT_FOUND'],
    ['demanda inexistente', () => fixture(), seller, { offerId: 'offer-1', demandId: 'missing', quantityKwh: 1 }, 'DEMAND_NOT_FOUND'],
    ['fecha distinta', () => fixture({ demand: market('demand-1', buyer, '10000', 'maxPricePerKwh', '1000', new Date('2026-09-24T00:00:00.000Z')) }), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 }, 'DELIVERY_DATE_MISMATCH'],
    ['precio incompatible', () => fixture({ demand: market('demand-1', buyer, '10000', 'maxPricePerKwh', '900') }), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 }, 'PRICE_NOT_COMPATIBLE'],
    ['cantidad cero', () => fixture(), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 0 }, 'INVALID_TRANSACTION_QUANTITY'],
    ['cantidad negativa', () => fixture(), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: -1 }, 'INVALID_TRANSACTION_QUANTITY'],
    ['cantidad supera oferta', () => fixture({ offer: market('offer-1', seller, '5', 'pricePerKwh', '950') }), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 6 }, 'OFFER_QUANTITY_UNAVAILABLE'],
    ['cantidad supera demanda', () => fixture({ demand: market('demand-1', buyer, '5', 'maxPricePerKwh', '1000') }), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 6 }, 'DEMAND_QUANTITY_UNAVAILABLE'],
    ['usuario ajeno', () => fixture(), outsider, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 }, 'TRANSACTION_PARTICIPANT_REQUIRED'],
  ])('TX-02: rechaza %s', async (_name, build: any, actor, input, code) => {
    await expect(build().service.create(actor, input)).rejects.toMatchObject({ code });
  });

  test('TX-03: aceptaciones de comprador y vendedor confirman automáticamente; repetición es idempotente antes de confirmar', async () => {
    const { service, offers, demands } = fixture();
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 });
    const first = await service.accept(buyer, created.id);
    const repeated = await service.accept(buyer, created.id);
    const confirmed = await service.accept(seller, created.id);
    expect(first.status).toBe('PENDING_ACCEPTANCE');
    expect(repeated.buyerAcceptedAt).toBe(first.buyerAcceptedAt);
    expect(confirmed).toMatchObject({ status: 'CONFIRMED', quantityKwh: '10000' });
    expect(offers.get('offer-1')!.status).toBe(EnergyMarketStatus.FULFILLED);
    expect(demands.get('demand-1')!.status).toBe(EnergyMarketStatus.FULFILLED);
    await expect(service.accept(outsider, created.id)).rejects.toMatchObject({ code: 'TRANSACTION_NOT_PENDING' });
  });

  test('TX-04: tercero no puede aceptar y REJECTED/CANCELLED liberan reserva', async () => {
    const { service } = fixture();
    const rejected = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 });
    await expect(service.accept(outsider, rejected.id)).rejects.toMatchObject({ code: 'TRANSACTION_PARTICIPANT_REQUIRED' });
    expect((await service.reject(buyer, rejected.id)).status).toBe('REJECTED');
    const cancelled = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 });
    expect((await service.cancel(seller, cancelled.id)).status).toBe('CANCELLED');
    expect((await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 })).status).toBe('PENDING_ACCEPTANCE');
  });

  test('TX-05: no permite reject ni cancel después de CONFIRMED', async () => {
    const { service } = fixture();
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 });
    await service.accept(seller, created.id);
    await service.accept(buyer, created.id);
    await expect(service.reject(seller, created.id)).rejects.toMatchObject({ code: 'TRANSACTION_NOT_PENDING' });
    await expect(service.cancel(buyer, created.id)).rejects.toMatchObject({ code: 'TRANSACTION_NOT_PENDING' });
  });

  test('TX-06: propuesta parcial confirmada deja cinco kWh disponibles en la oferta', async () => {
    const { service, offers, demands } = fixture({ offer: market('offer-1', seller, '15', 'pricePerKwh', '950'), demand: market('demand-1', buyer, '10', 'maxPricePerKwh', '1000') });
    const first = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10 });
    await service.accept(seller, first.id); await service.accept(buyer, first.id);
    demands.set('demand-2', market('demand-2', outsider, '5', 'maxPricePerKwh', '1000'));
    expect((await service.create(seller, { offerId: 'offer-1', demandId: 'demand-2', quantityKwh: 5 })).quantityKwh).toBe('5');
    expect(offers.get('offer-1')!.status).toBe(EnergyMarketStatus.ACTIVE);
    expect(demands.get('demand-1')!.status).toBe(EnergyMarketStatus.FULFILLED);
  });

  test('TX-07: dos propuestas concurrentes de 8000 sobre saldo 10000 no duplican reserva', async () => {
    const { service } = fixture();
    const outcomes = await Promise.allSettled([
      service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 8000 }),
      service.create(buyer, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 8000 }),
    ]);
    expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(value => value.status === 'rejected')).toHaveLength(1);
  });

  test('TX-08: mine y detalle sólo muestran transacciones de participantes', async () => {
    const { service } = fixture();
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    expect(await service.findMine(buyer, 'PENDING_ACCEPTANCE')).toHaveLength(1);
    expect((await service.findOne(buyer, created.id)).id).toBe(created.id);
    await expect(service.findOne(outsider, created.id)).rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });
  });
});

describe('C20f gestión de propuestas transaccionales', () => {
  test('TXF-01: creador edita propuesta pendiente y recalcula total sin exponer su ID', async () => {
    const { service } = fixture({ offer: market('offer-1', seller, '15000', 'pricePerKwh', '900'), demand: market('demand-1', buyer, '15000', 'maxPricePerKwh', '1000') });
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 });
    const edited = await service.edit(seller, created.id, { quantityKwh: 12000 });
    expect(edited).toMatchObject({ quantityKwh: '12000', pricePerKwh: '900', totalAmountCop: '10800000', status: 'PENDING_ACCEPTANCE' });
    expect(edited).not.toHaveProperty('proposedByUserId');
    expect((await service.findOne(seller, created.id)).proposalOwnership).toBe('CREATED_BY_ME');
    expect((await service.findOne(buyer, created.id)).proposalOwnership).toBe('RECEIVED');
    await expect(service.edit(seller, created.id, { quantityKwh: 16000 })).rejects.toMatchObject({ code: 'OFFER_QUANTITY_UNAVAILABLE' });
  });

  test('TXF-02: receptor y tercero no pueden editar; payload sólo acepta cantidad válida', async () => {
    const { service } = fixture();
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    await expect(service.edit(buyer, created.id, { quantityKwh: 2 })).rejects.toMatchObject({ code: 'TRANSACTION_PROPOSER_REQUIRED' });
    await expect(service.edit(outsider, created.id, { quantityKwh: 2 })).rejects.toMatchObject({ code: 'TRANSACTION_PROPOSER_REQUIRED' });
    await expect(service.edit(seller, created.id, { quantityKwh: 1, status: 'CONFIRMED' })).rejects.toMatchObject({ code: 'INVALID_TRANSACTION_REQUEST' });
    await expect(service.edit(seller, created.id, { quantityKwh: 1.001 })).rejects.toMatchObject({ code: 'INVALID_TRANSACTION_QUANTITY' });
  });

  test('TXF-03: otras reservas cuentan, pero la propuesta editada no se duplica', async () => {
    const { service } = fixture({ offer: market('offer-1', seller, '20000', 'pricePerKwh', '900'), demand: market('demand-1', buyer, '20000', 'maxPricePerKwh', '1000') });
    const proposalA = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 8000 });
    await service.create(buyer, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 7000 });
    expect((await service.edit(seller, proposalA.id, { quantityKwh: 13000 })).quantityKwh).toBe('13000');
    await expect(service.edit(seller, proposalA.id, { quantityKwh: 14000 })).rejects.toMatchObject({ code: 'OFFER_QUANTITY_UNAVAILABLE' });
  });

  test('TXF-04: reducir cantidad libera reserva para una propuesta nueva', async () => {
    const { service, demands } = fixture({ offer: market('offer-1', seller, '15000', 'pricePerKwh', '900'), demand: market('demand-1', buyer, '15000', 'maxPricePerKwh', '1000') });
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 15000 });
    await service.edit(seller, created.id, { quantityKwh: 10000 });
    demands.set('demand-2', market('demand-2', outsider, '5000', 'maxPricePerKwh', '1000'));
    expect((await service.create(seller, { offerId: 'offer-1', demandId: 'demand-2', quantityKwh: 5000 })).status).toBe('PENDING_ACCEPTANCE');
  });

  test('TXF-05: primera aceptación bloquea edición y cancelación, pero receptor aún puede rechazar', async () => {
    const { service } = fixture();
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    await service.accept(seller, created.id);
    await expect(service.edit(seller, created.id, { quantityKwh: 2 })).rejects.toMatchObject({ code: 'TRANSACTION_ALREADY_ACCEPTED' });
    await expect(service.cancel(seller, created.id)).rejects.toMatchObject({ code: 'TRANSACTION_ALREADY_ACCEPTED' });
    expect((await service.reject(buyer, created.id)).status).toBe('REJECTED');
  });

  test('TXF-06: creador cancela, receptor rechaza y roles inversos se rechazan', async () => {
    const { service } = fixture();
    const cancellable = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    await expect(service.cancel(buyer, cancellable.id)).rejects.toMatchObject({ code: 'TRANSACTION_PROPOSER_REQUIRED' });
    await expect(service.reject(seller, cancellable.id)).rejects.toMatchObject({ code: 'TRANSACTION_RECIPIENT_REQUIRED' });
    expect((await service.cancel(seller, cancellable.id)).status).toBe('CANCELLED');
    const rejectable = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    expect((await service.reject(buyer, rejectable.id)).status).toBe('REJECTED');
  });

  test('TXF-07: confirmada y legacy no admiten gestión de creador', async () => {
    const { service, transactions } = fixture();
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    await service.accept(seller, created.id); await service.accept(buyer, created.id);
    await expect(service.edit(seller, created.id, { quantityKwh: 1 })).rejects.toMatchObject({ code: 'TRANSACTION_NOT_PENDING' });
    await expect(service.cancel(seller, created.id)).rejects.toMatchObject({ code: 'TRANSACTION_NOT_PENDING' });
    await expect(service.reject(buyer, created.id)).rejects.toMatchObject({ code: 'TRANSACTION_NOT_PENDING' });
    transactions.set('legacy-1', { id: 'legacy-1', offerId: 'offer-1', demandId: 'demand-1', sellerUserId: seller, buyerUserId: buyer, proposedByUserId: null, quantityKwh: '1', pricePerKwh: '900', totalAmountCop: '900', deliveryDate, status: EnergyTransactionStatus.PENDING_ACCEPTANCE, sellerAcceptedAt: null, buyerAcceptedAt: null, createdAt: deliveryDate, updatedAt: deliveryDate, confirmedAt: null, cancelledAt: null, matchingExecutionId: null });
    expect((await service.findOne(seller, 'legacy-1')).proposalOwnership).toBe('LEGACY_UNKNOWN');
    await expect(service.edit(seller, 'legacy-1', { quantityKwh: 1 })).rejects.toMatchObject({ code: 'TRANSACTION_LEGACY_IMMUTABLE' });
    await expect(service.cancel(seller, 'legacy-1')).rejects.toMatchObject({ code: 'TRANSACTION_LEGACY_IMMUTABLE' });
  });
});
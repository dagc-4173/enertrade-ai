import { describe, expect, test, spyOn } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { EnergyMarketStatus, EnergyTransactionStatus, Prisma } from '@/generated/prisma/client';
import { createEnergyTransactionService, type EnergyTransactionRepository, type LockedStore, type TransactionRecord, type TransactionRevisionRecord } from '@/services/energy-transaction.service';

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
  const revisions = new Map<string, TransactionRevisionRecord[]>();
  let sequence = 0;
  let queue = Promise.resolve();
  const lock = async <T>(action: () => Promise<T>) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await action(); } finally { release(); }
  };
  const sum = (field: 'offerId' | 'demandId', id: string, statuses: EnergyTransactionStatus[], excludeTransactionId?: string) => Array.from(transactions.values()).filter(value => value.id !== excludeTransactionId && value[field] === id && statuses.includes(value.status)).reduce((total, value) => total.plus(String(value.quantityKwh)), new Prisma.Decimal(0)).toString();
  const storeFor = (offerId: string, demandId: string): LockedStore => ({
      verificationApproved: async () => true,
      expire: async today => {
        for (const publication of [...offers.values(), ...demands.values()]) {
          if (publication.status === EnergyMarketStatus.ACTIVE && publication.deliveryDate.toISOString().slice(0, 10) < today) publication.status = EnergyMarketStatus.EXPIRED;
        }
      },
      offer: async () => offers.get(offerId) ?? null,
      demand: async () => demands.get(demandId) ?? null,
      reservedOfferQuantity: async () => sum('offerId', offerId, [EnergyTransactionStatus.PENDING_ACCEPTANCE, EnergyTransactionStatus.CONFIRMED]),
      reservedDemandQuantity: async () => sum('demandId', demandId, [EnergyTransactionStatus.PENDING_ACCEPTANCE, EnergyTransactionStatus.CONFIRMED]),
      activeDuplicate: async quantityKwh => Array.from(transactions.values()).find(value => value.offerId === offerId && value.demandId === demandId && String(value.quantityKwh) === quantityKwh && value.status === EnergyTransactionStatus.PENDING_ACCEPTANCE) ?? null,
      create: async data => {
        const now = new Date(`2026-09-21T09:30:${String(sequence).padStart(2, '0')}.000Z`);
        const value: TransactionRecord = { id: `transaction-${++sequence}`, ...data, createdAt: now, updatedAt: now, confirmedAt: null, cancelledAt: null };
        transactions.set(value.id, value);
        return value;
      },
      createRevision: async data => {
        const value: TransactionRevisionRecord = { id: `revision-${data.transactionId}-${data.sequence}`, ...data, createdAt: new Date(`2026-09-21T09:30:${String(sequence).padStart(2, '0')}.000Z`) };
        revisions.set(data.transactionId, [...(revisions.get(data.transactionId) ?? []), value]);
        return value;
      },
    });
  const repository: EnergyTransactionRepository = {
    withLockedPublications: (offerId, demandId, action) => lock(() => action(storeFor(offerId, demandId))),
    withLockedBatch: (_pairs, action) => lock(async () => {
      const previousOffers = structuredClone(offers);
      const previousDemands = structuredClone(demands);
      const previousTransactions = structuredClone(transactions);
      const previousRevisions = structuredClone(revisions);
      const previousSequence = sequence;
      try { return await action(storeFor); }
      catch (error) {
        offers.clear(); previousOffers.forEach((value, key) => offers.set(key, value));
        demands.clear(); previousDemands.forEach((value, key) => demands.set(key, value));
        transactions.clear(); previousTransactions.forEach((value, key) => transactions.set(key, value));
        revisions.clear(); previousRevisions.forEach((value, key) => revisions.set(key, value));
        sequence = previousSequence;
        throw error;
      }
    }),
    withLockedTransaction: (id, action) => lock(() => action({
      verificationApproved: async () => true,
      transaction: async () => transactions.get(id) ?? null,
      update: async data => {
        const value = transactions.get(id)!;
        Object.assign(value, data, { updatedAt: new Date() });
        return value;
      },
      reservedOfferQuantity: async () => { const value = transactions.get(id); return value ? sum('offerId', value.offerId, [EnergyTransactionStatus.PENDING_ACCEPTANCE, EnergyTransactionStatus.CONFIRMED]) : '0'; },
      reservedDemandQuantity: async () => { const value = transactions.get(id); return value ? sum('demandId', value.demandId, [EnergyTransactionStatus.PENDING_ACCEPTANCE, EnergyTransactionStatus.CONFIRMED]) : '0'; },
      confirmedOfferQuantity: async excludeTransactionId => { const value = transactions.get(id); return value ? sum('offerId', value.offerId, [EnergyTransactionStatus.CONFIRMED], excludeTransactionId) : '0'; },
      confirmedDemandQuantity: async excludeTransactionId => { const value = transactions.get(id); return value ? sum('demandId', value.demandId, [EnergyTransactionStatus.CONFIRMED], excludeTransactionId) : '0'; },
      offer: async () => { const value = transactions.get(id); return value ? offers.get(value.offerId) ?? null : null; },
      demand: async () => { const value = transactions.get(id); return value ? demands.get(value.demandId) ?? null : null; },
      setOfferStatus: async status => { const value = transactions.get(id); if (value) offers.get(value.offerId)!.status = status; },
      setDemandStatus: async status => { const value = transactions.get(id); if (value) demands.get(value.demandId)!.status = status; },
      latestRevision: async () => (revisions.get(id) ?? []).at(-1) ?? null,
      createRevision: async data => {
        const value: TransactionRevisionRecord = { id: `revision-${data.transactionId}-${data.sequence}`, ...data, createdAt: new Date() };
        revisions.set(data.transactionId, [...(revisions.get(data.transactionId) ?? []), value]);
        return value;
      },
    })),
    findMine: async (userId, status) => Array.from(transactions.values()).filter(value => (value.sellerUserId === userId || value.buyerUserId === userId) && (!status || value.status === status)),
    findForParticipant: async (id, userId) => { const value = transactions.get(id); return value && (value.sellerUserId === userId || value.buyerUserId === userId) ? value : null; },
    findRevisions: async transactionId => revisions.get(transactionId) ?? [],
  };
  return { repository, offers, demands, transactions, revisions };
}

function fixture(overrides?: { offer?: any; demand?: any }) {
  const memory = createRepository(overrides);
  const rawService = createEnergyTransactionService(memory.repository, () => new Date('2026-09-21T10:00:00.000Z'));
  const createLegacy = async (userId: string, body: any) => {
    const created = await rawService.create(userId, { ...body, pricePerKwh: body?.pricePerKwh ?? memory.offers.get(body?.offerId)?.pricePerKwh ?? '950' });
    memory.revisions.delete(created.id);
    return created;
  };
  return { ...memory, rawService, service: { ...rawService, create: createLegacy } };
}

describe('Confirmacion: capacidad bajo la misma frontera transaccional', () => {
  function capacityFixture(offerCapacity = '10', demandCapacity = offerCapacity) {
    const memory = createRepository({ offer: market('offer-1', seller, offerCapacity, 'pricePerKwh', '900'), demand: market('demand-1', buyer, demandCapacity, 'maxPricePerKwh', '950') });
    const seed = (id: string, quantity: string, status: EnergyTransactionStatus = 'PENDING_ACCEPTANCE') => {
      const timestamp = new Date('2026-09-21T10:00:00Z');
      const row: TransactionRecord = { id, offerId: 'offer-1', demandId: 'demand-1', sellerUserId: seller, buyerUserId: buyer, proposedByUserId: seller, quantityKwh: new Prisma.Decimal(quantity), pricePerKwh: '900', totalAmountCop: new Prisma.Decimal(quantity).times(900), deliveryDate, status, sellerAcceptedAt: timestamp, buyerAcceptedAt: status === 'CONFIRMED' ? timestamp : null, confirmedAt: status === 'CONFIRMED' ? timestamp : null, cancelledAt: null, createdAt: timestamp, updatedAt: timestamp, matchingExecutionId: null };
      memory.transactions.set(id, row);
      return row;
    };
    return { ...memory, seed, service: createEnergyTransactionService(memory.repository, () => new Date('2026-09-21T10:00:00Z')) };
  }

  test('CAP-A: pendientes importados 7+7 sobre 10 tienen un solo ganador', async () => {
    const memory = capacityFixture(); memory.seed('first', '7'); const second = memory.seed('second', '7');
    const original = { ...second };
    const race = await Promise.allSettled([memory.service.accept(buyer, 'first'), memory.service.accept(buyer, 'second')]);
    expect(race.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    const rejected = race.find(value => value.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, code: 'OFFER_CONFIRMATION_CAPACITY_EXCEEDED' });
    expect(second).toEqual(original);
    expect([...memory.transactions.values()].filter(value => value.status === 'CONFIRMED')).toHaveLength(1);
  });

  test('CAP-B/E: confirmado 3 mas pendiente 7 confirma hasta 10 sin contar su reserva dos veces', async () => {
    const memory = capacityFixture(); memory.seed('confirmed', '3', 'CONFIRMED'); memory.seed('pending', '7');
    expect((await memory.service.accept(buyer, 'pending')).status).toBe('CONFIRMED');
    expect(memory.offers.get('offer-1')!.status).toBe('FULFILLED');
    expect(memory.demands.get('demand-1')!.status).toBe('FULFILLED');
  });

  test.each([{ offer: '10', demand: '20', code: 'OFFER_CONFIRMATION_CAPACITY_EXCEEDED' }, { offer: '20', demand: '10', code: 'DEMAND_CONFIRMATION_CAPACITY_EXCEEDED' }])('CAP-C: 3+7.01 rechaza por la capacidad limitante %j', async boundary => {
    const memory = capacityFixture(boundary.offer, boundary.demand); memory.seed('confirmed', '3', 'CONFIRMED'); const pending = memory.seed('pending', '7.01');
    const original = { ...pending };
    await expect(memory.service.accept(buyer, 'pending')).rejects.toMatchObject({ status: 409, code: boundary.code });
    expect(pending).toEqual(original);
    expect(memory.offers.get('offer-1')!.status).toBe('ACTIVE');
  });

  test('CAP-D: un retry tras P2034 relee el ganador y revalida antes de cualquier write', async () => {
    const memory = capacityFixture(); memory.seed('first', '7'); const second = memory.seed('second', '7');
    let reads = 0, updates = 0;
    const conflicted: EnergyTransactionRepository = { ...memory.repository, withLockedTransaction: (id, action) => memory.repository.withLockedTransaction(id, store => action({ ...store, transaction: async () => { reads += 1; return store.transaction(); }, update: async () => { updates += 1; throw Object.assign(new Error('Serialization conflict'), { code: 'P2034' }); } })) };
    await expect(createEnergyTransactionService(conflicted, () => new Date('2026-09-21T10:00:00Z')).accept(buyer, 'second')).rejects.toMatchObject({ code: 'P2034' });
    expect(second.status).toBe('PENDING_ACCEPTANCE');
    await memory.service.accept(buyer, 'first');
    const reread: EnergyTransactionRepository = { ...memory.repository, withLockedTransaction: (id, action) => memory.repository.withLockedTransaction(id, store => action({ ...store, transaction: async () => { reads += 1; return store.transaction(); } })) };
    await expect(createEnergyTransactionService(reread, () => new Date('2026-09-21T10:00:00Z')).accept(buyer, 'second')).rejects.toMatchObject({ code: 'OFFER_CONFIRMATION_CAPACITY_EXCEEDED' });
    expect(reads).toBe(2); expect(updates).toBe(1); expect(second.buyerAcceptedAt).toBeNull(); expect(second.confirmedAt).toBeNull();
  });

  test.each(['0.01', '0.02'])('CAP-F: limite Decimal(20,2) conserva centesima %s', async quantity => {
    const memory = capacityFixture('999999999999999999.99'); memory.seed('confirmed', '999999999999999999.98', 'CONFIRMED'); memory.seed('pending', quantity);
    if (quantity === '0.01') expect((await memory.service.accept(buyer, 'pending')).status).toBe('CONFIRMED');
    else await expect(memory.service.accept(buyer, 'pending')).rejects.toMatchObject({ code: 'OFFER_CONFIRMATION_CAPACITY_EXCEEDED' });
  });
});

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
    ['cantidad cero', () => fixture(), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 0 }, 'INVALID_TRANSACTION_QUANTITY'],
    ['cantidad negativa', () => fixture(), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: -1 }, 'INVALID_TRANSACTION_QUANTITY'],
    ['cantidad supera oferta', () => fixture({ offer: market('offer-1', seller, '5', 'pricePerKwh', '950') }), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 6 }, 'OFFER_QUANTITY_UNAVAILABLE'],
    ['cantidad supera demanda', () => fixture({ demand: market('demand-1', buyer, '5', 'maxPricePerKwh', '1000') }), seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 6 }, 'DEMAND_QUANTITY_UNAVAILABLE'],
    ['usuario ajeno', () => fixture(), outsider, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 }, 'TRANSACTION_PARTICIPANT_REQUIRED'],
  ])('TX-02: rechaza %s', async (_name, build: any, actor, input, code) => {
    await expect(build().service.create(actor, input)).rejects.toMatchObject({ code });
  });

  test('TX-03: la aceptación de la contraparte confirma una propuesta autoaceptada por su creador', async () => {
    const { service, offers, demands } = fixture();
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 });
    const confirmed = await service.accept(buyer, created.id);
    expect(created.sellerAcceptedAt).not.toBeNull();
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

  test('TXF-05: editar pendiente invalida aceptaciones y cancelar sigue disponible hasta confirmar', async () => {
    const { service, transactions } = fixture();
    const created = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    await service.accept(seller, created.id);
    const edited = await service.edit(seller, created.id, { quantityKwh: 2 });
    expect(edited).toMatchObject({ quantityKwh: '2', sellerAcceptedAt: null, buyerAcceptedAt: null, status: 'PENDING_ACCEPTANCE', role: 'SELLER', proposalOwnership: 'CREATED_BY_ME' });
    expect(transactions.get(created.id)!.createdAt.toISOString()).toBe(created.createdAt);
    expect(transactions.get(created.id)!.updatedAt.getTime()).toBeGreaterThan(transactions.get(created.id)!.createdAt.getTime());
    const cancellable = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    expect(await service.cancel(seller, cancellable.id)).toMatchObject({ status: 'CANCELLED', role: 'SELLER', proposalOwnership: 'CREATED_BY_ME' });
    const rejectable = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    await service.accept(seller, rejectable.id);
    expect(await service.reject(buyer, rejectable.id)).toMatchObject({ status: 'REJECTED', role: 'BUYER', proposalOwnership: 'RECEIVED' });
  });

  test('TXF-05b: edit, accept, reject y cancel devuelven DTO participante sin IDs internos', async () => {
    const { service } = fixture();
    const expectParticipant = (value: Record<string, unknown>, role: string, ownership: string) => {
      expect(value).toMatchObject({ role, proposalOwnership: ownership });
      expect(value).not.toHaveProperty('sellerUserId');
      expect(value).not.toHaveProperty('buyerUserId');
      expect(value).not.toHaveProperty('proposedByUserId');
    };
    const editable = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    expectParticipant(await service.edit(seller, editable.id, { quantityKwh: 2 }), 'SELLER', 'CREATED_BY_ME');
    expectParticipant(await service.accept(seller, editable.id), 'SELLER', 'CREATED_BY_ME');
    expectParticipant(await service.reject(buyer, editable.id), 'BUYER', 'RECEIVED');
    const cancellable = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 });
    expectParticipant(await service.cancel(seller, cancellable.id), 'SELLER', 'CREATED_BY_ME');
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
    expect(await service.revisions(seller, 'legacy-1')).toEqual([]);
    await expect(service.edit(seller, 'legacy-1', { quantityKwh: 1 })).rejects.toMatchObject({ code: 'TRANSACTION_LEGACY_IMMUTABLE' });
    await expect(service.cancel(seller, 'legacy-1')).rejects.toMatchObject({ code: 'TRANSACTION_LEGACY_IMMUTABLE' });
  });
});

describe('C21a saldos parciales acumulativos', () => {
  test('C21a-01: confirmadas parciales mantienen publicaciones ACTIVE y una reserva pendiente no las cumple', async () => {
    const { service, offers, demands } = fixture({ offer: market('offer-1', seller, '30000', 'pricePerKwh', '950'), demand: market('demand-1', buyer, '30000', 'maxPricePerKwh', '1000') });
    const first = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 });
    await service.accept(seller, first.id); await service.accept(buyer, first.id);
    const second = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 12000 });
    await service.accept(seller, second.id); await service.accept(buyer, second.id);
    expect(offers.get('offer-1')!.status).toBe(EnergyMarketStatus.ACTIVE);
    expect(demands.get('demand-1')!.status).toBe(EnergyMarketStatus.ACTIVE);
    const pending = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 8000 });
    await expect(service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 })).rejects.toMatchObject({ code: 'OFFER_QUANTITY_UNAVAILABLE' });
    expect(offers.get('offer-1')!.status).toBe(EnergyMarketStatus.ACTIVE);
    expect(demands.get('demand-1')!.status).toBe(EnergyMarketStatus.ACTIVE);
    await service.accept(seller, pending.id); await service.accept(buyer, pending.id);
    expect(offers.get('offer-1')!.status).toBe(EnergyMarketStatus.FULFILLED);
    expect(demands.get('demand-1')!.status).toBe(EnergyMarketStatus.FULFILLED);
  });

  test('C21a-02: cancelación y rechazo liberan reserva sin modificar cantidad publicada', async () => {
    const { service, offers, demands } = fixture({ offer: market('offer-1', seller, '30000', 'pricePerKwh', '950'), demand: market('demand-1', buyer, '30000', 'maxPricePerKwh', '1000') });
    const cancellable = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 20000 });
    await service.cancel(seller, cancellable.id);
    expect((await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 30000 })).status).toBe('PENDING_ACCEPTANCE');
    expect(offers.get('offer-1')!.quantityKwh).toBe('30000');
    expect(demands.get('demand-1')!.quantityKwh).toBe('30000');
  });

  test('C21a-03: una demanda acumula proveedores y una oferta acumula demandantes con cantidades desiguales', async () => {
    const { service, offers, demands } = fixture({ offer: market('offer-1', seller, '10000', 'pricePerKwh', '950'), demand: market('demand-1', buyer, '30000', 'maxPricePerKwh', '1000') });
    offers.set('offer-2', market('offer-2', outsider, '12000', 'pricePerKwh', '950'));
    offers.set('offer-3', market('offer-3', '44444444-4444-4444-8444-444444444444', '20000', 'pricePerKwh', '950'));
    const first = await service.create(buyer, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 });
    await service.accept(seller, first.id);
    const second = await service.create(buyer, { offerId: 'offer-2', demandId: 'demand-1', quantityKwh: 12000 });
    await service.accept(outsider, second.id);
    expect((await service.create(buyer, { offerId: 'offer-3', demandId: 'demand-1', quantityKwh: 8000 })).quantityKwh).toBe('8000');
  });

  test('C21a-04: una oferta cubre varias demandas sin exceder su saldo acumulado', async () => {
    const { service, offers, demands } = fixture({ offer: market('offer-1', seller, '30000', 'pricePerKwh', '950'), demand: market('demand-1', buyer, '10000', 'maxPricePerKwh', '1000') });
    demands.set('demand-2', market('demand-2', outsider, '12000', 'maxPricePerKwh', '1000'));
    demands.set('demand-3', market('demand-3', '44444444-4444-4444-8444-444444444444', '8000', 'maxPricePerKwh', '1000'));
    const first = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 10000 });
    await service.accept(seller, first.id); await service.accept(buyer, first.id);
    const second = await service.create(seller, { offerId: 'offer-1', demandId: 'demand-2', quantityKwh: 12000 });
    await service.accept(seller, second.id); await service.accept(outsider, second.id);
    expect((await service.create(seller, { offerId: 'offer-1', demandId: 'demand-3', quantityKwh: 8000 })).quantityKwh).toBe('8000');
    expect(offers.get('offer-1')!.status).toBe(EnergyMarketStatus.ACTIVE);
  });
});

describe('C21a.2 publicaciones vencidas', () => {
  test('C21a.2-01: una publicación ACTIVE con fecha anterior se vence antes de crear propuesta', async () => {
    const { service } = fixture({ offer: market('offer-1', seller, '10000', 'pricePerKwh', '950', new Date('2026-09-20T00:00:00.000Z')) });
    await expect(service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 })).rejects.toMatchObject({ status: 409, code: 'PUBLICATION_EXPIRED' });
  });

  test('C21a.2-02: la fecha de negocio de hoy no vence una publicación', async () => {
    const { service } = fixture({ offer: market('offer-1', seller, '10000', 'pricePerKwh', '950', new Date('2026-09-21T00:00:00.000Z')), demand: market('demand-1', buyer, '10000', 'maxPricePerKwh', '1000', new Date('2026-09-21T00:00:00.000Z')) });
    expect((await service.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 1 })).status).toBe('PENDING_ACCEPTANCE');
  });
});

describe('C21b negociación de precio y cantidad', () => {
  test('C21b-01: exige precio explícito y permite negociar fuera del rango automático', async () => {
    const { rawService, revisions } = fixture({ demand: market('demand-1', buyer, '10000', 'maxPricePerKwh', '900') });
    await expect(rawService.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: 2 })).rejects.toMatchObject({ code: 'INVALID_NEGOTIATION_PRICE' });
    const created = await rawService.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '2.5', pricePerKwh: '950.12345' });
    expect(created).toMatchObject({ quantityKwh: '2.5', pricePerKwh: '950.12345', totalAmountCop: '2375.308625', sellerAcceptedAt: '2026-09-21T10:00:00.000Z' });
    expect(revisions.get(created.id)).toHaveLength(1);
  });

  test('C21b-02: contrapropuestas alternan, reinician aceptación y preservan historial privado', async () => {
    const { rawService } = fixture();
    const created = await rawService.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '10', pricePerKwh: '950' });
    await expect(rawService.counter(seller, created.id, { quantityKwh: '9', pricePerKwh: '960' })).rejects.toMatchObject({ code: 'COUNTERPARTY_REQUIRED' });
    const countered = await rawService.counter(buyer, created.id, { quantityKwh: '8', pricePerKwh: '975.5' });
    expect(countered).toMatchObject({ quantityKwh: '8', pricePerKwh: '975.5', totalAmountCop: '7804.0', sellerAcceptedAt: null });
    const revisions = await rawService.revisions(seller, created.id);
    expect(revisions).toMatchObject([{ sequence: 1, proposedByRole: 'SELLER' }, { sequence: 2, proposedByRole: 'BUYER', quantityKwh: '8' }]);
    expect(revisions[0]).not.toHaveProperty('proposedByUserId');
    await expect(rawService.revisions(outsider, created.id)).rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });
    const confirmed = await rawService.accept(seller, created.id);
    expect(confirmed.status).toBe('CONFIRMED');
  });

  test('C21b-03: negociación 50.000 conserva publicaciones, snapshot, saldos y aceptación del último término', async () => {
    const { rawService, offers, demands, transactions } = fixture({ offer: market('offer-1', seller, '50000', 'pricePerKwh', '450'), demand: market('demand-1', buyer, '50000', 'maxPricePerKwh', '412.50') });
    const created = await rawService.create(buyer, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '50000', pricePerKwh: '420' });
    expect(created).toMatchObject({ status: 'PENDING_ACCEPTANCE', buyerAcceptedAt: '2026-09-21T10:00:00.000Z', sellerAcceptedAt: null, latestRevisionSequence: 1, latestRevisionProposedByRole: 'BUYER' });
    const second = await rawService.counter(seller, created.id, { quantityKwh: '50000', pricePerKwh: '440' });
    expect(second).toMatchObject({ sellerAcceptedAt: '2026-09-21T10:00:00.000Z', buyerAcceptedAt: null });
    const third = await rawService.counter(buyer, created.id, { quantityKwh: '45000', pricePerKwh: '435' });
    expect(third).toMatchObject({ quantityKwh: '45000', pricePerKwh: '435', totalAmountCop: '19575000', buyerAcceptedAt: '2026-09-21T10:00:00.000Z', sellerAcceptedAt: null, latestRevisionSequence: 3, latestRevisionProposedByRole: 'BUYER' });
    await expect(rawService.counter(buyer, created.id, { quantityKwh: '44000', pricePerKwh: '430' })).rejects.toMatchObject({ code: 'COUNTERPARTY_REQUIRED' });
    await expect(rawService.edit(buyer, created.id, { quantityKwh: '44000' })).rejects.toMatchObject({ code: 'TRANSACTION_NEGOTIATION_IMMUTABLE' });
    expect(transactions.get(created.id)).toMatchObject({ quantityKwh: '45000', pricePerKwh: '435', totalAmountCop: '19575000' });
    expect(await rawService.revisions(seller, created.id)).toMatchObject([{ sequence: 1, proposedByRole: 'BUYER' }, { sequence: 2, proposedByRole: 'SELLER' }, { sequence: 3, proposedByRole: 'BUYER' }]);
    demands.set('demand-2', market('demand-2', outsider, '5000', 'maxPricePerKwh', '500'));
    const released = await rawService.create(seller, { offerId: 'offer-1', demandId: 'demand-2', quantityKwh: '5000', pricePerKwh: '450' });
    await expect(rawService.create(seller, { offerId: 'offer-1', demandId: 'demand-2', quantityKwh: '1', pricePerKwh: '450' })).rejects.toMatchObject({ code: 'OFFER_QUANTITY_UNAVAILABLE' });
    await rawService.cancel(seller, released.id);
    const confirmed = await rawService.accept(seller, created.id);
    expect(confirmed).toMatchObject({ status: 'CONFIRMED', sellerAcceptedAt: '2026-09-21T10:00:00.000Z', buyerAcceptedAt: '2026-09-21T10:00:00.000Z' });
    expect(offers.get('offer-1')).toMatchObject({ quantityKwh: '50000', pricePerKwh: '450', status: EnergyMarketStatus.ACTIVE });
    expect(demands.get('demand-1')).toMatchObject({ quantityKwh: '50000', maxPricePerKwh: '412.50', status: EnergyMarketStatus.ACTIVE });
  });

  test('C21b-04: ajuste de reserva, cancelación y rechazo preservan revisiones', async () => {
    const increased = fixture({ offer: market('offer-1', seller, '50000', 'pricePerKwh', '450'), demand: market('demand-1', buyer, '50000', 'maxPricePerKwh', '412.50') });
    const started = await increased.rawService.create(buyer, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '15000', pricePerKwh: '420' });
    expect((await increased.rawService.counter(seller, started.id, { quantityKwh: '18000', pricePerKwh: '425' })).quantityKwh).toBe('18000');
    await expect(increased.rawService.counter(buyer, started.id, { quantityKwh: '50001', pricePerKwh: '430' })).rejects.toMatchObject({ code: 'OFFER_QUANTITY_UNAVAILABLE' });
    const cancelled = fixture();
    const cancelTarget = await cancelled.rawService.create(buyer, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '10', pricePerKwh: '420' });
    await cancelled.rawService.counter(seller, cancelTarget.id, { quantityKwh: '9', pricePerKwh: '430' });
    expect((await cancelled.rawService.cancel(buyer, cancelTarget.id)).status).toBe('CANCELLED');
    expect(await cancelled.rawService.revisions(buyer, cancelTarget.id)).toHaveLength(2);
    const rejected = fixture();
    const rejectTarget = await rejected.rawService.create(seller, { offerId: 'offer-1', demandId: 'demand-1', quantityKwh: '10', pricePerKwh: '420' });
    await rejected.rawService.counter(buyer, rejectTarget.id, { quantityKwh: '9', pricePerKwh: '430' });
    await expect(rejected.rawService.reject(buyer, rejectTarget.id)).rejects.toMatchObject({ code: 'TRANSACTION_RECIPIENT_REQUIRED' });
    expect((await rejected.rawService.reject(seller, rejectTarget.id)).status).toBe('REJECTED');
    expect(await rejected.rawService.revisions(seller, rejectTarget.id)).toHaveLength(2);
  });
});
describe('Negociación horaria', () => {
  function hourlyBatch() {
    const offerPublication = randomUUID();
    const demandPublication = randomUUID();
    const slots = [8, 9].map(hour => ({
      offer: { ...market(randomUUID(), seller, '10', 'pricePerKwh', '900'), hour, publicationId: offerPublication },
      demand: { ...market(randomUUID(), buyer, '10', 'maxPricePerKwh', '950'), hour, publicationId: demandPublication },
    }));
    const memory = createRepository(slots[0]);
    for (const slot of slots) { memory.offers.set(slot.offer.id, slot.offer); memory.demands.set(slot.demand.id, slot.demand); }
    return { ...memory, service: createEnergyTransactionService(memory.repository, () => new Date('2026-09-21T10:00:00Z')), proposals: slots.map(slot => ({ offerId: slot.offer.id, demandId: slot.demand.id, quantityKwh: 5, pricePerKwh: 900 })) };
  }

  test('BATCH-MEMORY-01: lote in-memory conserva hour/batchId sin llamar Prisma global', async () => {
    const globalTransaction = spyOn(prisma, '$transaction').mockImplementation(() => { throw new Error('Global Prisma forbidden'); });
    try {
      const memory = hourlyBatch();
      const created = await memory.service.createBatch(seller, { proposals: memory.proposals });
      expect(created.transactions.map(value => value.hour)).toEqual([8, 9]);
      expect([...memory.transactions.values()].map(value => value.batchId)).toEqual([created.batchId, created.batchId]);
      expect(memory.revisions.size).toBe(2);
      expect(created.transactions[0]).not.toHaveProperty('batchId');
      expect(globalTransaction).not.toHaveBeenCalled();
    } finally { globalTransaction.mockRestore(); }
  });

  test('BATCH-MEMORY-02: fallo de segunda hora revierte transacciones, revisiones y reservas', async () => {
    const globalTransaction = spyOn(prisma, '$transaction').mockImplementation(() => { throw new Error('Global Prisma forbidden'); });
    try {
      const memory = hourlyBatch();
      await expect(memory.service.createBatch(seller, { proposals: [memory.proposals[0], { ...memory.proposals[1], quantityKwh: 11 }] })).rejects.toMatchObject({ code: 'OFFER_QUANTITY_UNAVAILABLE' });
      expect(memory.transactions.size).toBe(0);
      expect(memory.revisions.size).toBe(0);
      expect([...memory.offers.values()].map(value => value.status)).toEqual(['ACTIVE', 'ACTIVE']);
      expect((await memory.service.createBatch(seller, { proposals: memory.proposals })).transactions).toHaveLength(2);
      expect(globalTransaction).not.toHaveBeenCalled();
    } finally { globalTransaction.mockRestore(); }
  });

  test('BATCH-MEMORY-03: repositorio sin frontera atomica falla sin fallback', async () => {
    const globalTransaction = spyOn(prisma, '$transaction').mockImplementation(() => { throw new Error('Global Prisma forbidden'); });
    try {
      const memory = hourlyBatch();
      const { withLockedBatch: _batch, ...withoutBatch } = memory.repository;
      const service = createEnergyTransactionService(withoutBatch);
      await expect(service.createBatch(seller, { proposals: memory.proposals })).rejects.toMatchObject({ code: 'TRANSACTION_BATCH_UNSUPPORTED' });
      expect(globalTransaction).not.toHaveBeenCalled();
    } finally { globalTransaction.mockRestore(); }
  });

  test('BATCH-ISOLATED-01: no crea ni cancela acuerdos fuera de ambos propietarios fixture', async () => {
    const memory = hourlyBatch();
    const scoped = createEnergyTransactionService(memory.repository, () => new Date('2026-09-21T10:00:00Z'), { userIds: [seller] });
    await expect(scoped.createBatch(seller, { proposals: memory.proposals })).rejects.toMatchObject({ status: 404 });
    expect(memory.transactions.size).toBe(0);
    expect(memory.revisions.size).toBe(0);
    const created = await memory.service.createBatch(seller, { proposals: memory.proposals });
    await expect(scoped.cancel(seller, created.transactions[0]!.id)).rejects.toMatchObject({ status: 404 });
    expect([...memory.transactions.values()].every(value => value.status === 'PENDING_ACCEPTANCE')).toBe(true);
    expect(await scoped.findMine(seller)).toEqual([]);
  });

  test('HOUR-TX-01: rechaza horas distintas e histórico contra horario', async () => {
    const offer = { ...market('offer-1', seller, '10', 'pricePerKwh', '900'), hour: 8 };
    for (const hour of [9, undefined]) {
      const demand = { ...market('demand-1', buyer, '10', 'maxPricePerKwh', '950'), hour };
      const { rawService } = fixture({ offer, demand });
      await expect(rawService.create(seller, { offerId: offer.id, demandId: demand.id, quantityKwh: 5, pricePerKwh: 900 })).rejects.toMatchObject({ code: 'DELIVERY_HOUR_MISMATCH' });
    }
  });
  test('HOUR-TX-02: reserva parcial conserva hora; al cierre no acepta ni contrapropone', async () => {
    const offer = { ...market('offer-1', seller, '10', 'pricePerKwh', '900'), hour: 8 };
    const demand = { ...market('demand-1', buyer, '10', 'maxPricePerKwh', '950'), hour: 8 };
    const memory = createRepository({ offer, demand });
    let clock = new Date('2026-09-21T10:00:00Z');
    const service = createEnergyTransactionService(memory.repository, () => clock);
    const created = await service.create(seller, { offerId: offer.id, demandId: demand.id, quantityKwh: 5, pricePerKwh: 900 });
    expect(created.hour).toBe(8);
    clock = new Date('2026-09-23T05:00:00Z');
    await expect(service.accept(buyer, created.id)).rejects.toMatchObject({ code: 'HOURLY_MARKET_CLOSED' });
    await expect(service.counter(buyer, created.id, { quantityKwh: 4, pricePerKwh: 800 })).rejects.toMatchObject({ code: 'HOURLY_MARKET_CLOSED' });
    expect((await service.cancel(seller, created.id)).status).toBe('CANCELLED');
  });
});

test('GATE-UNIT: repositorio sin aprobación o aprobación negativa bloquea propuestas', async()=>{
 const memory=createRepository();
 for (const approved of [false,undefined]) {
  const repo={...memory.repository,withLockedPublications: (offerId:string,demandId:string,action:(store:LockedStore)=>Promise<unknown>)=>memory.repository.withLockedPublications(offerId,demandId,store=>action({...store,verificationApproved:approved===undefined?undefined:async()=>approved}))} as EnergyTransactionRepository;
  await expect(createEnergyTransactionService(repo,()=>new Date('2026-09-21')).create(buyer,{offerId:'offer-1',demandId:'demand-1',quantityKwh:1,pricePerKwh:900})).rejects.toMatchObject({code:'PUBLICATION_VERIFICATION_REQUIRED'});
 }
 expect(memory.transactions.size).toBe(0);
});

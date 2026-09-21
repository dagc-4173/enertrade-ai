import { EnergyMarketStatus, EnergyTransactionStatus, Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { businessDateInColombia } from '@/services/publication-expiration.service';

type MarketRecord = {
  id: string;
  userId: string;
  quantityKwh: unknown;
  pricePerKwh?: unknown;
  maxPricePerKwh?: unknown;
  deliveryDate: Date;
  status: EnergyMarketStatus;
};

export type TransactionRecord = {
  id: string;
  offerId: string;
  demandId: string;
  sellerUserId: string;
  buyerUserId: string;
  proposedByUserId: string | null;
  quantityKwh: unknown;
  pricePerKwh: unknown;
  totalAmountCop: unknown;
  deliveryDate: Date;
  status: EnergyTransactionStatus;
  sellerAcceptedAt: Date | null;
  buyerAcceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  matchingExecutionId: string | null;
};

export type TransactionRevisionRecord = {
  id: string;
  transactionId: string;
  sequence: number;
  proposedByUserId: string;
  quantityKwh: unknown;
  pricePerKwh: unknown;
  totalAmountCop: unknown;
  createdAt: Date;
};

type TransactionRevisionCreation = Omit<TransactionRevisionRecord, 'id' | 'createdAt' | 'quantityKwh' | 'pricePerKwh' | 'totalAmountCop'> & {
  quantityKwh: string;
  pricePerKwh: string;
  totalAmountCop: string;
};

type TransactionCreation = {
  proposedByUserId: string;
  offerId: string;
  demandId: string;
  sellerUserId: string;
  buyerUserId: string;
  quantityKwh: string;
  pricePerKwh: string;
  totalAmountCop: string;
  deliveryDate: Date;
  status: EnergyTransactionStatus;
  matchingExecutionId: string | null;
  sellerAcceptedAt: Date | null;
  buyerAcceptedAt: Date | null;
};

type LockedStore = {
  offer(): Promise<MarketRecord | null>;
  demand(): Promise<MarketRecord | null>;
  reservedOfferQuantity(): Promise<string>;
  reservedDemandQuantity(): Promise<string>;
  activeDuplicate(quantityKwh: string): Promise<TransactionRecord | null>;
  expire?(today: string): Promise<void>;
  create(data: TransactionCreation): Promise<TransactionRecord>;
  createRevision?(data: TransactionRevisionCreation): Promise<TransactionRevisionRecord>;
};

type TransactionStore = {
  transaction(): Promise<TransactionRecord | null>;
  update(data: Partial<Pick<TransactionRecord, 'quantityKwh' | 'pricePerKwh' | 'totalAmountCop' | 'status' | 'sellerAcceptedAt' | 'buyerAcceptedAt' | 'confirmedAt' | 'cancelledAt'>>): Promise<TransactionRecord>;
  reservedOfferQuantity(): Promise<string>;
  reservedDemandQuantity(): Promise<string>;
  confirmedOfferQuantity(): Promise<string>;
  confirmedDemandQuantity(): Promise<string>;
  offer(): Promise<MarketRecord | null>;
  demand(): Promise<MarketRecord | null>;
  setOfferStatus(status: EnergyMarketStatus): Promise<void>;
  setDemandStatus(status: EnergyMarketStatus): Promise<void>;
  latestRevision?(): Promise<TransactionRevisionRecord | null>;
  createRevision?(data: TransactionRevisionCreation): Promise<TransactionRevisionRecord>;
};

export interface EnergyTransactionRepository {
  withLockedPublications<T>(offerId: string, demandId: string, action: (store: LockedStore) => Promise<T>): Promise<T>;
  withLockedTransaction<T>(id: string, action: (store: TransactionStore) => Promise<T>): Promise<T>;
  findMine(userId: string, status?: EnergyTransactionStatus): Promise<TransactionRecord[]>;
  findForParticipant(id: string, userId: string): Promise<TransactionRecord | null>;
  findRevisions?(transactionId: string): Promise<TransactionRevisionRecord[]>;
}

export class EnergyTransactionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function decimalString(value: unknown): string {
  const text = typeof value === 'string' ? value : value && typeof value === 'object' && 'toString' in value ? String(value) : String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error('Invalid persisted decimal');
  return text;
}

function scale(value: string) { return value.split('.')[1]?.length ?? 0; }
function scaled(value: string, targetScale: number): bigint {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const digits = `${whole}${fraction.padEnd(targetScale, '0').slice(0, targetScale)}`.replace(/^0+(?=\d)/, '') || '0';
  return (negative ? -1n : 1n) * BigInt(digits);
}
function decimal(value: bigint, valueScale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  if (valueScale === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(valueScale + 1, '0');
  return `${negative ? '-' : ''}${padded.slice(0, -valueScale)}.${padded.slice(-valueScale)}`;
}
function compare(left: string, right: string) {
  const valueScale = Math.max(scale(left), scale(right));
  return scaled(left, valueScale) === scaled(right, valueScale) ? 0 : scaled(left, valueScale) > scaled(right, valueScale) ? 1 : -1;
}
function subtract(left: string, right: string) {
  const valueScale = Math.max(scale(left), scale(right));
  return decimal(scaled(left, valueScale) - scaled(right, valueScale), valueScale);
}
function multiply(left: string, right: string) { return decimal(scaled(left, scale(left)) * scaled(right, scale(right)), scale(left) + scale(right)); }
function dateOnly(value: Date) { return value.toISOString().slice(0, 10); }

function quantity(value: unknown): string {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text) || compare(text, '0') <= 0) {
    throw new EnergyTransactionError(400, 'INVALID_TRANSACTION_QUANTITY', 'La cantidad debe ser decimal positiva con máximo dos decimales.');
  }
  return text;
}

function createInput(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EnergyTransactionError(400, 'INVALID_TRANSACTION_REQUEST', 'La solicitud de transacción no es válida.');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !['offerId', 'demandId', 'quantityKwh', 'pricePerKwh', 'matchingExecutionId'].includes(key)) || typeof value.offerId !== 'string' || typeof value.demandId !== 'string' || (value.matchingExecutionId !== undefined && (typeof value.matchingExecutionId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.matchingExecutionId)))) {
    throw new EnergyTransactionError(400, 'INVALID_TRANSACTION_REQUEST', 'La solicitud de transacción no es válida.');
  }
  return { offerId: value.offerId, demandId: value.demandId, quantityKwh: quantity(value.quantityKwh), pricePerKwh: price(value.pricePerKwh), matchingExecutionId: value.matchingExecutionId ?? null };
}

function editInput(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EnergyTransactionError(400, 'INVALID_TRANSACTION_REQUEST', 'La solicitud de transacción no es válida.');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || !Object.hasOwn(value, 'quantityKwh')) throw new EnergyTransactionError(400, 'INVALID_TRANSACTION_REQUEST', 'Solo se permite modificar quantityKwh.');
  return { quantityKwh: quantity(value.quantityKwh) };
}

function counterInput(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EnergyTransactionError(400, 'INVALID_TRANSACTION_REQUEST', 'La solicitud de contrapropuesta no es válida.');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || !Object.hasOwn(value, 'quantityKwh') || !Object.hasOwn(value, 'pricePerKwh')) throw new EnergyTransactionError(400, 'INVALID_TRANSACTION_REQUEST', 'La contrapropuesta requiere cantidad y precio.');
  return { quantityKwh: quantity(value.quantityKwh), pricePerKwh: price(value.pricePerKwh) };
}

function dto(value: TransactionRecord) {
  return {
    id: value.id,
    offerId: value.offerId,
    demandId: value.demandId,
    quantityKwh: decimalString(value.quantityKwh),
    pricePerKwh: decimalString(value.pricePerKwh),
    totalAmountCop: decimalString(value.totalAmountCop),
    deliveryDate: dateOnly(value.deliveryDate),
    status: value.status,
    sellerAcceptedAt: value.sellerAcceptedAt?.toISOString() ?? null,
    buyerAcceptedAt: value.buyerAcceptedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    confirmedAt: value.confirmedAt?.toISOString() ?? null,
    cancelledAt: value.cancelledAt?.toISOString() ?? null,
    matchingExecutionId: value.matchingExecutionId,
  };
}

function participantDto(value: TransactionRecord, userId: string, revision?: TransactionRevisionRecord | null) {
  return { ...dto(value), role: value.sellerUserId === userId ? 'SELLER' as const : 'BUYER' as const, proposalOwnership: value.proposedByUserId === null ? 'LEGACY_UNKNOWN' as const : value.proposedByUserId === userId ? 'CREATED_BY_ME' as const : 'RECEIVED' as const,
    latestRevisionSequence: revision?.sequence ?? null, latestRevisionProposedByRole: revision ? revision.proposedByUserId === value.sellerUserId ? 'SELLER' as const : 'BUYER' as const : null };
}

function revisionDto(value: TransactionRevisionRecord, transaction: TransactionRecord) {
  return { sequence: value.sequence, quantityKwh: decimalString(value.quantityKwh), pricePerKwh: decimalString(value.pricePerKwh), totalAmountCop: decimalString(value.totalAmountCop), proposedByRole: value.proposedByUserId === transaction.sellerUserId ? 'SELLER' as const : 'BUYER' as const, createdAt: value.createdAt.toISOString() };
}

function prismaStore(transaction: Prisma.TransactionClient, offerId: string, demandId: string): LockedStore {
  const toRecord = (value: any): TransactionRecord => value;
  return {
    offer: () => transaction.energyOffer.findUnique({ where: { id: offerId } }),
    demand: () => transaction.energyDemand.findUnique({ where: { id: demandId } }),
    reservedOfferQuantity: async () => decimalString((await transaction.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { offerId, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } }))._sum.quantityKwh ?? '0'),
    reservedDemandQuantity: async () => decimalString((await transaction.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { demandId, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } }))._sum.quantityKwh ?? '0'),
    activeDuplicate: async quantityKwh => {
      const value = await transaction.energyTransaction.findFirst({ where: { offerId, demandId, quantityKwh, status: 'PENDING_ACCEPTANCE' } });
      return value ? toRecord(value) : null;
    },
    expire: async today => {
      const cutoff = new Date(`${today}T00:00:00.000Z`);
      await Promise.all([
        transaction.energyOffer.updateMany({ where: { id: offerId, status: 'ACTIVE', deliveryDate: { lt: cutoff } }, data: { status: 'EXPIRED' } }),
        transaction.energyDemand.updateMany({ where: { id: demandId, status: 'ACTIVE', deliveryDate: { lt: cutoff } }, data: { status: 'EXPIRED' } }),
      ]);
    },
    create: async data => toRecord(await transaction.energyTransaction.create({ data })),
    createRevision: async data => transaction.energyTransactionRevision.create({ data }),
  };
}

const repository: EnergyTransactionRepository = {
  withLockedPublications: (offerId, demandId, action) => prisma.$transaction(async transaction => {
    await transaction.$queryRaw`SELECT "id" FROM "EnergyOffer" WHERE "id" = ${offerId}::uuid FOR UPDATE`;
    await transaction.$queryRaw`SELECT "id" FROM "EnergyDemand" WHERE "id" = ${demandId}::uuid FOR UPDATE`;
    return action(prismaStore(transaction, offerId, demandId));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
  withLockedTransaction: (id, action) => prisma.$transaction(async transaction => {
    const rows = await transaction.$queryRaw<Array<{ offerId: string; demandId: string }>>`SELECT "offerId", "demandId" FROM "EnergyTransaction" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) return action({
      transaction: async () => null,
      update: async () => { throw new Error('unreachable'); },
      reservedOfferQuantity: async () => '0', reservedDemandQuantity: async () => '0', confirmedOfferQuantity: async () => '0', confirmedDemandQuantity: async () => '0', offer: async () => null, demand: async () => null,
      setOfferStatus: async () => {}, setDemandStatus: async () => {},
    });
    await transaction.$queryRaw`SELECT "id" FROM "EnergyOffer" WHERE "id" = ${row.offerId}::uuid FOR UPDATE`;
    await transaction.$queryRaw`SELECT "id" FROM "EnergyDemand" WHERE "id" = ${row.demandId}::uuid FOR UPDATE`;
    const store: TransactionStore = {
      transaction: async () => (await transaction.energyTransaction.findUnique({ where: { id } })) as TransactionRecord | null,
      update: async data => transaction.energyTransaction.update({ where: { id }, data: { ...data, ...(data.quantityKwh === undefined ? {} : { quantityKwh: decimalString(data.quantityKwh) }), ...(data.totalAmountCop === undefined ? {} : { totalAmountCop: decimalString(data.totalAmountCop) }) } as Prisma.EnergyTransactionUncheckedUpdateInput }) as Promise<TransactionRecord>,
      reservedOfferQuantity: async () => decimalString((await transaction.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { offerId: row.offerId, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } }))._sum.quantityKwh ?? '0'),
      reservedDemandQuantity: async () => decimalString((await transaction.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { demandId: row.demandId, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } }))._sum.quantityKwh ?? '0'),
      confirmedOfferQuantity: async () => decimalString((await transaction.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { offerId: row.offerId, status: 'CONFIRMED' } }))._sum.quantityKwh ?? '0'),
      confirmedDemandQuantity: async () => decimalString((await transaction.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { demandId: row.demandId, status: 'CONFIRMED' } }))._sum.quantityKwh ?? '0'),
      offer: () => transaction.energyOffer.findUnique({ where: { id: row.offerId } }),
      demand: () => transaction.energyDemand.findUnique({ where: { id: row.demandId } }),
      setOfferStatus: async status => { await transaction.energyOffer.update({ where: { id: row.offerId }, data: { status } }); },
      setDemandStatus: async status => { await transaction.energyDemand.update({ where: { id: row.demandId }, data: { status } }); },
      latestRevision: async () => transaction.energyTransactionRevision.findFirst({ where: { transactionId: id }, orderBy: { sequence: 'desc' } }),
      createRevision: async data => transaction.energyTransactionRevision.create({ data }),
    };
    return action(store);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
  findMine: async (userId, status) => (await prisma.energyTransaction.findMany({ where: { OR: [{ sellerUserId: userId }, { buyerUserId: userId }], ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' } })) as TransactionRecord[],
  findForParticipant: async (id, userId) => (await prisma.energyTransaction.findFirst({ where: { id, OR: [{ sellerUserId: userId }, { buyerUserId: userId }] } })) as TransactionRecord | null,
  findRevisions: async transactionId => (await prisma.energyTransactionRevision.findMany({ where: { transactionId }, orderBy: { sequence: 'asc' } })) as TransactionRevisionRecord[],
};

async function ensureConfirmedPublicationStatuses(store: TransactionStore, record: TransactionRecord) {
  const [offer, demand, confirmedOffer, confirmedDemand] = await Promise.all([store.offer(), store.demand(), store.confirmedOfferQuantity(), store.confirmedDemandQuantity()]);
  if (offer && compare(confirmedOffer, decimalString(offer.quantityKwh)) >= 0) await store.setOfferStatus('FULFILLED');
  if (demand && compare(confirmedDemand, decimalString(demand.quantityKwh)) >= 0) await store.setDemandStatus('FULFILLED');
  return record;
}

export function createEnergyTransactionService(repo: EnergyTransactionRepository = repository, now: () => Date = () => new Date()) {
  return {
    async create(userId: string, body: unknown) {
      const input = createInput(body);
      const created = await repo.withLockedPublications(input.offerId, input.demandId, async store => {
        await store.expire?.(businessDateInColombia(now()));
        const [offer, demand, reservedOffer, reservedDemand, duplicate] = await Promise.all([store.offer(), store.demand(), store.reservedOfferQuantity(), store.reservedDemandQuantity(), store.activeDuplicate(input.quantityKwh)]);
        if (!offer) throw new EnergyTransactionError(404, 'OFFER_NOT_FOUND', 'La oferta no existe.');
        if (!demand) throw new EnergyTransactionError(404, 'DEMAND_NOT_FOUND', 'La demanda no existe.');
        if (offer.status === 'EXPIRED' || demand.status === 'EXPIRED') throw new EnergyTransactionError(409, 'PUBLICATION_EXPIRED', 'La oferta o demanda está vencida y no admite nuevas propuestas.');
        if (offer.status !== 'ACTIVE' || demand.status !== 'ACTIVE') throw new EnergyTransactionError(409, 'PUBLICATION_NOT_ACTIVE', 'La oferta y demanda deben estar activas.');
        if (offer.userId === demand.userId) throw new EnergyTransactionError(409, 'SAME_TRANSACTION_PARTICIPANT', 'La oferta y demanda deben pertenecer a usuarios distintos.');
        if (userId !== offer.userId && userId !== demand.userId) throw new EnergyTransactionError(403, 'TRANSACTION_PARTICIPANT_REQUIRED', 'Solo un participante puede proponer la transacción.');
        if (dateOnly(offer.deliveryDate) !== dateOnly(demand.deliveryDate)) throw new EnergyTransactionError(409, 'DELIVERY_DATE_MISMATCH', 'La fecha de entrega debe coincidir.');
        if (duplicate) throw new EnergyTransactionError(409, 'DUPLICATE_ACTIVE_PROPOSAL', 'Ya existe una propuesta activa equivalente.');
        const offerAvailable = subtract(decimalString(offer.quantityKwh), reservedOffer);
        const demandAvailable = subtract(decimalString(demand.quantityKwh), reservedDemand);
        if (compare(input.quantityKwh, offerAvailable) > 0) throw new EnergyTransactionError(409, 'OFFER_QUANTITY_UNAVAILABLE', 'La cantidad supera el saldo disponible de la oferta.');
        if (compare(input.quantityKwh, demandAvailable) > 0) throw new EnergyTransactionError(409, 'DEMAND_QUANTITY_UNAVAILABLE', 'La cantidad supera el saldo pendiente de la demanda.');
        const acceptedAt = now();
        const totalAmountCop = multiply(input.quantityKwh, input.pricePerKwh);
        const created = await store.create({ offerId: offer.id, demandId: demand.id, sellerUserId: offer.userId, buyerUserId: demand.userId, proposedByUserId: userId, quantityKwh: input.quantityKwh, pricePerKwh: input.pricePerKwh, totalAmountCop, deliveryDate: offer.deliveryDate, status: 'PENDING_ACCEPTANCE', matchingExecutionId: input.matchingExecutionId, sellerAcceptedAt: userId === offer.userId ? acceptedAt : null, buyerAcceptedAt: userId === demand.userId ? acceptedAt : null });
        const revision = await store.createRevision?.({ transactionId: created.id, sequence: 1, proposedByUserId: userId, quantityKwh: input.quantityKwh, pricePerKwh: input.pricePerKwh, totalAmountCop });
        return { transaction: created, revision };
      });
      return participantDto(created.transaction, userId, created.revision);
    },
    async edit(userId: string, id: string, body: unknown) {
      const input = editInput(body);
      return participantDto(await repo.withLockedTransaction(id, async store => {
        const current = await store.transaction();
        if (!current) throw new EnergyTransactionError(404, 'TRANSACTION_NOT_FOUND', 'La transacción no existe.');
        if (current.status !== 'PENDING_ACCEPTANCE') throw new EnergyTransactionError(409, 'TRANSACTION_NOT_PENDING', 'La transacción ya no admite edición.');
        if (current.proposedByUserId === null) throw new EnergyTransactionError(409, 'TRANSACTION_LEGACY_IMMUTABLE', 'La propuesta histórica no tiene creador verificable y no puede editarse.');
        if (current.proposedByUserId !== userId) throw new EnergyTransactionError(403, 'TRANSACTION_PROPOSER_REQUIRED', 'Solo quien creó la propuesta puede editarla.');
        if (await store.latestRevision?.()) throw new EnergyTransactionError(409, 'TRANSACTION_NEGOTIATION_IMMUTABLE', 'Una negociación versionada debe cambiarse mediante contrapropuesta.');
        const [offer, demand, reservedOffer, reservedDemand] = await Promise.all([store.offer(), store.demand(), store.reservedOfferQuantity(), store.reservedDemandQuantity()]);
        if (!offer || !demand) throw new EnergyTransactionError(409, 'TRANSACTION_PUBLICATION_UNAVAILABLE', 'La propuesta referencia una publicación no disponible.');
        const ownQuantity = decimalString(current.quantityKwh);
        const offerAvailable = subtract(subtract(decimalString(offer.quantityKwh), reservedOffer), `-${ownQuantity}`);
        const demandAvailable = subtract(subtract(decimalString(demand.quantityKwh), reservedDemand), `-${ownQuantity}`);
        if (compare(input.quantityKwh, offerAvailable) > 0) throw new EnergyTransactionError(409, 'OFFER_QUANTITY_UNAVAILABLE', 'La cantidad supera el saldo disponible de la oferta.');
        if (compare(input.quantityKwh, demandAvailable) > 0) throw new EnergyTransactionError(409, 'DEMAND_QUANTITY_UNAVAILABLE', 'La cantidad supera el saldo pendiente de la demanda.');
        return store.update({ quantityKwh: input.quantityKwh, totalAmountCop: multiply(input.quantityKwh, decimalString(current.pricePerKwh)), sellerAcceptedAt: null, buyerAcceptedAt: null });
      }), userId);
    },
    async counter(userId: string, id: string, body: unknown) {
      const input = counterInput(body);
      const countered = await repo.withLockedTransaction(id, async store => {
        const current = await store.transaction();
        if (!current) throw new EnergyTransactionError(404, 'TRANSACTION_NOT_FOUND', 'La transacción no existe.');
        if (current.status !== 'PENDING_ACCEPTANCE') throw new EnergyTransactionError(409, 'TRANSACTION_NOT_PENDING', 'La transacción ya no admite contrapropuestas.');
        if (userId !== current.sellerUserId && userId !== current.buyerUserId) throw new EnergyTransactionError(403, 'TRANSACTION_PARTICIPANT_REQUIRED', 'Solo un participante puede realizar una contrapropuesta.');
        const latest = await store.latestRevision?.();
        if (!latest) throw new EnergyTransactionError(409, 'TRANSACTION_LEGACY_IMMUTABLE', 'La propuesta histórica no admite contrapropuestas.');
        if (latest.proposedByUserId === userId) throw new EnergyTransactionError(409, 'COUNTERPARTY_REQUIRED', 'La contrapropuesta debe ser realizada por la contraparte.');
        const [offer, demand, reservedOffer, reservedDemand] = await Promise.all([store.offer(), store.demand(), store.reservedOfferQuantity(), store.reservedDemandQuantity()]);
        if (!offer || !demand) throw new EnergyTransactionError(409, 'TRANSACTION_PUBLICATION_UNAVAILABLE', 'La propuesta referencia una publicación no disponible.');
        const ownQuantity = decimalString(current.quantityKwh);
        const offerAvailable = subtract(subtract(decimalString(offer.quantityKwh), reservedOffer), `-${ownQuantity}`);
        const demandAvailable = subtract(subtract(decimalString(demand.quantityKwh), reservedDemand), `-${ownQuantity}`);
        if (compare(input.quantityKwh, offerAvailable) > 0) throw new EnergyTransactionError(409, 'OFFER_QUANTITY_UNAVAILABLE', 'La cantidad supera el saldo disponible de la oferta.');
        if (compare(input.quantityKwh, demandAvailable) > 0) throw new EnergyTransactionError(409, 'DEMAND_QUANTITY_UNAVAILABLE', 'La cantidad supera el saldo pendiente de la demanda.');
        const totalAmountCop = multiply(input.quantityKwh, input.pricePerKwh);
        const revision = await store.createRevision?.({ transactionId: current.id, sequence: latest.sequence + 1, proposedByUserId: userId, quantityKwh: input.quantityKwh, pricePerKwh: input.pricePerKwh, totalAmountCop });
        const acceptedAt = now();
        return { transaction: await store.update({ quantityKwh: input.quantityKwh, pricePerKwh: input.pricePerKwh, totalAmountCop, sellerAcceptedAt: userId === current.sellerUserId ? acceptedAt : null, buyerAcceptedAt: userId === current.buyerUserId ? acceptedAt : null }), revision };
      });
      return participantDto(countered.transaction, userId, countered.revision);
    },
    async accept(userId: string, id: string) {
      return participantDto(await repo.withLockedTransaction(id, async store => {
        const current = await store.transaction();
        if (!current) throw new EnergyTransactionError(404, 'TRANSACTION_NOT_FOUND', 'La transacción no existe.');
        if (current.status !== 'PENDING_ACCEPTANCE') throw new EnergyTransactionError(409, 'TRANSACTION_NOT_PENDING', 'La transacción ya no admite aceptación.');
        if (userId !== current.sellerUserId && userId !== current.buyerUserId) throw new EnergyTransactionError(403, 'TRANSACTION_PARTICIPANT_REQUIRED', 'Solo un participante puede aceptar la transacción.');
        const sellerAcceptedAt = userId === current.sellerUserId ? current.sellerAcceptedAt ?? now() : current.sellerAcceptedAt;
        const buyerAcceptedAt = userId === current.buyerUserId ? current.buyerAcceptedAt ?? now() : current.buyerAcceptedAt;
        const confirmed = sellerAcceptedAt !== null && buyerAcceptedAt !== null;
        const updated = await store.update({ sellerAcceptedAt, buyerAcceptedAt, ...(confirmed ? { status: 'CONFIRMED', confirmedAt: now() } : {}) });
        return confirmed ? ensureConfirmedPublicationStatuses(store, updated) : updated;
      }), userId);
    },
    async reject(userId: string, id: string) {
      return participantDto(await repo.withLockedTransaction(id, async store => {
        const current = await store.transaction();
        if (!current) throw new EnergyTransactionError(404, 'TRANSACTION_NOT_FOUND', 'La transacción no existe.');
        if (current.status !== 'PENDING_ACCEPTANCE') throw new EnergyTransactionError(409, 'TRANSACTION_NOT_PENDING', 'La transacción ya no admite rechazo.');
        if (userId !== current.sellerUserId && userId !== current.buyerUserId) throw new EnergyTransactionError(403, 'TRANSACTION_PARTICIPANT_REQUIRED', 'Solo un participante puede rechazar la transacción.');
        const latest = await store.latestRevision?.();
        const proposerId = latest?.proposedByUserId ?? current.proposedByUserId;
        if (proposerId !== null && proposerId === userId) throw new EnergyTransactionError(403, 'TRANSACTION_RECIPIENT_REQUIRED', 'Quien propuso el término vigente debe cancelarlo, no rechazarlo.');
        return store.update({ status: 'REJECTED' });
      }), userId);
    },
    async cancel(userId: string, id: string) {
      return participantDto(await repo.withLockedTransaction(id, async store => {
        const current = await store.transaction();
        if (!current) throw new EnergyTransactionError(404, 'TRANSACTION_NOT_FOUND', 'La transacción no existe.');
        if (current.status !== 'PENDING_ACCEPTANCE') throw new EnergyTransactionError(409, 'TRANSACTION_NOT_PENDING', 'La transacción ya no admite cancelación.');
        if (current.proposedByUserId === null) throw new EnergyTransactionError(409, 'TRANSACTION_LEGACY_IMMUTABLE', 'La propuesta histórica no tiene creador verificable y no puede cancelarse.');
        if (current.proposedByUserId !== userId) throw new EnergyTransactionError(403, 'TRANSACTION_PROPOSER_REQUIRED', 'Solo quien creó la propuesta puede cancelarla.');
        return store.update({ status: 'CANCELLED', cancelledAt: now() });
      }), userId);
    },
    async findMine(userId: string, status?: string) {
      if (status && !Object.values(EnergyTransactionStatus).includes(status as EnergyTransactionStatus)) throw new EnergyTransactionError(400, 'INVALID_TRANSACTION_STATUS', 'El estado de transacción no es válido.');
      return Promise.all((await repo.findMine(userId, status as EnergyTransactionStatus | undefined)).map(async value => participantDto(value, userId, (await repo.findRevisions?.(value.id))?.at(-1))));
    },
    async findOne(userId: string, id: string) {
      const value = await repo.findForParticipant(id, userId);
      if (!value) throw new EnergyTransactionError(404, 'TRANSACTION_NOT_FOUND', 'La transacción no existe.');
      return participantDto(value, userId, (await repo.findRevisions?.(id))?.at(-1));
    },
    async revisions(userId: string, id: string) {
      const transaction = await repo.findForParticipant(id, userId);
      if (!transaction) throw new EnergyTransactionError(404, 'TRANSACTION_NOT_FOUND', 'La transacción no existe.');
      return (await repo.findRevisions?.(id) ?? []).map(value => revisionDto(value, transaction));
    },
  };
}

function price(value: unknown): string {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,5})?$/.test(text) || compare(text, '0') <= 0) {
    throw new EnergyTransactionError(400, 'INVALID_NEGOTIATION_PRICE', 'El precio debe ser decimal positivo con máximo cinco decimales.');
  }
  return text;
}
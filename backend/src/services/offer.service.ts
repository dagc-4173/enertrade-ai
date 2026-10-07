import { latestPublicationVerification } from '@/services/publication-verification.summary';
import { prisma } from '@/lib/prisma';
import { validateOfferInput, marketDecimal, type MarketDecimalValue, type EnergyMarketInputError } from '@/services/energy-market.validation';
import { expireActivePublications, businessDateInColombia } from '@/services/publication-expiration.service';

export class PublicationConflictError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

type OfferRecord = {
  id: string;
  userId: string;
  quantityKwh: unknown;
  pricePerKwh: unknown;
  hour?: number | null;
  publicationId?: string | null;
  deliveryDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface OfferRepository {
  create(data: { userId: string; quantityKwh: number; pricePerKwh: number; deliveryDate: Date }): Promise<OfferRecord>;
  findMine(userId: string): Promise<OfferRecord[]>;
  findOwn(userId: string, id: string): Promise<OfferRecord | null>;
  hasBlockingTransaction(id: string): Promise<boolean>;
  transactionTotals?(id: string): Promise<{ confirmedQuantityKwh: MarketDecimalValue; reservedQuantityKwh: MarketDecimalValue }>;
  update(id: string, data: { quantityKwh: number; pricePerKwh: number; deliveryDate: Date }): Promise<OfferRecord>;
  cancel(id: string): Promise<OfferRecord>;
  expire?(now: Date): Promise<void>;
  verification?(row: OfferRecord): ReturnType<typeof latestPublicationVerification>;
}

export function createOfferRepository(database = prisma): OfferRepository {
return {
  verification: row => latestPublicationVerification('offer', row.id, row.quantityKwh, row.deliveryDate, row.hour, database),
  create: data => database.energyOffer.create({ data }),
  findMine: userId => database.energyOffer.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  findOwn: (userId, id) => database.energyOffer.findFirst({ where: { id, userId } }),
  hasBlockingTransaction: async id => Boolean(await database.energyTransaction.findFirst({ where: { offerId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } })),
  transactionTotals: async id => {
    const [confirmed, reserved] = await Promise.all([
      database.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { offerId: id, status: 'CONFIRMED' } }),
      database.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { offerId: id, status: 'PENDING_ACCEPTANCE' } }),
    ]);
    return { confirmedQuantityKwh: confirmed._sum.quantityKwh ?? 0, reservedQuantityKwh: reserved._sum.quantityKwh ?? 0 };
  },
  update: (id, data) => database.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "EnergyOffer" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const current = await tx.energyOffer.findUniqueOrThrow({ where: { id } });
    if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_EDITABLE', 'La publicación ya no admite cambios.');
    const committed = await tx.energyTransaction.aggregate({ where: { offerId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } }, _sum: { quantityKwh: true } });
    if (current.hour != null && current.deliveryDate.getTime() !== data.deliveryDate.getTime()) throw new PublicationConflictError(409, 'HOURLY_DATE_IMMUTABLE', 'La fecha horaria es inmutable.');
    if (current.hour == null && current.deliveryDate.getTime() !== data.deliveryDate.getTime() && marketDecimal(committed._sum.quantityKwh ?? 0).gt(0)) throw new PublicationConflictError(409, 'COMMITTED_DATE_IMMUTABLE', 'La fecha tiene compromisos y no puede cambiarse.');
    if (current.hour != null && current.deliveryDate.toISOString().slice(0, 10) <= businessDateInColombia()) throw new PublicationConflictError(409, 'HOURLY_MARKET_CLOSED', 'La fecha de entrega ya está cerrada.');
    if (marketDecimal(committed._sum.quantityKwh ?? 0).gt(marketDecimal(data.quantityKwh))) throw new PublicationConflictError(409, 'PUBLICATION_QUANTITY_BELOW_COMMITTED', 'La cantidad no cubre los compromisos vigentes.');
    return tx.energyOffer.update({ where: { id }, data });
  }),
  cancel: id => database.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "EnergyOffer" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const current = await tx.energyOffer.findUniqueOrThrow({ where: { id } });
    if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_CANCELLABLE', 'La publicación ya no admite cancelación.');
    if (await tx.energyTransaction.findFirst({ where: { offerId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } })) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La franja tiene compromisos y no puede cancelarse.');
    return tx.energyOffer.update({ where: { id }, data: { status: 'CANCELLED' } });
  }),
  expire: now => expireActivePublications(database, now),
};
}

const repository = createOfferRepository();

function numberValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid persisted market number');
  return number;
}

async function dto(offer: OfferRecord, repo: OfferRepository) {
  const { confirmedQuantityKwh, reservedQuantityKwh } = await repo.transactionTotals?.(offer.id) ?? { confirmedQuantityKwh: 0, reservedQuantityKwh: 0 };
  const quantity = marketDecimal(offer.quantityKwh);
  const available = quantity.minus(confirmedQuantityKwh).minus(reservedQuantityKwh);
  const verification = await repo.verification?.(offer);
  return {
    id: offer.id,
    ...(repo.verification ? { verification } : {}),
    hour: offer.hour ?? null,
    publicationId: offer.publicationId ?? null,
    quantityKwh: quantity.toNumber(),
    confirmedQuantityKwh: marketDecimal(confirmedQuantityKwh).toNumber(),
    reservedQuantityKwh: marketDecimal(reservedQuantityKwh).toNumber(),
    availableQuantityKwh: available.isNegative() ? 0 : available.toNumber(),
    pricePerKwh: numberValue(offer.pricePerKwh),
    deliveryDate: offer.deliveryDate.toISOString().slice(0, 10),
    status: offer.status === 'ACTIVE' && verification?.status !== 'APPROVED' ? 'BLOCKED' : offer.status,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

export function createOfferService(repo: OfferRepository = repository, now: () => Date = () => new Date(), expire = repo.expire) {
  return {
    async create(userId: string, body: unknown) {
      const input = validateOfferInput(body, now());
      const offer = await repo.create({
        userId,
        quantityKwh: input.quantityKwh,
        pricePerKwh: input.pricePerKwh,
        deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`),
      });
      return dto(offer, repo);
    },
    async findMine(userId: string) {
      await expire?.(now());
      return Promise.all((await repo.findMine(userId)).map(offer => dto(offer, repo)));
    },
    async update(userId: string, id: string, body: unknown) {
      const input = validateOfferInput(body, now());
      await expire?.(now());
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'OFFER_NOT_FOUND', 'La oferta no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_EDITABLE', 'La oferta ya no puede editarse.');
      if (current.hour != null && input.deliveryDate !== current.deliveryDate.toISOString().slice(0, 10)) throw new PublicationConflictError(409, 'HOURLY_DATE_IMMUTABLE', 'La fecha de una franja publicada no puede cambiarse.');
      const totals = await repo.transactionTotals?.(id) ?? { confirmedQuantityKwh: 0, reservedQuantityKwh: 0 };
      if (marketDecimal(input.quantityKwh).lt(marketDecimal(totals.confirmedQuantityKwh).plus(totals.reservedQuantityKwh))) throw new PublicationConflictError(409, 'PUBLICATION_QUANTITY_BELOW_COMMITTED', 'La cantidad original no puede ser menor que la energía confirmada y reservada.');
      return dto(await repo.update(id, { ...input, deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`) }), repo);
    },
    async cancel(userId: string, id: string) {
      await expire?.(now());
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'OFFER_NOT_FOUND', 'La oferta no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_CANCELLABLE', 'La oferta ya no puede cancelarse.');
      if (await repo.hasBlockingTransaction(id)) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La oferta tiene una reserva o transacción confirmada y no puede cancelarse.');
      return dto(await repo.cancel(id), repo);
    },
  };
}

export type OfferInputError = EnergyMarketInputError;

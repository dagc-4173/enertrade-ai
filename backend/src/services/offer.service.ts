import { prisma } from '@/lib/prisma';
import { validateOfferInput, type EnergyMarketInputError } from '@/services/energy-market.validation';
import { expireActivePublications } from '@/services/publication-expiration.service';

export class PublicationConflictError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

type OfferRecord = {
  id: string;
  userId: string;
  quantityKwh: unknown;
  pricePerKwh: unknown;
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
  transactionTotals?(id: string): Promise<{ confirmedQuantityKwh: number; reservedQuantityKwh: number }>;
  update(id: string, data: { quantityKwh: number; pricePerKwh: number; deliveryDate: Date }): Promise<OfferRecord>;
  cancel(id: string): Promise<OfferRecord>;
  expire?(now: Date): Promise<void>;
}

const repository: OfferRepository = {
  create: data => prisma.energyOffer.create({ data }),
  findMine: userId => prisma.energyOffer.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  findOwn: (userId, id) => prisma.energyOffer.findFirst({ where: { id, userId } }),
  hasBlockingTransaction: async id => Boolean(await prisma.energyTransaction.findFirst({ where: { offerId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } })),
  transactionTotals: async id => {
    const [confirmed, reserved] = await Promise.all([
      prisma.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { offerId: id, status: 'CONFIRMED' } }),
      prisma.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { offerId: id, status: 'PENDING_ACCEPTANCE' } }),
    ]);
    return { confirmedQuantityKwh: numberValue(confirmed._sum.quantityKwh ?? 0), reservedQuantityKwh: numberValue(reserved._sum.quantityKwh ?? 0) };
  },
  update: (id, data) => prisma.energyOffer.update({ where: { id }, data }),
  cancel: id => prisma.energyOffer.update({ where: { id }, data: { status: 'CANCELLED' } }),
  expire: now => expireActivePublications(prisma, now),
};

function numberValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid persisted market number');
  return number;
}

async function dto(offer: OfferRecord, repo: OfferRepository) {
  const { confirmedQuantityKwh, reservedQuantityKwh } = await repo.transactionTotals?.(offer.id) ?? { confirmedQuantityKwh: 0, reservedQuantityKwh: 0 };
  const quantityKwh = numberValue(offer.quantityKwh);
  return {
    id: offer.id,
    quantityKwh,
    confirmedQuantityKwh,
    reservedQuantityKwh,
    availableQuantityKwh: Math.max(0, quantityKwh - confirmedQuantityKwh - reservedQuantityKwh),
    pricePerKwh: numberValue(offer.pricePerKwh),
    deliveryDate: offer.deliveryDate.toISOString().slice(0, 10),
    status: offer.status,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

export function createOfferService(repo: OfferRepository = repository, now: () => Date = () => new Date()) {
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
      await repo.expire?.(now());
      return Promise.all((await repo.findMine(userId)).map(offer => dto(offer, repo)));
    },
    async update(userId: string, id: string, body: unknown) {
      const input = validateOfferInput(body, now());
      await repo.expire?.(now());
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'OFFER_NOT_FOUND', 'La oferta no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_EDITABLE', 'La oferta ya no puede editarse.');
      const totals = await repo.transactionTotals?.(id) ?? { confirmedQuantityKwh: 0, reservedQuantityKwh: 0 };
      if (input.quantityKwh < totals.confirmedQuantityKwh + totals.reservedQuantityKwh) throw new PublicationConflictError(409, 'PUBLICATION_QUANTITY_BELOW_COMMITTED', 'La cantidad original no puede ser menor que la energía confirmada y reservada.');
      return dto(await repo.update(id, { ...input, deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`) }), repo);
    },
    async cancel(userId: string, id: string) {
      await repo.expire?.(now());
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'OFFER_NOT_FOUND', 'La oferta no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_CANCELLABLE', 'La oferta ya no puede cancelarse.');
      if (await repo.hasBlockingTransaction(id)) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La oferta tiene una reserva o transacción confirmada y no puede cancelarse.');
      return dto(await repo.cancel(id), repo);
    },
  };
}

export type OfferInputError = EnergyMarketInputError;

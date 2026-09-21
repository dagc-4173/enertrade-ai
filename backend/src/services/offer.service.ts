import { prisma } from '@/lib/prisma';
import { validateOfferInput, type EnergyMarketInputError } from '@/services/energy-market.validation';

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
  update(id: string, data: { quantityKwh: number; pricePerKwh: number; deliveryDate: Date }): Promise<OfferRecord>;
  cancel(id: string): Promise<OfferRecord>;
}

const repository: OfferRepository = {
  create: data => prisma.energyOffer.create({ data }),
  findMine: userId => prisma.energyOffer.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  findOwn: (userId, id) => prisma.energyOffer.findFirst({ where: { id, userId } }),
  hasBlockingTransaction: async id => Boolean(await prisma.energyTransaction.findFirst({ where: { offerId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } })),
  update: (id, data) => prisma.energyOffer.update({ where: { id }, data }),
  cancel: id => prisma.energyOffer.update({ where: { id }, data: { status: 'CANCELLED' } }),
};

function numberValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid persisted market number');
  return number;
}

function dto(offer: OfferRecord) {
  return {
    id: offer.id,
    quantityKwh: numberValue(offer.quantityKwh),
    pricePerKwh: numberValue(offer.pricePerKwh),
    deliveryDate: offer.deliveryDate.toISOString().slice(0, 10),
    status: offer.status,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

export function createOfferService(repo: OfferRepository = repository) {
  return {
    async create(userId: string, body: unknown) {
      const input = validateOfferInput(body);
      const offer = await repo.create({
        userId,
        quantityKwh: input.quantityKwh,
        pricePerKwh: input.pricePerKwh,
        deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`),
      });
      return dto(offer);
    },
    async findMine(userId: string) {
      return (await repo.findMine(userId)).map(dto);
    },
    async update(userId: string, id: string, body: unknown) {
      const input = validateOfferInput(body);
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'OFFER_NOT_FOUND', 'La oferta no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_EDITABLE', 'La oferta ya no puede editarse.');
      if (await repo.hasBlockingTransaction(id)) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La oferta tiene una reserva o transacción confirmada y no puede editarse.');
      return dto(await repo.update(id, { ...input, deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`) }));
    },
    async cancel(userId: string, id: string) {
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'OFFER_NOT_FOUND', 'La oferta no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_CANCELLABLE', 'La oferta ya no puede cancelarse.');
      if (await repo.hasBlockingTransaction(id)) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La oferta tiene una reserva o transacción confirmada y no puede cancelarse.');
      return dto(await repo.cancel(id));
    },
  };
}

export type OfferInputError = EnergyMarketInputError;

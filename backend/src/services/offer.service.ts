import { prisma } from '@/lib/prisma';
import { validateOfferInput, type EnergyMarketInputError } from '@/services/energy-market.validation';

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
}

const repository: OfferRepository = {
  create: data => prisma.energyOffer.create({ data }),
  findMine: userId => prisma.energyOffer.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
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
  };
}

export type OfferInputError = EnergyMarketInputError;

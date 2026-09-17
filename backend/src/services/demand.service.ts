import { prisma } from '@/lib/prisma';
import { validateDemandInput, type EnergyMarketInputError } from '@/services/energy-market.validation';

type DemandRecord = {
  id: string;
  userId: string;
  quantityKwh: unknown;
  maxPricePerKwh: unknown;
  deliveryDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface DemandRepository {
  create(data: { userId: string; quantityKwh: number; maxPricePerKwh: number; deliveryDate: Date }): Promise<DemandRecord>;
  findMine(userId: string): Promise<DemandRecord[]>;
}

const repository: DemandRepository = {
  create: data => prisma.energyDemand.create({ data }),
  findMine: userId => prisma.energyDemand.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
};

function numberValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid persisted market number');
  return number;
}

function dto(demand: DemandRecord) {
  return {
    id: demand.id,
    quantityKwh: numberValue(demand.quantityKwh),
    maxPricePerKwh: numberValue(demand.maxPricePerKwh),
    deliveryDate: demand.deliveryDate.toISOString().slice(0, 10),
    status: demand.status,
    createdAt: demand.createdAt.toISOString(),
    updatedAt: demand.updatedAt.toISOString(),
  };
}

export function createDemandService(repo: DemandRepository = repository) {
  return {
    async create(userId: string, body: unknown) {
      const input = validateDemandInput(body);
      const demand = await repo.create({
        userId,
        quantityKwh: input.quantityKwh,
        maxPricePerKwh: input.maxPricePerKwh,
        deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`),
      });
      return dto(demand);
    },
    async findMine(userId: string) {
      return (await repo.findMine(userId)).map(dto);
    },
  };
}

export type DemandInputError = EnergyMarketInputError;

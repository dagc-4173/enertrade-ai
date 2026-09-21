import { prisma } from '@/lib/prisma';
import { validateDemandInput, type EnergyMarketInputError } from '@/services/energy-market.validation';
import { PublicationConflictError } from '@/services/offer.service';

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
  findOwn(userId: string, id: string): Promise<DemandRecord | null>;
  hasBlockingTransaction(id: string): Promise<boolean>;
  update(id: string, data: { quantityKwh: number; maxPricePerKwh: number; deliveryDate: Date }): Promise<DemandRecord>;
  cancel(id: string): Promise<DemandRecord>;
}

const repository: DemandRepository = {
  create: data => prisma.energyDemand.create({ data }),
  findMine: userId => prisma.energyDemand.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  findOwn: (userId, id) => prisma.energyDemand.findFirst({ where: { id, userId } }),
  hasBlockingTransaction: async id => Boolean(await prisma.energyTransaction.findFirst({ where: { demandId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } })),
  update: (id, data) => prisma.energyDemand.update({ where: { id }, data }),
  cancel: id => prisma.energyDemand.update({ where: { id }, data: { status: 'CANCELLED' } }),
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
    async update(userId: string, id: string, body: unknown) {
      const input = validateDemandInput(body);
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'DEMAND_NOT_FOUND', 'La demanda no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_EDITABLE', 'La demanda ya no puede editarse.');
      if (await repo.hasBlockingTransaction(id)) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La demanda tiene una reserva o transacción confirmada y no puede editarse.');
      return dto(await repo.update(id, { ...input, deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`) }));
    },
    async cancel(userId: string, id: string) {
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'DEMAND_NOT_FOUND', 'La demanda no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_CANCELLABLE', 'La demanda ya no puede cancelarse.');
      if (await repo.hasBlockingTransaction(id)) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La demanda tiene una reserva o transacción confirmada y no puede cancelarse.');
      return dto(await repo.cancel(id));
    },
  };
}

export type DemandInputError = EnergyMarketInputError;

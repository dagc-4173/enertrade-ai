import { prisma } from '@/lib/prisma';
import { validateDemandInput, type EnergyMarketInputError } from '@/services/energy-market.validation';
import { PublicationConflictError } from '@/services/offer.service';
import { expireActivePublications } from '@/services/publication-expiration.service';

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
  transactionTotals?(id: string): Promise<{ confirmedQuantityKwh: number; reservedQuantityKwh: number }>;
  update(id: string, data: { quantityKwh: number; maxPricePerKwh: number; deliveryDate: Date }): Promise<DemandRecord>;
  cancel(id: string): Promise<DemandRecord>;
  expire?(now: Date): Promise<void>;
}

const repository: DemandRepository = {
  create: data => prisma.energyDemand.create({ data }),
  findMine: userId => prisma.energyDemand.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  findOwn: (userId, id) => prisma.energyDemand.findFirst({ where: { id, userId } }),
  hasBlockingTransaction: async id => Boolean(await prisma.energyTransaction.findFirst({ where: { demandId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } })),
  transactionTotals: async id => {
    const [confirmed, reserved] = await Promise.all([
      prisma.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { demandId: id, status: 'CONFIRMED' } }),
      prisma.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { demandId: id, status: 'PENDING_ACCEPTANCE' } }),
    ]);
    return { confirmedQuantityKwh: numberValue(confirmed._sum.quantityKwh ?? 0), reservedQuantityKwh: numberValue(reserved._sum.quantityKwh ?? 0) };
  },
  update: (id, data) => prisma.energyDemand.update({ where: { id }, data }),
  cancel: id => prisma.energyDemand.update({ where: { id }, data: { status: 'CANCELLED' } }),
  expire: now => expireActivePublications(prisma, now),
};

function numberValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid persisted market number');
  return number;
}

async function dto(demand: DemandRecord, repo: DemandRepository) {
  const { confirmedQuantityKwh, reservedQuantityKwh } = await repo.transactionTotals?.(demand.id) ?? { confirmedQuantityKwh: 0, reservedQuantityKwh: 0 };
  const quantityKwh = numberValue(demand.quantityKwh);
  return {
    id: demand.id,
    quantityKwh,
    confirmedQuantityKwh,
    reservedQuantityKwh,
    availableQuantityKwh: Math.max(0, quantityKwh - confirmedQuantityKwh - reservedQuantityKwh),
    maxPricePerKwh: numberValue(demand.maxPricePerKwh),
    deliveryDate: demand.deliveryDate.toISOString().slice(0, 10),
    status: demand.status,
    createdAt: demand.createdAt.toISOString(),
    updatedAt: demand.updatedAt.toISOString(),
  };
}

export function createDemandService(repo: DemandRepository = repository, now: () => Date = () => new Date()) {
  return {
    async create(userId: string, body: unknown) {
      const input = validateDemandInput(body, now());
      const demand = await repo.create({
        userId,
        quantityKwh: input.quantityKwh,
        maxPricePerKwh: input.maxPricePerKwh,
        deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`),
      });
      return dto(demand, repo);
    },
    async findMine(userId: string) {
      await repo.expire?.(now());
      return Promise.all((await repo.findMine(userId)).map(demand => dto(demand, repo)));
    },
    async update(userId: string, id: string, body: unknown) {
      const input = validateDemandInput(body, now());
      await repo.expire?.(now());
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'DEMAND_NOT_FOUND', 'La demanda no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_EDITABLE', 'La demanda ya no puede editarse.');
      const totals = await repo.transactionTotals?.(id) ?? { confirmedQuantityKwh: 0, reservedQuantityKwh: 0 };
      if (input.quantityKwh < totals.confirmedQuantityKwh + totals.reservedQuantityKwh) throw new PublicationConflictError(409, 'PUBLICATION_QUANTITY_BELOW_COMMITTED', 'La cantidad original no puede ser menor que la energía confirmada y reservada.');
      return dto(await repo.update(id, { ...input, deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`) }), repo);
    },
    async cancel(userId: string, id: string) {
      await repo.expire?.(now());
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'DEMAND_NOT_FOUND', 'La demanda no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_CANCELLABLE', 'La demanda ya no puede cancelarse.');
      if (await repo.hasBlockingTransaction(id)) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La demanda tiene una reserva o transacción confirmada y no puede cancelarse.');
      return dto(await repo.cancel(id), repo);
    },
  };
}

export type DemandInputError = EnergyMarketInputError;

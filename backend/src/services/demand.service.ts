import { latestPublicationVerification } from '@/services/publication-verification.summary';
import { prisma } from '@/lib/prisma';
import { validateDemandInput, marketDecimal, type MarketDecimalValue, type EnergyMarketInputError } from '@/services/energy-market.validation';
import { PublicationConflictError } from '@/services/offer.service';
import { expireActivePublications, businessDateInColombia } from '@/services/publication-expiration.service';

type DemandRecord = {
  id: string;
  userId: string;
  quantityKwh: unknown;
  maxPricePerKwh: unknown;
  hour?: number | null;
  publicationId?: string | null;
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
  transactionTotals?(id: string): Promise<{ confirmedQuantityKwh: MarketDecimalValue; reservedQuantityKwh: MarketDecimalValue }>;
  update(id: string, data: { quantityKwh: number; maxPricePerKwh: number; deliveryDate: Date }): Promise<DemandRecord>;
  cancel(id: string): Promise<DemandRecord>;
  expire?(now: Date): Promise<void>;
  verification?(row: DemandRecord): ReturnType<typeof latestPublicationVerification>;
}

export function createDemandRepository(database = prisma): DemandRepository {
return {
  verification: row => latestPublicationVerification('demand', row.id, row.quantityKwh, row.deliveryDate, row.hour, database),
  create: data => database.energyDemand.create({ data }),
  findMine: userId => database.energyDemand.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  findOwn: (userId, id) => database.energyDemand.findFirst({ where: { id, userId } }),
  hasBlockingTransaction: async id => Boolean(await database.energyTransaction.findFirst({ where: { demandId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } })),
  transactionTotals: async id => {
    const [confirmed, reserved] = await Promise.all([
      database.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { demandId: id, status: 'CONFIRMED' } }),
      database.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { demandId: id, status: 'PENDING_ACCEPTANCE' } }),
    ]);
    return { confirmedQuantityKwh: confirmed._sum.quantityKwh ?? 0, reservedQuantityKwh: reserved._sum.quantityKwh ?? 0 };
  },
  update: (id, data) => database.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "EnergyDemand" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const current = await tx.energyDemand.findUniqueOrThrow({ where: { id } });
    if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_EDITABLE', 'La publicación ya no admite cambios.');
    const committed = await tx.energyTransaction.aggregate({ where: { demandId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } }, _sum: { quantityKwh: true } });
    if (current.hour != null && current.deliveryDate.getTime() !== data.deliveryDate.getTime()) throw new PublicationConflictError(409, 'HOURLY_DATE_IMMUTABLE', 'La fecha horaria es inmutable.');
    if (current.hour == null && current.deliveryDate.getTime() !== data.deliveryDate.getTime() && marketDecimal(committed._sum.quantityKwh ?? 0).gt(0)) throw new PublicationConflictError(409, 'COMMITTED_DATE_IMMUTABLE', 'La fecha tiene compromisos y no puede cambiarse.');
    if (current.hour != null && current.deliveryDate.toISOString().slice(0, 10) <= businessDateInColombia()) throw new PublicationConflictError(409, 'HOURLY_MARKET_CLOSED', 'La fecha de entrega ya está cerrada.');
    if (marketDecimal(committed._sum.quantityKwh ?? 0).gt(marketDecimal(data.quantityKwh))) throw new PublicationConflictError(409, 'PUBLICATION_QUANTITY_BELOW_COMMITTED', 'La cantidad no cubre los compromisos vigentes.');
    return tx.energyDemand.update({ where: { id }, data });
  }),
  cancel: id => database.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "EnergyDemand" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const current = await tx.energyDemand.findUniqueOrThrow({ where: { id } });
    if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_CANCELLABLE', 'La publicación ya no admite cancelación.');
    if (await tx.energyTransaction.findFirst({ where: { demandId: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } })) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La franja tiene compromisos y no puede cancelarse.');
    return tx.energyDemand.update({ where: { id }, data: { status: 'CANCELLED' } });
  }),
  expire: now => expireActivePublications(database, now),
};
}

const repository = createDemandRepository();

function numberValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid persisted market number');
  return number;
}

async function dto(demand: DemandRecord, repo: DemandRepository) {
  const { confirmedQuantityKwh, reservedQuantityKwh } = await repo.transactionTotals?.(demand.id) ?? { confirmedQuantityKwh: 0, reservedQuantityKwh: 0 };
  const quantity = marketDecimal(demand.quantityKwh);
  const available = quantity.minus(confirmedQuantityKwh).minus(reservedQuantityKwh);
  const verification = await repo.verification?.(demand);
  return {
    id: demand.id,
    ...(repo.verification ? { verification } : {}),
    hour: demand.hour ?? null,
    publicationId: demand.publicationId ?? null,
    quantityKwh: quantity.toNumber(),
    confirmedQuantityKwh: marketDecimal(confirmedQuantityKwh).toNumber(),
    reservedQuantityKwh: marketDecimal(reservedQuantityKwh).toNumber(),
    availableQuantityKwh: available.isNegative() ? 0 : available.toNumber(),
    maxPricePerKwh: numberValue(demand.maxPricePerKwh),
    deliveryDate: demand.deliveryDate.toISOString().slice(0, 10),
    status: demand.status === 'ACTIVE' && verification?.status !== 'APPROVED' ? 'BLOCKED' : demand.status,
    createdAt: demand.createdAt.toISOString(),
    updatedAt: demand.updatedAt.toISOString(),
  };
}

export function createDemandService(repo: DemandRepository = repository, now: () => Date = () => new Date(), expire = repo.expire) {
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
      await expire?.(now());
      return Promise.all((await repo.findMine(userId)).map(demand => dto(demand, repo)));
    },
    async update(userId: string, id: string, body: unknown) {
      const input = validateDemandInput(body, now());
      await expire?.(now());
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'DEMAND_NOT_FOUND', 'La demanda no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_EDITABLE', 'La demanda ya no puede editarse.');
      if (current.hour != null && input.deliveryDate !== current.deliveryDate.toISOString().slice(0, 10)) throw new PublicationConflictError(409, 'HOURLY_DATE_IMMUTABLE', 'La fecha de una franja publicada no puede cambiarse.');
      const totals = await repo.transactionTotals?.(id) ?? { confirmedQuantityKwh: 0, reservedQuantityKwh: 0 };
      if (marketDecimal(input.quantityKwh).lt(marketDecimal(totals.confirmedQuantityKwh).plus(totals.reservedQuantityKwh))) throw new PublicationConflictError(409, 'PUBLICATION_QUANTITY_BELOW_COMMITTED', 'La cantidad original no puede ser menor que la energía confirmada y reservada.');
      return dto(await repo.update(id, { ...input, deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`) }), repo);
    },
    async cancel(userId: string, id: string) {
      await expire?.(now());
      const current = await repo.findOwn(userId, id);
      if (!current) throw new PublicationConflictError(404, 'DEMAND_NOT_FOUND', 'La demanda no existe.');
      if (current.status !== 'ACTIVE') throw new PublicationConflictError(409, 'PUBLICATION_NOT_CANCELLABLE', 'La demanda ya no puede cancelarse.');
      if (await repo.hasBlockingTransaction(id)) throw new PublicationConflictError(409, 'PUBLICATION_TRANSACTION_LOCKED', 'La demanda tiene una reserva o transacción confirmada y no puede cancelarse.');
      return dto(await repo.cancel(id), repo);
    },
  };
}

export type DemandInputError = EnergyMarketInputError;

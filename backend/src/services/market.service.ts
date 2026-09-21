import { prisma } from '@/lib/prisma';
import { expireActivePublications } from '@/services/publication-expiration.service';
import type { MatchingDemandLike, MatchingOfferLike, MatchingReadRepository } from '@/services/matching.service';

function value(input: unknown) { return String(input); }
function scale(input: string) { return input.split('.')[1]?.length ?? 0; }
function integer(input: string, target: number) { const [whole, fraction = ''] = input.split('.'); return BigInt(`${whole}${fraction.padEnd(target, '0').slice(0, target)}`); }
function subtract(left: string, right: string) {
  const precision = Math.max(scale(left), scale(right));
  const result = integer(left, precision) - integer(right, precision);
  const digits = result.toString().padStart(precision + 1, '0');
  return precision === 0 ? digits : `${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
}
function positive(input: string) { return integer(input, scale(input)) > 0n; }

type BalanceDatabase = {
  energyTransaction: { aggregate(args: { _sum: { quantityKwh: true }; where: Record<string, unknown> }): Promise<{ _sum: { quantityKwh: unknown } }> }
}

export async function reservedPublicationQuantity(database: BalanceDatabase, field: 'offerId' | 'demandId', id: string) {
  const result = await database.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { [field]: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } })
  return value(result._sum.quantityKwh ?? '0')
}

export async function availablePublicationQuantity(database: BalanceDatabase, field: 'offerId' | 'demandId', id: string, quantityKwh: unknown) {
  return subtract(value(quantityKwh), await reservedPublicationQuantity(database, field, id))
}

export { positive as hasAvailablePublicationQuantity }

type MatchingBalanceDatabase = BalanceDatabase & {
  energyOffer: { findMany(args: { where: { status: 'ACTIVE' }; orderBy: { createdAt: 'asc' } }): Promise<MatchingOfferLike[]> }
  energyDemand: { findMany(args: { where: { status: 'ACTIVE' }; orderBy: { createdAt: 'asc' } }): Promise<MatchingDemandLike[]> }
}

export function createAvailableMatchingReadRepository(database: MatchingBalanceDatabase): MatchingReadRepository {
  return {
    async listActiveOffers() {
      const rows = await database.energyOffer.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })
      return (await Promise.all(rows.map(async row => ({ ...row, quantityKwh: await availablePublicationQuantity(database, 'offerId', row.id, row.quantityKwh) })))).filter(row => positive(row.quantityKwh))
    },
    async listActiveDemands() {
      const rows = await database.energyDemand.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })
      return (await Promise.all(rows.map(async row => ({ ...row, quantityKwh: await availablePublicationQuantity(database, 'demandId', row.id, row.quantityKwh) })))).filter(row => positive(row.quantityKwh))
    },
  }
}

export function createMarketService(database = prisma, now: () => Date = () => new Date()) {
  return {
    async offers(userId: string) {
      await expireActivePublications(database, now());
      const rows = await database.energyOffer.findMany({ where: { status: 'ACTIVE', userId: { not: userId } }, orderBy: { createdAt: 'asc' } });
      return (await Promise.all(rows.map(async row => ({ id: row.id, availableQuantityKwh: await availablePublicationQuantity(database, 'offerId', row.id, row.quantityKwh), pricePerKwh: value(row.pricePerKwh), deliveryDate: row.deliveryDate.toISOString().slice(0, 10), status: row.status })))).filter(row => positive(row.availableQuantityKwh));
    },
    async demands(userId: string) {
      await expireActivePublications(database, now());
      const rows = await database.energyDemand.findMany({ where: { status: 'ACTIVE', userId: { not: userId } }, orderBy: { createdAt: 'asc' } });
      return (await Promise.all(rows.map(async row => ({ id: row.id, availableQuantityKwh: await availablePublicationQuantity(database, 'demandId', row.id, row.quantityKwh), maxPricePerKwh: value(row.maxPricePerKwh), deliveryDate: row.deliveryDate.toISOString().slice(0, 10), status: row.status })))).filter(row => positive(row.availableQuantityKwh));
    },
  };
}
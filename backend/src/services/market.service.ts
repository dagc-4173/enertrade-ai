import {publicationApproved} from './publication-trading-eligibility';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { expireActivePublications, businessDateInColombia, type PublicationExpirationScope } from '@/services/publication-expiration.service';
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
  energyOffer: { findMany(args: { where: { status: 'ACTIVE'; userId?: { in: string[] } }; orderBy: { createdAt: 'asc' } }): Promise<MatchingOfferLike[]> }
  energyDemand: { findMany(args: { where: { status: 'ACTIVE'; userId?: { in: string[] } }; orderBy: { createdAt: 'asc' } }): Promise<MatchingDemandLike[]> }
}

export function createAvailableMatchingReadRepository(database: MatchingBalanceDatabase, scope?: PublicationExpirationScope): MatchingReadRepository {
  return {
    async listActiveOffers() {
      let rows = await database.energyOffer.findMany({ where: { status: 'ACTIVE', ...(scope ? { userId: { in: [...scope.userIds] } } : {}) }, orderBy: { createdAt: 'asc' } })
      rows = (await Promise.all(rows.map(async row => await publicationApproved(database as unknown as Prisma.TransactionClient, 'offer', row) ? row : null))).filter((row): row is NonNullable<typeof row> => row !== null)
      return (await Promise.all(rows.filter(row => row.hour == null || (row.deliveryDate instanceof Date ? row.deliveryDate.toISOString() : row.deliveryDate).slice(0, 10) > businessDateInColombia()).map(async row => ({ ...row, quantityKwh: await availablePublicationQuantity(database, 'offerId', row.id, row.quantityKwh) })))).filter(row => positive(row.quantityKwh))
    },
    async listActiveDemands() {
      let rows = await database.energyDemand.findMany({ where: { status: 'ACTIVE', ...(scope ? { userId: { in: [...scope.userIds] } } : {}) }, orderBy: { createdAt: 'asc' } })
      rows = (await Promise.all(rows.map(async row => await publicationApproved(database as unknown as Prisma.TransactionClient, 'demand', row) ? row : null))).filter((row): row is NonNullable<typeof row> => row !== null)
      return (await Promise.all(rows.filter(row => row.hour == null || (row.deliveryDate instanceof Date ? row.deliveryDate.toISOString() : row.deliveryDate).slice(0, 10) > businessDateInColombia()).map(async row => ({ ...row, quantityKwh: await availablePublicationQuantity(database, 'demandId', row.id, row.quantityKwh) })))).filter(row => positive(row.quantityKwh))
    },
  }
}

export function createMarketService(database = prisma, now: () => Date = () => new Date(), scope?: PublicationExpirationScope) {
  return {
    async offers(userId: string) {
      await expireActivePublications(database, now(), scope);
      let rows = await database.energyOffer.findMany({ where: { status: 'ACTIVE', userId: { not: userId, ...(scope ? { in: [...scope.userIds] } : {}) } }, orderBy: { createdAt: 'asc' } });
      rows = (await Promise.all(rows.map(async row => await publicationApproved(database, 'offer', row) ? row : null))).filter((row): row is NonNullable<typeof row> => row !== null);
      return (await Promise.all(rows.filter(row => row.hour == null || row.deliveryDate.toISOString().slice(0, 10) > businessDateInColombia(now())).map(async row => ({ id: row.id, hour: row.hour ?? null, publicationId: row.publicationId ?? null, availableQuantityKwh: await availablePublicationQuantity(database, 'offerId', row.id, row.quantityKwh), pricePerKwh: value(row.pricePerKwh), deliveryDate: row.deliveryDate.toISOString().slice(0, 10), status: row.status })))).filter(row => positive(row.availableQuantityKwh));
    },
    async demands(userId: string) {
      await expireActivePublications(database, now(), scope);
      let rows = await database.energyDemand.findMany({ where: { status: 'ACTIVE', userId: { not: userId, ...(scope ? { in: [...scope.userIds] } : {}) } }, orderBy: { createdAt: 'asc' } });
      rows = (await Promise.all(rows.map(async row => await publicationApproved(database, 'demand', row) ? row : null))).filter((row): row is NonNullable<typeof row> => row !== null);
      return (await Promise.all(rows.filter(row => row.hour == null || row.deliveryDate.toISOString().slice(0, 10) > businessDateInColombia(now())).map(async row => ({ id: row.id, hour: row.hour ?? null, publicationId: row.publicationId ?? null, availableQuantityKwh: await availablePublicationQuantity(database, 'demandId', row.id, row.quantityKwh), maxPricePerKwh: value(row.maxPricePerKwh), deliveryDate: row.deliveryDate.toISOString().slice(0, 10), status: row.status })))).filter(row => positive(row.availableQuantityKwh));
    },
  };
}
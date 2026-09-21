import { prisma } from '@/lib/prisma';
import { expireActivePublications } from '@/services/publication-expiration.service';

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

export function createMarketService(database = prisma, now: () => Date = () => new Date()) {
  async function reserved(field: 'offerId' | 'demandId', id: string) {
    const result = await database.energyTransaction.aggregate({ _sum: { quantityKwh: true }, where: { [field]: id, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } } });
    return value(result._sum.quantityKwh ?? '0');
  }
  return {
    async offers(userId: string) {
      await expireActivePublications(database, now());
      const rows = await database.energyOffer.findMany({ where: { status: 'ACTIVE', userId: { not: userId } }, orderBy: { createdAt: 'asc' } });
      return (await Promise.all(rows.map(async row => ({ id: row.id, availableQuantityKwh: subtract(value(row.quantityKwh), await reserved('offerId', row.id)), pricePerKwh: value(row.pricePerKwh), deliveryDate: row.deliveryDate.toISOString().slice(0, 10), status: row.status })))).filter(row => positive(row.availableQuantityKwh));
    },
    async demands(userId: string) {
      await expireActivePublications(database, now());
      const rows = await database.energyDemand.findMany({ where: { status: 'ACTIVE', userId: { not: userId } }, orderBy: { createdAt: 'asc' } });
      return (await Promise.all(rows.map(async row => ({ id: row.id, availableQuantityKwh: subtract(value(row.quantityKwh), await reserved('demandId', row.id)), maxPricePerKwh: value(row.maxPricePerKwh), deliveryDate: row.deliveryDate.toISOString().slice(0, 10), status: row.status })))).filter(row => positive(row.availableQuantityKwh));
    },
  };
}
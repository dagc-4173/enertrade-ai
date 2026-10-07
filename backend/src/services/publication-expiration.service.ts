import { prisma } from '@/lib/prisma';

import type { Prisma } from '@/generated/prisma/client';
type ExpirationStore = {
  energyOffer?: { updateMany?(args: Prisma.EnergyOfferUpdateManyArgs): Promise<unknown> };
  energyDemand?: { updateMany?(args: Prisma.EnergyDemandUpdateManyArgs): Promise<unknown> };
  energyTransaction?: { updateMany?(args: Prisma.EnergyTransactionUpdateManyArgs): Promise<unknown> };
};

export type PublicationExpirationScope = { userIds: readonly string[] };

export function businessDateInColombia(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isPublicationExpired(deliveryDate: string, today: string) {
  return deliveryDate < today;
}

export async function expireActivePublications(store: ExpirationStore = prisma, now = new Date(), scope?: PublicationExpirationScope) {
  if (scope && scope.userIds.length === 0) return;
  const owners = scope ? { in: [...scope.userIds] } : undefined;
  const cutoff = new Date(`${businessDateInColombia(now)}T00:00:00.000Z`);
  // Pending hourly terms close when delivery day starts; confirmed terms remain immutable.
  await store.energyTransaction?.updateMany?.({ where: { status: 'PENDING_ACCEPTANCE', hour: { not: null }, deliveryDate: { lte: cutoff }, ...(owners ? { sellerUserId: owners, buyerUserId: owners, offer: { userId: owners }, demand: { userId: owners } } : {}) }, data: { status: 'CANCELLED', cancelledAt: now } });
  await Promise.all([
    store.energyOffer?.updateMany?.({ where: { status: 'ACTIVE', ...(owners ? { userId: owners } : {}), OR: [{ hour: null, deliveryDate: { lt: cutoff } }, { hour: { not: null }, deliveryDate: { lte: cutoff } }] }, data: { status: 'EXPIRED' } }),
    store.energyDemand?.updateMany?.({ where: { status: 'ACTIVE', ...(owners ? { userId: owners } : {}), OR: [{ hour: null, deliveryDate: { lt: cutoff } }, { hour: { not: null }, deliveryDate: { lte: cutoff } }] }, data: { status: 'EXPIRED' } }),
  ]);
}
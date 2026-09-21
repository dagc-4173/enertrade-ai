import { prisma } from '@/lib/prisma';

type ExpirationStore = {
  energyOffer?: { updateMany?(args: { where: { status: 'ACTIVE'; deliveryDate: { lt: Date } }; data: { status: 'EXPIRED' } }): Promise<unknown> };
  energyDemand?: { updateMany?(args: { where: { status: 'ACTIVE'; deliveryDate: { lt: Date } }; data: { status: 'EXPIRED' } }): Promise<unknown> };
};

export function businessDateInColombia(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isPublicationExpired(deliveryDate: string, today: string) {
  return deliveryDate < today;
}

export async function expireActivePublications(store: ExpirationStore = prisma, now = new Date()) {
  const cutoff = new Date(`${businessDateInColombia(now)}T00:00:00.000Z`);
  await Promise.all([
    store.energyOffer?.updateMany?.({ where: { status: 'ACTIVE', deliveryDate: { lt: cutoff } }, data: { status: 'EXPIRED' } }),
    store.energyDemand?.updateMany?.({ where: { status: 'ACTIVE', deliveryDate: { lt: cutoff } }, data: { status: 'EXPIRED' } }),
  ]);
}
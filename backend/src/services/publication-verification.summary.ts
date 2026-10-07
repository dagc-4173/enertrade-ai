import type { Prisma } from '@/generated/prisma/client';
import { quantityInCents, publicationVerificationRule } from './publication-verification.rules';
import { prisma } from '@/lib/prisma';
export async function latestPublicationVerification(kind: 'offer' | 'demand', id: string, quantityKwh: unknown, deliveryDate: Date, hour: number | null | undefined, database: Pick<Prisma.TransactionClient, 'publicationVerification' | 'simulationCapacityProfile'> = prisma) {
 const row = await database.publicationVerification.findFirst({ where: kind === 'offer' ? { offerId: id } : { demandId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
 if (!row) return null;
 const input = row.inputSnapshot as { quantityKwh: string; deliveryDate: string; hour: number | null; profileVersion: number | null };
 const result = row.resultSnapshot as { reason: string; maxQuantityKwh: string | null };
 const profile = await database.simulationCapacityProfile.findFirst({ where: { userId: row.userId, kind }, orderBy: { version: 'desc' }, select: { id: true } });
 const current = row.ruleId === publicationVerificationRule.id && row.ruleVersion === publicationVerificationRule.version && (profile?.id ?? null) === row.profileId && quantityInCents(input.quantityKwh) === quantityInCents(String(quantityKwh)) && input.deliveryDate === deliveryDate.toISOString().slice(0,10) && input.hour === (hour ?? null);
 return { id: row.id, status: current ? row.resultStatus : 'OUTDATED', reason: current ? result.reason.replace('límite horario declarado', 'límite de capacidad declarado') : 'La publicación o el perfil cambió después de la verificación. Verifica nuevamente.', maxQuantityKwh: result.maxQuantityKwh, profileVersion: input.profileVersion, ruleId: row.ruleId, ruleVersion: row.ruleVersion, createdAt: row.createdAt.toISOString(), source: 'USER_DECLARED_SIMULATION' };
}

import type { Prisma } from '@/generated/prisma/client';
import { latestPublicationVerification } from './publication-verification.summary';
import { publicationVerificationRule } from './publication-verification.rules';
export type VerifiablePublication = { id: string; quantityKwh: unknown; deliveryDate: Date | string; hour?: number | null; status: string };
export async function publicationApproved(database: Pick<Prisma.TransactionClient, 'publicationVerification' | 'simulationCapacityProfile'>, kind: 'offer' | 'demand', row: VerifiablePublication) {
 if (row.status !== 'ACTIVE' || row.hour == null) return false;
 const verification = await latestPublicationVerification(kind,row.id,row.quantityKwh,new Date(row.deliveryDate),row.hour,database);
 return verification?.status === 'APPROVED' && verification.ruleId === publicationVerificationRule.id && verification.ruleVersion === publicationVerificationRule.version;
}
export async function pairApproved(database: Prisma.TransactionClient, offerId: string, demandId: string) {
 const [offer,demand]=await Promise.all([database.energyOffer.findUnique({where:{id:offerId}}),database.energyDemand.findUnique({where:{id:demandId}})]);
 if (!offer || !demand) return false;
 const results=await Promise.all([publicationApproved(database,'offer',offer),publicationApproved(database,'demand',demand)]);
 return results.every(Boolean);
}

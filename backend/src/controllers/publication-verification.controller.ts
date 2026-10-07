import express, { Router, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/lib/prisma';
import { verifyDeclaredCapacity, validateCapacityProfile, publicationVerificationRule, type CapacityLimit } from '@/services/publication-verification.rules';
export function createPublicationVerificationRouter(database = prisma, auth = requireAuth()) {
 const router = Router(); router.use(auth);
 const validKind = (kind: unknown): kind is 'offer' | 'demand' => kind === 'offer' || kind === 'demand';
 const validId = (id: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
 router.get('/profiles/:kind', async (req, res, next) => {
  if (!validKind(req.params.kind)) { res.status(400).json({ error: 'INVALID_PROFILE_KIND' }); return; }
  try { res.json({ profile: await database.simulationCapacityProfile.findFirst({ where: { userId: req.authUser!.id, kind: req.params.kind }, orderBy: { version: 'desc' }, select: { id: true, kind: true, version: true, source: true, limits: true, createdAt: true } }) }); } catch(error) { next(error); }
 });
 router.post('/profiles', express.json({ limit: '8kb' }), async (req, res, next) => {
  let input: ReturnType<typeof validateCapacityProfile>;
  try { input = validateCapacityProfile(req.body); } catch { res.status(400).json({ error: 'INVALID_CAPACITY_PROFILE', message: 'Configura horas únicas de 0 a 23 y límites no negativos con máximo dos decimales.' }); return; }
  try {
   const profile = await database.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${req.authUser!.id}::uuid FOR UPDATE`;
    const previous = await tx.simulationCapacityProfile.findFirst({ where: { userId: req.authUser!.id, kind: input.kind }, orderBy: { version: 'desc' } });
    return tx.simulationCapacityProfile.create({ data: { userId: req.authUser!.id, kind: input.kind, version: (previous?.version ?? 0) + 1, source: publicationVerificationRule.source, limits: input.limits }, select: { id: true, kind: true, version: true, source: true, limits: true, createdAt: true } });
   }); res.status(201).json({ profile });
  } catch(error) { next(error); }
 });
 router.post('/:kind/:id', express.json({ limit: '1kb' }), async (req, res, next) => {
  const { kind, id } = req.params;
  if (!validKind(kind) || !validId(id) || Object.keys(req.body ?? {}).length) { res.status(400).json({ error: 'INVALID_VERIFICATION_REQUEST' }); return; }
  try {
   const result = await database.$transaction(async tx => {
    if (kind === 'offer') await tx.$queryRaw`SELECT "id" FROM "EnergyOffer" WHERE "id" = ${id}::uuid AND "userId" = ${req.authUser!.id}::uuid FOR UPDATE`;
    else await tx.$queryRaw`SELECT "id" FROM "EnergyDemand" WHERE "id" = ${id}::uuid AND "userId" = ${req.authUser!.id}::uuid FOR UPDATE`;
    const publication = kind === 'offer' ? await tx.energyOffer.findFirst({ where: { id, userId: req.authUser!.id } }) : await tx.energyDemand.findFirst({ where: { id, userId: req.authUser!.id } });
    if (!publication) return null;
    const profile = await tx.simulationCapacityProfile.findFirst({ where: { userId: req.authUser!.id, kind }, orderBy: { version: 'desc' } });
    const verdict = verifyDeclaredCapacity(publication.quantityKwh.toString(), publication.hour, profile?.limits as CapacityLimit[] | null ?? null);
    const verification = await tx.publicationVerification.create({ data: { userId: req.authUser!.id, ...(kind === 'offer' ? { offerId: id } : { demandId: id }), profileId: profile?.id ?? null, ruleId: verdict.ruleId, ruleVersion: verdict.ruleVersion, resultStatus: verdict.status, inputSnapshot: { quantityKwh: publication.quantityKwh.toString(), deliveryDate: publication.deliveryDate.toISOString().slice(0,10), hour: publication.hour, profileVersion: profile?.version ?? null }, resultSnapshot: verdict }, select: { id: true, createdAt: true } });
    return { ...verdict, ...verification, profileVersion: profile?.version ?? null };
   });
   if (!result) { res.status(404).json({ error: 'PUBLICATION_NOT_FOUND', message: 'La publicación propia no existe.' }); return; }
   res.status(201).json({ verification: result });
  } catch(error) { next(error); }
 });
 const errors: ErrorRequestHandler = (error, _req, res, _next) => { res.status(error?.type === 'entity.parse.failed' ? 400 : error?.status === 413 ? 413 : 500).json({ error: 'VERIFICATION_OPERATION_FAILED', message: 'No fue posible procesar la verificación simulada.' }); };
 router.use(errors); return router;
}
export const router = createPublicationVerificationRouter();

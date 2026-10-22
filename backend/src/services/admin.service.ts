import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
export class AdminError extends Error {
 constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export const adminUserSelect = { id: true, name: true, email: true, role: true, status: true, createdAt: true } as const;
export function parseUserChange(body: unknown) {
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError(400, 'INVALID_ADMIN_CHANGE', 'La solicitud no es válida.');
 const value = body as Record<string, unknown>;
 if (Object.keys(value).some(key => !['role', 'status', 'reason'].includes(key)) ||
   (value.role !== undefined && (typeof value.role !== 'string' || !['USER','ADMIN'].includes(value.role))) ||
   (value.status !== undefined && (typeof value.status !== 'string' || !['ACTIVE','BLOCKED'].includes(value.status))) ||
   (value.role === undefined && value.status === undefined) || typeof value.reason !== 'string' || value.reason.trim().length < 5 || value.reason.length > 500)
   throw new AdminError(400, 'INVALID_ADMIN_CHANGE', 'Selecciona rol o estado y un motivo de 5 a 500 caracteres.');
 return { ...(value.role === undefined ? {} : { role: value.role as 'USER'|'ADMIN' }), ...(value.status === undefined ? {} : { status: value.status as 'ACTIVE'|'BLOCKED' }), reason: value.reason.trim() };
}
export function assertAdminRemains(before: { role: string; status: string }, after: { role: string; status: string }, activeAdmins: number) {
 if (before.role === 'ADMIN' && before.status === 'ACTIVE' && (after.role !== 'ADMIN' || after.status !== 'ACTIVE') && activeAdmins <= 1)
  throw new AdminError(409, 'LAST_ADMIN_REQUIRED', 'Debe permanecer al menos un administrador activo.');
}
export async function changeUser(actorId: string, targetId: string, input: unknown, database = prisma) {
 const change = parseUserChange(input);
 return database.$transaction(async tx => {
  // Shared by all role/status changes and the local bootstrap command. READ COMMITTED
  // takes a fresh snapshot after the lock, so concurrent demotions see committed state.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(41820719)`;
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: adminUserSelect });
  if (actor?.role !== 'ADMIN' || actor.status !== 'ACTIVE') throw new AdminError(403, 'ADMIN_REQUIRED', 'Se requiere un administrador activo.');
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${targetId}::uuid FOR UPDATE`;
  const before = await tx.user.findUnique({ where: { id: targetId }, select: adminUserSelect });
  if (!before) throw new AdminError(404, 'USER_NOT_FOUND', 'La cuenta no existe.');
  const after = { role: change.role ?? before.role, status: change.status ?? before.status };
  assertAdminRemains(before, after, await tx.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }));
  if (actorId === targetId && (after.role !== before.role || after.status !== before.status)) throw new AdminError(409, 'SELF_ADMIN_CHANGE_FORBIDDEN', 'Pide a otro administrador que modifique tu rol o estado.');
  if (before.role === after.role && before.status === after.status) throw new AdminError(409, 'ADMIN_CHANGE_UNCHANGED', 'La cuenta ya tiene ese rol y estado.');
  const effects = { sessions: 0, offers: 0, demands: 0, negotiations: 0 };
  // Cancel pending negotiations first, matching the transaction -> offer -> demand lock order.
  if (after.status === 'BLOCKED') {
   effects.negotiations = (await tx.energyTransaction.updateMany({ where: { status: 'PENDING_ACCEPTANCE', OR: [{ sellerUserId: targetId }, { buyerUserId: targetId }] }, data: { status: 'CANCELLED', cancelledAt: new Date() } })).count;
   effects.offers = (await tx.energyOffer.updateMany({ where: { userId: targetId, status: 'ACTIVE' }, data: { status: 'CANCELLED' } })).count;
   effects.demands = (await tx.energyDemand.updateMany({ where: { userId: targetId, status: 'ACTIVE' }, data: { status: 'CANCELLED' } })).count;
  }
  const user = await tx.user.update({ where: { id: targetId }, data: after, select: adminUserSelect });
  await tx.passwordReset.deleteMany({where:{userId:targetId}});
  effects.sessions = (await tx.authSession.deleteMany({ where: { userId: targetId } })).count;
  await tx.adminAudit.create({ data: { actorId, targetId, action: 'USER_ACCESS_CHANGED', reason: change.reason,
   before: { role: before.role, status: before.status }, after: { ...after, effects } } });
  return { user, effects };
 }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000, maxWait: 10000 });
}

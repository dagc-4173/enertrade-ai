import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { Prisma, type SimulatedPaymentAttempt, type EnergyTransaction } from '@/generated/prisma/client';
import type { PublicationExpirationScope } from '@/services/publication-expiration.service';

export class SimulatedPaymentError extends Error {
 constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function paymentInput(body: unknown) {
 if (!object(body) || Object.keys(body).length !== 3 || Object.keys(body).some(key => !['transactionId','requestKey','scenario'].includes(key)) || !uuid(body.transactionId) || !uuid(body.requestKey) || typeof body.scenario !== 'string' || !['APPROVED','REJECTED','PENDING'].includes(body.scenario)) throw new SimulatedPaymentError(400,'INVALID_SIMULATED_PAYMENT','Selecciona un resultado de prueba y una transacción válida. El importe se calcula en el servidor.');
 return { transactionId: body.transactionId, requestKey: body.requestKey, scenario: body.scenario as 'APPROVED' | 'REJECTED' | 'PENDING' };
}
function participant(transaction: EnergyTransaction | null, userId: string, scope?: PublicationExpirationScope) {
 if (!transaction || (transaction.buyerUserId !== userId && transaction.sellerUserId !== userId) || (scope && (!scope.userIds.includes(transaction.buyerUserId) || !scope.userIds.includes(transaction.sellerUserId)))) throw new SimulatedPaymentError(404,'PAYMENT_TRANSACTION_NOT_FOUND','La transacción no está disponible para tu cuenta.');
 return transaction;
}
function payable(transaction: EnergyTransaction, userId: string) {
 if (transaction.buyerUserId !== userId) throw new SimulatedPaymentError(403,'PAYMENT_BUYER_REQUIRED','Solo el comprador puede registrar o resolver el pago simulado.');
 if (transaction.status !== 'CONFIRMED') throw new SimulatedPaymentError(409,'PAYMENT_REQUIRES_CONFIRMED_TRANSACTION','El acuerdo debe estar confirmado por ambas partes antes del pago simulado.');
}
function dto(attempt: SimulatedPaymentAttempt) {
 return { id: attempt.id, transactionId: attempt.transactionId, scenario: attempt.scenario, status: attempt.status, amountCop: attempt.amountCop.toString(), currency: attempt.currency, providerId: attempt.providerId, providerVersion: attempt.providerVersion, createdAt: attempt.createdAt.toISOString(), resolvedAt: attempt.resolvedAt?.toISOString() ?? null, receiptReference: attempt.receiptReference, simulated: true as const, contractSnapshot: attempt.contractSnapshot };
}
function snapshot(transaction: EnergyTransaction): Prisma.InputJsonObject {
 return { transactionId: transaction.id, offerId: transaction.offerId, demandId: transaction.demandId, quantityKwh: transaction.quantityKwh.toString(), pricePerKwh: transaction.pricePerKwh.toString(), totalAmountCop: transaction.totalAmountCop.toString(), deliveryDate: transaction.deliveryDate.toISOString().slice(0,10), hour: transaction.hour, confirmedAt: transaction.confirmedAt?.toISOString() ?? null };
}
export function createSimulatedPaymentService(database = prisma, now: () => Date = () => new Date(), scope?: PublicationExpirationScope) {
 const transactionWhere = (id: string): Prisma.EnergyTransactionWhereUniqueInput => ({ id, ...(scope ? { sellerUserId: { in: [...scope.userIds] }, buyerUserId: { in: [...scope.userIds] }, offer: { userId: { in: [...scope.userIds] } }, demand: { userId: { in: [...scope.userIds] } } } : {}) });
 return {
  async payables(userId: string) {
   return database.$transaction(async tx => {
    const base: Prisma.EnergyTransactionWhereInput = { buyerUserId: userId, status: 'CONFIRMED', ...(scope ? { sellerUserId: { in: [...scope.userIds] }, buyerUserId: { equals: userId, in: [...scope.userIds] }, offer: { userId: { in: [...scope.userIds] } }, demand: { userId: { in: [...scope.userIds] } } } : {}) };
    const unpaidCount = await tx.energyTransaction.count({ where: { ...base, AND: [{ paymentAttempts: { none: { status: 'APPROVED' } } }, { paymentAttempts: { none: { status: 'PENDING' } } }] } });
    const pendingCount = await tx.energyTransaction.count({ where: { ...base, AND: [{ paymentAttempts: { none: { status: 'APPROVED' } } }, { paymentAttempts: { some: { status: 'PENDING' } } }] } });
    return { unpaidCount, pendingCount, totalCount: unpaidCount + pendingCount, simulated: true };
   }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  },
  async list(userId: string, transactionId: string) {
   if (!uuid(transactionId)) throw new SimulatedPaymentError(400,'INVALID_TRANSACTION_ID','El identificador de transacción no es válido.');
  const transaction = participant(await database.energyTransaction.findUnique({ where: transactionWhere(transactionId) }),userId,scope);
   const attempts = await database.simulatedPaymentAttempt.findMany({ where: { transactionId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
   return { transactionId, amountCop: transaction.totalAmountCop.toString(), status: attempts.some(row=>row.status==='APPROVED') ? 'PAID' : attempts.some(row=>row.status==='PENDING') ? 'PENDING' : 'UNPAID', simulated: true, attempts: attempts.map(dto) };
  },
  async create(userId: string, body: unknown) {
   const input = paymentInput(body);
   return database.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "EnergyTransaction" WHERE "id" = ${input.transactionId}::uuid FOR UPDATE`;
    const transaction = participant(await tx.energyTransaction.findUnique({ where: transactionWhere(input.transactionId) }),userId,scope); payable(transaction,userId);
    const replay = await tx.simulatedPaymentAttempt.findUnique({ where: { transactionId_requestKey: { transactionId: input.transactionId, requestKey: input.requestKey } } });
    if (replay) {
      if (replay.scenario !== input.scenario) throw new SimulatedPaymentError(409,'PAYMENT_REQUEST_KEY_REUSED','La clave de este intento ya se utilizó con otro resultado de prueba.');
      return { attempt: dto(replay), replayed: true };
    }
    if (await tx.simulatedPaymentAttempt.findFirst({ where: { transactionId: input.transactionId, status: 'APPROVED' } })) throw new SimulatedPaymentError(409,'SIMULATED_PAYMENT_ALREADY_APPROVED','La transacción ya tiene un pago simulado aprobado.');
    if (await tx.simulatedPaymentAttempt.findFirst({ where: { transactionId: input.transactionId, status: 'PENDING' } })) throw new SimulatedPaymentError(409,'SIMULATED_PAYMENT_PENDING','Resuelve el intento pendiente antes de iniciar otro.');
    const attempt = await tx.simulatedPaymentAttempt.create({ data: { transactionId: transaction.id, payerUserId: userId, requestKey: input.requestKey, scenario: input.scenario, status: input.scenario, amountCop: transaction.totalAmountCop, currency: 'COP', providerId: 'internal-simulator', providerVersion: '1.0.0', contractSnapshot: snapshot(transaction), resolvedAt: input.scenario === 'PENDING' ? null : now(), receiptReference: input.scenario === 'APPROVED' ? `SIM-${randomUUID().toUpperCase()}` : null } });
    return { attempt: dto(attempt), replayed: false };
   }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  },
  async resolve(userId: string, id: string, body: unknown) {
   if (!uuid(id) || !object(body) || Object.keys(body).length!==1 || typeof body.outcome !== 'string' || !['APPROVED','REJECTED'].includes(body.outcome)) throw new SimulatedPaymentError(400,'INVALID_PAYMENT_RESOLUTION','Selecciona aprobado o rechazado para resolver el intento pendiente.');
   const previous = await database.simulatedPaymentAttempt.findUnique({ where: { id } });
   if (!previous) throw new SimulatedPaymentError(404,'PAYMENT_ATTEMPT_NOT_FOUND','El intento no existe.');
   return database.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "EnergyTransaction" WHERE "id" = ${previous.transactionId}::uuid FOR UPDATE`;
    const transaction = participant(await tx.energyTransaction.findUnique({ where: transactionWhere(previous.transactionId) }),userId,scope); payable(transaction,userId);
    const attempt = await tx.simulatedPaymentAttempt.findUniqueOrThrow({ where: { id } });
    if (attempt.status !== 'PENDING') {
      if (attempt.status === body.outcome) return dto(attempt);
      throw new SimulatedPaymentError(409,'PAYMENT_ATTEMPT_FINAL','El intento ya tiene un resultado definitivo.');
    }
    const updated = await tx.simulatedPaymentAttempt.update({ where: { id }, data: { status: body.outcome as 'APPROVED' | 'REJECTED', resolvedAt: now(), receiptReference: body.outcome === 'APPROVED' ? `SIM-${randomUUID().toUpperCase()}` : null } });
    return dto(updated);
   }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  },
 };
}

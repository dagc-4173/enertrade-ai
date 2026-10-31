import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import type { PublicationExpirationScope } from './publication-expiration.service';
export class SettlementError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const fail = (s: number, c: string, m: string): never => { throw new SettlementError(s, c, m); };
const uuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s);
const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length >= 8 && s.length <= 1000;
export function settlementInput(v: unknown) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return fail(400, 'INVALID_SETTLEMENT', 'Solicitud no válida.');
    const b = v as Record<string, unknown>;
    if (!uuid(b.requestKey) || !['REPORT', 'ACCEPT', 'DISPUTE', 'RESOLVE'].includes(String(b.action)))
        return fail(400, 'INVALID_SETTLEMENT', 'Solicitud no válida.');
    const action = b.action as 'REPORT' | 'ACCEPT' | 'DISPUTE' | 'RESOLVE';
    const keys = ['action', 'requestKey', ...(action === 'REPORT' ? ['quantityKwh', 'evidenceReference'] : action === 'RESOLVE' ? ['quantityKwh', 'reason'] : action === 'DISPUTE' ? ['reason'] : [])];
    if (Object.keys(b).length !== keys.length || Object.keys(b).some(k => !keys.includes(k)))
        return fail(400, 'INVALID_SETTLEMENT', 'Campos inesperados.');
    if (['REPORT', 'RESOLVE'].includes(action) && (typeof b.quantityKwh !== 'string' || !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/.test(b.quantityKwh)))
        return fail(400, 'INVALID_QUANTITY', 'Usa una cantidad no negativa con hasta dos decimales.');
    if (action === 'REPORT' && !text(b.evidenceReference))
        return fail(400, 'EVIDENCE_REQUIRED', 'Incluye una referencia de evidencia de 8 a 1000 caracteres.');
    if (['DISPUTE', 'RESOLVE'].includes(action) && !text(b.reason))
        return fail(400, 'REASON_REQUIRED', 'Incluye un motivo de 8 a 1000 caracteres.');
    return { action, requestKey: b.requestKey, quantityKwh: b.quantityKwh as string | undefined, evidenceReference: typeof b.evidenceReference === 'string' ? b.evidenceReference.trim() : undefined, reason: typeof b.reason === 'string' ? b.reason.trim() : undefined };
}
const MoneyDecimal = Prisma.Decimal.clone({ precision: 60 });
export function settlementAmounts(q: string, p: string, total: string) {
    const seller = new MoneyDecimal(q).mul(p).toDecimalPlaces(7), refund = new MoneyDecimal(total).sub(seller);
    if (seller.isNegative() || refund.isNegative())
        return fail(409, 'QUANTITY_EXCEEDS_AGREEMENT', 'Cantidad fuera del acuerdo.');
    return { sellerAmountCop: seller.toFixed(7), refundAmountCop: refund.toFixed(7) };
}
export function deliveryEnded(date: Date, hour: number | null, now: Date) { return now.getTime() >= new Date(date.toISOString().slice(0, 10) + 'T00:00:00-05:00').getTime() + (hour === null ? 24 : hour + 1) * 3600000; }
type Event = {
    requestKey: string;
    actorId: string;
    actorRole: string;
    payload: string;
    action: string;
    at: string;
};
export function createSettlementService(database = prisma, now: () => Date = () => new Date(), scope?: PublicationExpirationScope) {
    const scoped = (t: {
        buyerUserId: string;
        sellerUserId: string;
    }) => !scope || (scope.userIds.includes(t.buyerUserId) && scope.userIds.includes(t.sellerUserId));
    type Row = Awaited<ReturnType<typeof database.simulatedSettlement.findUnique>>;
    function dto(t: {
        id: string;
        quantityKwh: Prisma.Decimal;
        pricePerKwh: Prisma.Decimal;
        totalAmountCop: Prisma.Decimal;
        deliveryDate: Date;
        hour: number | null;
    }, r: Row, eligible: boolean) { return { transactionId: t.id, simulated: true, status: r?.status ?? (eligible ? 'HELD' : 'LEGACY_OR_UNFUNDED'), quantityKwh: t.quantityKwh.toString(), pricePerKwh: t.pricePerKwh.toString(), reservedAmountCop: t.totalAmountCop.toString(), deliveryEnded: deliveryEnded(t.deliveryDate, t.hour, now()), declaredKwh: r?.declaredKwh?.toString() ?? null, acceptedKwh: r?.acceptedKwh?.toString() ?? null, sellerAmountCop: r?.sellerAmountCop?.toString() ?? null, refundAmountCop: r?.refundAmountCop?.toString() ?? null, evidenceReference: r?.evidenceReference ?? null, disputeReason: r?.disputeReason ?? null, resolutionReason: r?.resolutionReason ?? null, events: r ? (r.events as unknown as Event[]).map(e => ({ action: e.action, actorRole: e.actorRole, at: e.at })) : [] }; }
    async function actor(id: string) { const u = await database.user.findUnique({ where: { id } }); if (!u || u.status !== 'ACTIVE')
        return fail(403, 'ACTIVE_USER_REQUIRED', 'Se requiere una cuenta activa.'); return u; }
    return {
        async get(userId: string, id: string) {
            if (!uuid(id))
                return fail(400, 'INVALID_TRANSACTION', 'Referencia no válida.');
            const u = await actor(userId);
            const t = await database.energyTransaction.findUnique({ where: { id }, include: { paymentAttempts: true, settlement: true } });
            if (!t || !scoped(t) || (t.buyerUserId !== userId && t.sellerUserId !== userId && u.role !== 'ADMIN'))
                return fail(404, 'TRANSACTION_NOT_FOUND', 'Transacción no disponible.');
            return dto(t, t.settlement, t.status === 'CONFIRMED' && t.paymentAttempts.some(p => p.status === 'APPROVED' && p.providerVersion === '2.0.0'));
        },
        async disputes(userId: string) {
            if ((await actor(userId)).role !== 'ADMIN')
                return fail(403, 'ADMIN_REQUIRED', 'Solo administradores pueden revisar disputas.');
            const rows = await database.simulatedSettlement.findMany({ where: { status: 'DISPUTED', ...(scope ? { transaction: { buyerUserId: { in: [...scope.userIds] }, sellerUserId: { in: [...scope.userIds] } } } : {}) }, include: { transaction: true }, orderBy: [{ updatedAt: 'asc' }, { transactionId: 'asc' }], take: 100 });
            return { disputes: rows.map(r => dto(r.transaction, r, true)), limit: 100 };
        },
        async act(userId: string, id: string, body: unknown) {
            if (!uuid(id))
                return fail(400, 'INVALID_TRANSACTION', 'Referencia no válida.');
            const input = settlementInput(body);
            return database.$transaction(async (tx) => {
                await tx.$queryRaw `SELECT "id" FROM "EnergyTransaction" WHERE "id" = ${id}::uuid FOR UPDATE`;
                const u = await tx.user.findUnique({ where: { id: userId } });
                if (!u || u.status !== 'ACTIVE')
                    return fail(403, 'ACTIVE_USER_REQUIRED', 'Se requiere una cuenta activa.');
                const t = await tx.energyTransaction.findUnique({ where: { id }, include: { paymentAttempts: true, settlement: true } });
                if (!t || !scoped(t) || (t.buyerUserId !== userId && t.sellerUserId !== userId && !(input.action === 'RESOLVE' && u.role === 'ADMIN')))
                    return fail(404, 'TRANSACTION_NOT_FOUND', 'Transacción no disponible.');
                if (input.action === 'REPORT' && t.sellerUserId !== userId)
                    return fail(403, 'SELLER_REQUIRED', 'Solo el vendedor registra la entrega.');
                if (['ACCEPT', 'DISPUTE'].includes(input.action) && t.buyerUserId !== userId)
                    return fail(403, 'BUYER_REQUIRED', 'Solo el comprador revisa la entrega.');
                if (input.action === 'RESOLVE' && (u.role !== 'ADMIN' || [t.buyerUserId, t.sellerUserId].includes(userId)))
                    return fail(403, 'INDEPENDENT_ADMIN_REQUIRED', 'Se requiere un administrador ajeno al acuerdo.');
                if (t.status !== 'CONFIRMED' || !t.paymentAttempts.some(p => p.status === 'APPROVED' && p.providerVersion === '2.0.0'))
                    return fail(409, 'PROTECTED_PAYMENT_REQUIRED', 'Se requiere un nuevo pago simulado aprobado con retención. Los pagos anteriores no se modifican.');
                const r = t.settlement, events = r ? (r.events as unknown as Event[]) : [], payload = JSON.stringify(input), prior = events.find(e => e.requestKey === input.requestKey);
                if (prior) {
                    if (prior.actorId !== userId || prior.payload !== payload)
                        return fail(409, 'REQUEST_KEY_REUSED', 'La solicitud ya tiene otros datos.');
                    return dto(t, r, true);
                }
                if (!deliveryEnded(t.deliveryDate, t.hour, now()))
                    return fail(409, 'DELIVERY_NOT_ENDED', 'Espera al final del periodo de entrega en Colombia.');
                const state = r?.status ?? 'HELD';
                if (state === 'SETTLED')
                    return fail(409, 'ALREADY_SETTLED', 'Liquidación definitiva.');
                let data: Prisma.SimulatedSettlementUncheckedCreateInput = { transactionId: id, status: state, events: [] };
                if (input.action === 'REPORT') {
                    if (state !== 'HELD')
                        return fail(409, 'INVALID_TRANSITION', 'Ya existe entrega o disputa.');
                    if (new Prisma.Decimal(input.quantityKwh!).gt(t.quantityKwh))
                        return fail(409, 'QUANTITY_EXCEEDS_AGREEMENT', 'La entrega supera el acuerdo.');
                    data = { ...data, status: 'REVIEW', declaredKwh: input.quantityKwh, evidenceReference: input.evidenceReference };
                }
                else if (input.action === 'DISPUTE') {
                    if (!['HELD', 'REVIEW'].includes(state))
                        return fail(409, 'INVALID_TRANSITION', 'La entrega ya está en disputa.');
                    data = { ...data, status: 'DISPUTED', disputeReason: input.reason };
                }
                else {
                    if ((input.action === 'ACCEPT' && state !== 'REVIEW') || (input.action === 'RESOLVE' && state !== 'DISPUTED'))
                        return fail(409, 'INVALID_TRANSITION', 'Acción no disponible.');
                    const q = input.action === 'ACCEPT' ? r!.declaredKwh!.toString() : input.quantityKwh!;
                    if (new Prisma.Decimal(q).gt(t.quantityKwh))
                        return fail(409, 'QUANTITY_EXCEEDS_AGREEMENT', 'La cantidad supera el acuerdo.');
                    data = { ...data, status: 'SETTLED', acceptedKwh: q, ...settlementAmounts(q, t.pricePerKwh.toString(), t.totalAmountCop.toString()), ...(input.action === 'RESOLVE' ? { resolutionReason: input.reason } : {}) };
                }
                data.events = [...events, { requestKey: input.requestKey, actorId: userId, actorRole: input.action === 'RESOLVE' ? 'ADMIN' : t.buyerUserId === userId ? 'BUYER' : 'SELLER', payload, action: input.action, at: now().toISOString() }] as unknown as Prisma.InputJsonValue;
                const update = { ...data };
                delete (update as Partial<typeof data>).transactionId;
                const saved = await tx.simulatedSettlement.upsert({ where: { transactionId: id }, create: data, update });
                return dto(t, saved, true);
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
        }
    };
}

import { apiRequest, postJson, ApiError } from './apiClient';
export type Settlement = {
    transactionId: string;
    simulated: true;
    status: 'HELD' | 'REVIEW' | 'DISPUTED' | 'SETTLED' | 'LEGACY_OR_UNFUNDED';
    quantityKwh: string;
    pricePerKwh: string;
    reservedAmountCop: string;
    deliveryEnded: boolean;
    declaredKwh: string | null;
    acceptedKwh: string | null;
    sellerAmountCop: string | null;
    refundAmountCop: string | null;
    evidenceReference: string | null;
    disputeReason: string | null;
    resolutionReason: string | null;
    events: {
        action: string;
        actorRole: string;
        at: string;
    }[];
};
const decimal = (v: unknown) => typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v);
export function isSettlement(v: unknown): v is Settlement {
    if (!v || typeof v !== 'object')
        return false;
    const s = v as Record<string, unknown>;
    return s.simulated === true && typeof s.transactionId === 'string' && ['HELD', 'REVIEW', 'DISPUTED', 'SETTLED', 'LEGACY_OR_UNFUNDED'].includes(String(s.status)) && typeof s.deliveryEnded === 'boolean' && ['quantityKwh', 'pricePerKwh', 'reservedAmountCop'].every(k => decimal(s[k])) && ['declaredKwh', 'acceptedKwh', 'sellerAmountCop', 'refundAmountCop'].every(k => s[k] === null || decimal(s[k])) && ['evidenceReference', 'disputeReason', 'resolutionReason'].every(k => s[k] === null || typeof s[k] === 'string') && Array.isArray(s.events) && s.events.every(e => e && typeof e.action === 'string' && typeof e.actorRole === 'string' && typeof e.at === 'string') && !(s.status === 'SETTLED' && ['acceptedKwh', 'sellerAmountCop', 'refundAmountCop'].some(k => s[k] === null));
}
function parse(status: number, data: unknown) { if (status !== 200 || !isSettlement(data))
    throw new ApiError('response', 'La respuesta de entrega no es válida.', status); return data; }
export async function getSettlement(id: string, signal?: AbortSignal) { const r = await apiRequest<unknown>(`/simulated-settlements/${encodeURIComponent(id)}`, { credentials: 'include', signal }); const result = parse(r.status, r.data);
    if (result.transactionId !== id) throw new ApiError('response', 'La respuesta corresponde a otro acuerdo.', r.status);
    return result; }
export async function actSettlement(id: string, input: Record<string, string>) { const r = await postJson<unknown>(`/simulated-settlements/${encodeURIComponent(id)}`, input, { credentials: 'include' }); const result = parse(r.status, r.data);
    if (result.transactionId !== id) throw new ApiError('response', 'La respuesta corresponde a otro acuerdo.', r.status);
    return result; }
export async function getDisputes(signal?: AbortSignal) { const r = await apiRequest<{
    disputes: unknown[];
}>('/simulated-settlements/disputes', { credentials: 'include', signal }); if (r.status !== 200 || !Array.isArray(r.data?.disputes) || !r.data.disputes.every(isSettlement))
    throw new ApiError('response', 'No fue posible consultar las disputas.', r.status); return r.data.disputes as Settlement[]; }

export const publicationVerificationRule = { id: 'declared-hourly-capacity', version: '1.0.0', source: 'USER_DECLARED_SIMULATION' } as const;
export type CapacityLimit = { hour: number; maxQuantityKwh: string };
export type VerificationResult = { status: 'APPROVED' | 'REJECTED' | 'NO_REFERENCE'; reason: string; quantityKwh: string; maxQuantityKwh: string | null; hour: number | null; ruleId: string; ruleVersion: string; source: string };
export function quantityInCents(value: string) {
 if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new Error('INVALID_QUANTITY');
 const [whole, fraction = ''] = value.split('.'); return BigInt(`${whole}${fraction.padEnd(2,'0')}`);
}
export function verifyDeclaredCapacity(quantityKwh: string, hour: number | null, limits: CapacityLimit[] | null): VerificationResult {
 const quantity = quantityInCents(quantityKwh);
 if (quantity <= 0n) throw new Error('INVALID_QUANTITY');
 const reference = limits?.find(limit => limit.hour === hour);
 const base = { quantityKwh, hour, maxQuantityKwh: reference?.maxQuantityKwh ?? null, ruleId: publicationVerificationRule.id, ruleVersion: publicationVerificationRule.version, source: publicationVerificationRule.source };
 if (hour == null) return { ...base, status: 'NO_REFERENCE', reason: 'La publicación histórica no tiene una hora de entrega verificable.' };
 if (!reference) return { ...base, status: 'NO_REFERENCE', reason: 'No existe un límite de simulación configurado para esta hora.' };
 return quantity <= quantityInCents(reference.maxQuantityKwh) ? { ...base, status: 'APPROVED', reason: 'La cantidad cumple el límite de capacidad declarado para la simulación.' } : { ...base, status: 'REJECTED', reason: 'La cantidad supera el límite de capacidad declarado para la simulación.' };
}
export function validateCapacityProfile(body: unknown) {
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_CAPACITY_PROFILE');
 const input = body as Record<string, unknown>;
 if (Object.keys(input).some(key => !['kind','limits'].includes(key)) || !['offer','demand'].includes(String(input.kind)) || !Array.isArray(input.limits) || input.limits.length < 1 || input.limits.length > 24) throw new Error('INVALID_CAPACITY_PROFILE');
 const seen = new Set<number>();
 const limits = input.limits.map(value => {
   if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_CAPACITY_PROFILE');
   const row = value as Record<string, unknown>;
   if (Object.keys(row).some(key => !['hour','maxQuantityKwh'].includes(key)) || typeof row.hour !== 'number' || !Number.isInteger(row.hour) || row.hour < 0 || row.hour > 23 || seen.has(row.hour) || typeof row.maxQuantityKwh !== 'string') throw new Error('INVALID_CAPACITY_PROFILE');
   if (quantityInCents(row.maxQuantityKwh) > 99999999999999999999n) throw new Error('INVALID_CAPACITY_PROFILE');
   seen.add(row.hour); return { hour: row.hour, maxQuantityKwh: row.maxQuantityKwh };
 });
 return { kind: input.kind as 'offer' | 'demand', limits };
}

import { ApiError, apiRequest, postJson } from './apiClient'
export type VerificationKind = 'offer' | 'demand'
export type CapacityProfile = { id: string; kind: VerificationKind; version: number; source: string; limits: { hour: number; maxQuantityKwh: string }[]; createdAt: string }
export type PublicationVerification = { id: string; status: 'APPROVED' | 'REJECTED' | 'NO_REFERENCE' | 'OUTDATED'; reason: string; maxQuantityKwh: string | null; profileVersion: number | null; ruleId: string; ruleVersion: string; createdAt: string; source: string }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
export function isPublicationVerification(value: unknown): value is PublicationVerification {
 return object(value) && typeof value.id === 'string' && ['APPROVED','REJECTED','NO_REFERENCE','OUTDATED'].includes(String(value.status)) && ['reason','ruleId','ruleVersion','createdAt'].every(key=>typeof value[key]==='string') && value.source === 'USER_DECLARED_SIMULATION' && (value.maxQuantityKwh===null || typeof value.maxQuantityKwh==='string') && (value.profileVersion===null || Number.isInteger(value.profileVersion))
}
export async function getCapacityProfile(kind: VerificationKind, signal?: AbortSignal): Promise<CapacityProfile | null> {
 const response = await apiRequest<unknown>(`/publication-verifications/profiles/${kind}`, { credentials:'include', signal })
 if (response.status!==200 || !object(response.data)) throw new ApiError('response','No fue posible consultar el perfil simulado.',response.status)
 const value=response.data.profile
 if (value===null) return null
 if (!object(value) || value.kind!==kind || !Number.isInteger(value.version) || !Array.isArray(value.limits) || value.source!=='USER_DECLARED_SIMULATION') throw new ApiError('response','El perfil simulado tiene un formato inesperado.',response.status)
 return value as unknown as CapacityProfile
}
export async function saveCapacityProfile(kind: VerificationKind, limits: {hour:number;maxQuantityKwh:string}[]) {
 const response=await postJson<unknown>('/publication-verifications/profiles',{kind,limits},{credentials:'include'})
 if(response.status!==201 || !object(response.data) || !object(response.data.profile)) throw new ApiError('response','No fue posible guardar el perfil simulado.',response.status)
 return response.data.profile as unknown as CapacityProfile
}
export async function verifyPublication(kind: VerificationKind, id:string) {
 const response=await postJson<unknown>(`/publication-verifications/${kind}/${encodeURIComponent(id)}`,{},{credentials:'include'})
 if(response.status!==201 || !object(response.data) || !isPublicationVerification(response.data.verification)) throw new ApiError('response','La verificación tiene un formato inesperado.',response.status)
 return response.data.verification
}

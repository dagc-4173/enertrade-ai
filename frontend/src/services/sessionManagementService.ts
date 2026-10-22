import {apiRequest,ApiError} from './apiClient'
export interface ManagedSession {id:string;createdAt:string;expiresAt:string;isCurrent:boolean}
export function parseSessions(data:unknown):ManagedSession[] {
 if(!data || typeof data!=='object' || !('sessions' in data) || !Array.isArray(data.sessions) || !data.sessions.every(row=>row && typeof row.id==='string' && typeof row.createdAt==='string' && Number.isFinite(Date.parse(row.createdAt)) && typeof row.expiresAt==='string' && Number.isFinite(Date.parse(row.expiresAt)) && typeof row.isCurrent==='boolean') || data.sessions.filter(row=>row.isCurrent).length!==1 || new Set(data.sessions.map(row=>row.id)).size!==data.sessions.length)throw new ApiError('response','El listado de sesiones no es válido.')
 return data.sessions.map(({id,createdAt,expiresAt,isCurrent})=>({id,createdAt,expiresAt,isCurrent}))
}
export async function getSessions(signal?:AbortSignal){return parseSessions((await apiRequest('/auth/sessions',{credentials:'include',signal})).data)}
export async function revokeSessions(id?:string){const {data}=await apiRequest(id?`/auth/sessions/${encodeURIComponent(id)}/revoke`:'/auth/sessions/revoke-others',{method:'POST',credentials:'include',json:{}});if(!data || typeof data!=='object' || !('revoked' in data) || !Number.isSafeInteger(data.revoked) || Number(data.revoked)<0)throw new ApiError('response','La confirmación de cierre de sesiones no es válida.');return Number(data.revoked)}

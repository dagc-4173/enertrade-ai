import {ApiError,apiRequest} from './apiClient'
import {parseAuthUser,type AuthUser} from './authService'
export type ManagedUser = AuthUser & {role:'USER'|'ADMIN';status:'ACTIVE'|'BLOCKED'}
export type UserPage = {users:ManagedUser[];total:number;page:number;pageSize:number}
export type AuditEntry = {id:string;action:string;reason:string;createdAt:string;actor:{name:string;email:string};target:{name:string;email:string};before:{role:string;status:string};after:{role:string;status:string}}
export type AuditPage = {entries:AuditEntry[];total:number;page:number;pageSize:number}
const object=(value:unknown):value is Record<string,unknown>=>value!==null && typeof value==='object' && !Array.isArray(value)
const access=(value:unknown):boolean=>object(value) && ['USER','ADMIN'].includes(String(value.role)) && typeof value.role==='string' && ['ACTIVE','BLOCKED'].includes(String(value.status)) && typeof value.status==='string'
const identity=(value:unknown):boolean=>object(value) && typeof value.name==='string' && typeof value.email==='string'
function page(value:unknown):asserts value is Record<string,unknown> & {total:number;page:number;pageSize:number} {
 if(!object(value) || !Number.isSafeInteger(value.total) || Number(value.total)<0 || !Number.isSafeInteger(value.page) || Number(value.page)<1 || value.pageSize!==25)throw new ApiError('response','La API devolvió una página administrativa no válida.')
}
export function parseUsers(value:unknown):UserPage {
 page(value)
 if(!Array.isArray(value.users) || value.users.length>25)throw new ApiError('response','La API devolvió un listado de cuentas no válido.')
 const users=value.users.map(item=>{if(!access(item))throw new ApiError('response','La API devolvió permisos de cuenta no válidos.');return parseAuthUser({user:item}) as ManagedUser})
 return {users,total:value.total,page:value.page,pageSize:value.pageSize}
}
export function parseAudit(value:unknown):AuditPage {
 page(value)
 if(!Array.isArray(value.entries) || value.entries.length>25 || !value.entries.every(item=>object(item) && typeof item.id==='string' && typeof item.action==='string' && typeof item.reason==='string' && typeof item.createdAt==='string' && Number.isFinite(Date.parse(item.createdAt)) && identity(item.actor) && identity(item.target) && access(item.before) && access(item.after)))throw new ApiError('response','La API devolvió una auditoría no válida.')
 return {entries:value.entries as AuditEntry[],total:value.total,page:value.page,pageSize:value.pageSize}
}
export async function loadAdminPage(tab:'users'|'audit',params:URLSearchParams,signal:AbortSignal) {
 const {data}=await apiRequest(`/admin/${tab}?${params}`,{credentials:'include',signal})
 return tab==='users'?parseUsers(data):parseAudit(data)
}

import { apiRequest, ApiError } from './apiClient'
export interface AuthUser { id: string; email: string; name: string; createdAt: string; role?: 'USER'|'ADMIN'; status?: 'ACTIVE'|'BLOCKED' }
export interface LoginInput { email: string; password: string }
export interface RegisterInput extends LoginInput { name: string }
export function parseAuthUser(data: unknown): AuthUser {
 if (data !== null && typeof data === 'object' && 'user' in data) {
  const user = data.user
  if (user !== null && typeof user === 'object' && 'id' in user && 'email' in user && 'name' in user && 'createdAt' in user &&
   typeof user.id === 'string' && user.id.length > 0 && typeof user.email === 'string' && typeof user.name === 'string' && typeof user.createdAt === 'string' && Number.isFinite(Date.parse(user.createdAt)))
   {
   if (('role' in user && (typeof user.role !== 'string' || !['USER','ADMIN'].includes(user.role))) || ('status' in user && (typeof user.status !== 'string' || !['ACTIVE','BLOCKED'].includes(user.status)))) throw new ApiError('response', 'La API devolvió permisos de sesión no válidos.')
   return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, ...('role' in user && user.role === 'ADMIN' ? {role: 'ADMIN' as const} : 'role' in user && user.role === 'USER' ? {role: 'USER' as const} : {}), ...('status' in user && user.status === 'BLOCKED' ? {status: 'BLOCKED' as const} : 'status' in user && user.status === 'ACTIVE' ? {status: 'ACTIVE' as const} : {}) }
   }
 }
 throw new ApiError('response', 'La API devolvió una sesión no válida.')
}
export async function login(input: LoginInput) {
 return parseAuthUser((await apiRequest('/auth/login', { method: 'POST', json: input, credentials: 'include' })).data)
}
export async function register(input: RegisterInput) {
 return parseAuthUser((await apiRequest('/auth/register', { method: 'POST', json: input, credentials: 'include' })).data)
}
export async function me() {
 return parseAuthUser((await apiRequest('/auth/me', { credentials: 'include' })).data)
}
export async function logout() {
 await apiRequest('/auth/logout', { method: 'POST', json: {}, credentials: 'include' })
}
export function authErrorMessage(error: unknown) {
 return error instanceof ApiError ? error.serverMessage ?? error.message : 'No fue posible completar la solicitud.'
}

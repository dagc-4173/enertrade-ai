import * as api from '../services/authService'
import { ApiError } from '../services/apiClient'
import type { AuthUser, LoginInput } from '../services/authService'
export type AuthState = { status: 'checking' | 'anonymous' | 'authenticated' | 'error'; user: AuthUser | null; error: string | null }
export function createAuthStore(service = api) {
 let state: AuthState = { status: 'checking', user: null, error: null }
 const listeners = new Set<() => void>()
 let revision = 0
 const set = (next: AuthState) => { state = next; listeners.forEach(listener => listener()) }
 return {
  getSnapshot: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  async refresh() {
   const current = ++revision
   if (state.status !== 'authenticated') set({ status: 'checking', user: null, error: null })
   try { const user = await service.me(); if (current === revision) set({ status: 'authenticated', user, error: null }) }
   catch (error) {
    if (current === revision) set(error instanceof ApiError && error.status === 401
     ? { status: 'anonymous', user: null, error: null }
     : { status: 'error', user: null, error: api.authErrorMessage(error) })
   }
  },
  async login(input: LoginInput) {
   const current = ++revision
   const user = await service.login(input)
   if (current === revision) set({ status: 'authenticated', user, error: null })
  },
  async logout() {
   await service.logout()
   ++revision
   set({ status: 'anonymous', user: null, error: null })
  },
 }
}
export const authStore = createAuthStore()

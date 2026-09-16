import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { authStore, type AuthState } from './authStore'
import { AuthPage } from '../pages/AuthPage'
export function AuthView({ state, children, retry }: { state: AuthState; children: ReactNode; retry: () => void }) {
 if (state.status === 'checking') return <div className="auth-page" role="status">Comprobando sesión…</div>
 if (state.status === 'error') return <div className="auth-page"><p role="alert">{state.error}</p><button onClick={retry}>Reintentar</button></div>
 if (state.status !== 'authenticated' || !state.user) return <AuthPage />
 return <>{children}</>
}
export function AuthGate({ children }: { children: ReactNode }) {
 const state = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot)
 useEffect(() => {
  void authStore.refresh()
  // Recheck the server session when returning to the tab; no persisted client token.
  const refresh = () => { void authStore.refresh() }
  window.addEventListener('focus', refresh)
  return () => window.removeEventListener('focus', refresh)
 }, [])
 return <AuthView state={state} retry={() => { void authStore.refresh() }}>{children}</AuthView>
}

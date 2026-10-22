import {ResetPassword} from '../pages/ResetPassword'
import {recoveryTokenFromHash} from '../services/passwordRecoveryService'
import { useState, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { authStore, type AuthState } from './authStore'
import { AuthPage } from '../pages/AuthPage'
export function AuthView({ state, children, retry }: { state: AuthState; children: ReactNode; retry: () => void }) {
 if (state.status === 'checking') return <div className="auth-page" role="status">Comprobando sesión…</div>
 if (state.status === 'error') return <div className="auth-page"><p role="alert">{state.error}</p><button onClick={retry}>Reintentar</button></div>
 if (state.status !== 'authenticated' || !state.user) return <AuthPage />
 return <>{children}</>
}
export function AuthGate({ children }: { children: ReactNode }) {
 const [resetToken,setResetToken]=useState(()=>typeof window==='undefined'?null:recoveryTokenFromHash(window.location.hash))
 const state = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot)
 useEffect(() => {
  if(recoveryTokenFromHash(window.location.hash)!==null)window.history.replaceState(null,'',window.location.pathname+window.location.search)
  void authStore.refresh()
  // Recheck the server session when returning to the tab; no persisted client token.
  const refresh = () => { void authStore.refresh() }
  const recoverFromHash=()=>{const token=recoveryTokenFromHash(window.location.hash);if(token!==null){setResetToken(token);window.history.replaceState(null,'',window.location.pathname+window.location.search)}}
  window.addEventListener('hashchange',recoverFromHash)
  window.addEventListener('focus', refresh)
  const timer = window.setInterval(() => { if (authStore.getSnapshot().status === 'authenticated') refresh() }, 60_000)
  return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer);window.removeEventListener('hashchange',recoverFromHash) }
 }, [])
 if(resetToken!==null)return <ResetPassword token={resetToken} onReturn={()=>{setResetToken(null);void authStore.refresh()}} />
 return <AuthView state={state} retry={() => { void authStore.refresh() }}>{children}</AuthView>
}

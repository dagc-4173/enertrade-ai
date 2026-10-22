import { useState, type FormEvent } from 'react'
import { authStore } from '../auth/authStore'
import { register, authErrorMessage } from '../services/authService'
import {requestPasswordRecovery} from '../services/passwordRecoveryService'
import './AuthPage.css'
export function AuthPage({ initialMode = 'login' }: { initialMode?: 'login' | 'register' | 'forgot' }) {
 const [mode, setMode] = useState(initialMode)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const [notice, setNotice] = useState<string | null>(null)
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (busy) return
  const form = event.currentTarget
  const data = new FormData(form)
  const email = String(data.get('email') ?? '')
  const password = String(data.get('password') ?? '')
  setBusy(true); setError(null); setNotice(null)
  try {
   if (mode === 'forgot') {setNotice(await requestPasswordRecovery(email))}
   else if (mode === 'register') {
    await register({ email, password, name: String(data.get('name') ?? '') })
    form.reset(); setMode('login'); setNotice('Cuenta creada. Inicia sesión con tus credenciales.')
   } else { await authStore.login({ email, password }) }
  } catch (failure) { setError(authErrorMessage(failure)) }
  finally { setBusy(false) }
 }
 return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-title">
  <div className="brand-block"><div className="brand-mark">ET</div><div><p>EnerTrade AI</p><span>Prototipo energético</span></div></div>
  <h1 id="auth-title">{mode === 'forgot' ? 'Recuperar contraseña' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
  <p>{mode === 'forgot' ? 'Introduce el correo de tu cuenta. Te enviaremos un enlace temporal para elegir una contraseña nueva.' : 'Accede a los datasets y pronósticos de la plataforma.'}</p>
  <form key={mode} onSubmit={submit}>
   {mode === 'register' && <label>Nombre<input name="name" autoComplete="name" required maxLength={100} disabled={busy} /></label>}
   <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} /></label>
   {mode !== 'forgot' && <label>Contraseña<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 12 : 1} maxLength={128} disabled={busy} /></label>}
   {mode === 'register' && <small>Entre 12 y 128 caracteres. Puedes usar una frase larga.</small>}
   {error && <p role="alert">{error}</p>}
   {notice && <p role="status">{notice}</p>}
   <button className="primary-button" disabled={busy} type="submit">{busy ? 'Procesando…' : mode === 'forgot' ? 'Enviar enlace de recuperación' : mode === 'login' ? 'Entrar' : 'Registrarme'}</button>
  </form>
  {mode === 'login' && <button type="button" className="auth-switch" disabled={busy} onClick={()=>{setMode('forgot');setError(null);setNotice(null)}}>¿Olvidaste tu contraseña?</button>}
  <button type="button" className="auth-switch" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setNotice(null) }}>
   {mode === 'login' ? '¿No tienes cuenta? Crear cuenta' : 'Ya tengo cuenta. Iniciar sesión'}
  </button>
 </section></main>
}

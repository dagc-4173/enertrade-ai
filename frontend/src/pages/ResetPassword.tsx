import {useState,type FormEvent} from 'react'
import {resetPassword} from '../services/passwordRecoveryService'
import {authErrorMessage} from '../services/authService'
import './AuthPage.css'
export function ResetPassword({token,onReturn}:{token:string;onReturn:()=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(token?'':'El enlace no es válido. Solicita uno nuevo desde la pantalla de inicio de sesión.'),[done,setDone]=useState(false)
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();if(busy || !token)return
  const form=event.currentTarget,data=new FormData(form),password=String(data.get('password')??'')
  if(password!==String(data.get('confirmation')??'')){setError('Las contraseñas no coinciden.');return}
  setBusy(true);setError('')
  try{await resetPassword(token,password);form.reset();setDone(true)}catch(error){setError(authErrorMessage(error))}finally{setBusy(false)}
 }
 return <main className="auth-page"><section className="auth-card" aria-labelledby="reset-title"><p className="eyebrow">EnerTrade AI</p><h1 id="reset-title">Nueva contraseña</h1>{done?<p role="status">Tu contraseña se actualizó y las sesiones de tu cuenta se cerraron. Inicia sesión nuevamente.</p>:<><p>El enlace vence en 30 minutos y solo puede usarse una vez. Entre 12 y 128 caracteres; puedes usar una frase larga.</p><form onSubmit={submit} aria-busy={busy}><label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy || !token} /></label><label>Confirmar nueva contraseña<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy || !token} /></label>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy || !token}>{busy?'Guardando…':'Guardar nueva contraseña'}</button></form></>}<button type="button" className="auth-switch" disabled={busy} onClick={onReturn}>Volver a la aplicación</button></section></main>
}

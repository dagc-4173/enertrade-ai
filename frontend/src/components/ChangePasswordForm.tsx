import {useState,type FormEvent} from 'react'
import {changeOwnPassword} from '../services/changePasswordService'
import {authErrorMessage} from '../services/authService'
export function ChangePasswordForm() {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return
  const form=event.currentTarget,data=new FormData(form),current=String(data.get('currentPassword')??''),next=String(data.get('newPassword')??'')
  setError('');setMessage('')
  if(next!==String(data.get('confirmation')??'')){setError('Las contraseñas nuevas no coinciden.');return}
  if(current===next){setError('La nueva contraseña debe ser diferente de la actual.');return}
  setBusy(true)
  try{setMessage(await changeOwnPassword(current,next));form.reset()}catch(error){setError(authErrorMessage(error))}finally{setBusy(false)}
 }
 return <section className="panel profile-security" aria-labelledby="password-change-title"><p className="eyebrow">Seguridad de la cuenta</p><details className="profile-security-disclosure"><summary id="password-change-title">Cambiar contraseña</summary><p>Confirma tu contraseña actual para elegir una nueva. Se cerrarán las otras sesiones y se invalidarán los enlaces de recuperación anteriores. Continuarás en esta sesión.</p><form className="profile-password-form" onSubmit={submit} aria-busy={busy}><label>Contraseña actual<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} /></label><label>Nueva contraseña<input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy} /></label><label>Confirmar nueva contraseña<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy} /></label><small>Entre 12 y 128 caracteres. Puedes usar una frase larga.</small>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}<button type="submit" className="primary-button" disabled={busy}>{busy?'Actualizando…':'Actualizar contraseña'}</button></form></details></section>
}

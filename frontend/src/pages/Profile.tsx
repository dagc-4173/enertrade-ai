import { useState, useSyncExternalStore } from 'react'
import { StatusBadge } from '../components/ui/StatusBadge'
import { SimulationProfileEditor } from '../components/PublicationVerification'
import { authStore, type AuthState } from '../auth/authStore'
import {ActiveSessions} from '../components/ActiveSessions'
import {ChangePasswordForm} from '../components/ChangePasswordForm'
import './Profile.css'

export function ProfileContent({ state }: { state: AuthState }) {
 const { user, status } = state
 const [copyStatus,setCopyStatus] = useState('')
 const active = status === 'authenticated' && user !== null
 const initials = user?.name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toLocaleUpperCase('es-CO') || 'ET'
 async function copyId() {
  if (!user) return
  try { await navigator.clipboard.writeText(user.id);setCopyStatus('Identificador copiado.') }
  catch { setCopyStatus('No fue posible copiar. Puedes seleccionar el identificador manualmente.') }
 }
 return <div className="page-grid profile-workspace">
  <section className="panel profile-overview"><div className="profile-identity"><div className="profile-initials" aria-hidden="true">{initials}</div><div><p className="eyebrow">Mi cuenta</p><h2>{user?.name ?? 'Sesión no disponible'}</h2><p>Información de tu cuenta en EnerTrade AI.</p></div></div><StatusBadge tone={active ? 'success' : 'neutral'}>{active ? 'Sesión activa' : status === 'checking' ? 'Verificando sesión' : 'Sesión no disponible'}</StatusBadge></section>
  <section className="panel"><h2>Datos de la cuenta</h2><dl className="profile-account"><div><dt>Nombre</dt><dd>{user?.name ?? 'No disponible'}</dd></div><div><dt>Correo electrónico</dt><dd>{user?.email ?? 'No disponible'}</dd></div><div><dt>Rol</dt><dd>{user?.role === 'ADMIN' ? 'Administrador' : 'Usuario'}</dd></div><div><dt>Fecha de registro</dt><dd>{user && Number.isFinite(Date.parse(user.createdAt)) ? new Date(user.createdAt).toLocaleString('es-CO',{timeZone:'America/Bogota'}) : 'No disponible'}</dd></div></dl><p className="profile-help">La información de cuenta se muestra en modo de consulta.</p>
  <details className="profile-technical"><summary>Detalles técnicos de la cuenta</summary><p>Identificador de usuario</p><code>{user?.id ?? 'No disponible'}</code>{active && <button type="button" className="secondary-button" onClick={() => { void copyId() }}>Copiar identificador</button>}{copyStatus && <p role="status">{copyStatus}</p>}</details></section>
  {active && <ChangePasswordForm />}
  {active && <ActiveSessions />}
  {active && <section className="panel profile-simulation"><p className="eyebrow">Configuración del mercado</p><h2>Perfiles de simulación</h2><p>Consulta o configura tus límites horarios de oferta y demanda. Son referencias declaradas para la simulación académica; no acreditan capacidad física ni disponibilidad real de energía.</p><p className="profile-impact">Guardar una nueva versión puede dejar desactualizadas las verificaciones anteriores. Revisa y verifica nuevamente tus publicaciones en Mercado.</p><SimulationProfileEditor kind="offer" /><SimulationProfileEditor kind="demand" /></section>}
 </div>
}
export function Profile() {
 const state = useSyncExternalStore(authStore.subscribe,authStore.getSnapshot)
 return <ProfileContent state={state} />
}

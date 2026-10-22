import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { authStore } from '../auth/authStore'
import { apiRequest } from '../services/apiClient'
import { authErrorMessage } from '../services/authService'
import {loadAdminPage,type ManagedUser as User,type UserPage as Users,type AuditPage as Audit} from '../services/adminService'
import { DatasetRegistration } from '../components/datasets/DatasetRegistration'
import { ExternalDataSources } from '../components/external-data/ExternalDataSources'
import './Administration.css'
const roleLabel = (role: string) => role === 'ADMIN' ? 'Administrador' : 'Usuario'
const statusLabel = (status: string) => status === 'BLOCKED' ? 'Bloqueada' : 'Activa'
type SyncResult = {metrics: {metric: string; status: string; outcome?: string; error?: {message: string}}[]}
function DatasetManagement() {
 const [busy,setBusy] = useState(false),[message,setMessage] = useState(''),[error,setError] = useState('')
 async function sync() {
  if(busy)return;setBusy(true);setMessage('');setError('')
  try {
   const {data}=await apiRequest<SyncResult>('/admin/xm/sync',{method:'POST',credentials:'include',json:{}})
   if(!data || !Array.isArray(data.metrics))throw new Error('Respuesta no válida')
   const labels:Record<string,string>={Gene:'Oferta',DemaSIN:'Demanda',PrecBolsNaci:'Precio'}
   setMessage(data.metrics.map(item=>`${labels[item.metric] ?? item.metric}: ${item.error?.message ?? (item.status==='up_to_date'?'sin datos nuevos':item.status==='synchronized'?'datos actualizados':'revisa la disponibilidad de la serie')}`).join(' · '))
  }catch(error){setError(authErrorMessage(error))}finally{setBusy(false)}
 }
 return <><section className="panel"><h2>Preparación de datos</h2><p>Registra o importa datos reales; valida su estructura y prepara una versión compatible con los modelos. Preparar un dataset no entrena automáticamente un modelo.</p><button type="button" className="secondary-button" disabled={busy} onClick={()=>{void sync()}}>{busy?'Sincronizando…':'Sincronizar series XM'}</button>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</section><DatasetRegistration /><ExternalDataSources /></>
}
function UserAccessEditor({target,onSaved,onCancel}: {target: User; onSaved: () => void; onCancel: () => void}) {
 const [role,setRole] = useState(target.role), [status,setStatus] = useState(target.status), [reason,setReason] = useState(''), [confirmed,setConfirmed] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState('')
 async function submit(event: FormEvent) {
  event.preventDefault();if (busy || !confirmed) return
  setBusy(true);setError('')
  try { await apiRequest(`/admin/users/${target.id}`, {method: 'PATCH',credentials: 'include',json: {role,status,reason}});onSaved() }
  catch (error) {setError(authErrorMessage(error))} finally {setBusy(false)}
 }
 return <section className="panel admin-editor" aria-labelledby="access-title"><h2 id="access-title">Acceso de {target.name}</h2><p>{target.email}</p>
 <form onSubmit={submit} aria-busy={busy}><div className="admin-fields"><label>Rol<select value={role} disabled={busy} onChange={e => {setRole(e.target.value as User['role']);setConfirmed(false)}}><option value="USER">Usuario</option><option value="ADMIN">Administrador</option></select></label><label>Estado<select value={status} disabled={busy} onChange={e => {setStatus(e.target.value as User['status']);setConfirmed(false)}}><option value="ACTIVE">Activa</option><option value="BLOCKED">Bloqueada</option></select></label></div>
 <label>Motivo del cambio<textarea minLength={5} maxLength={500} required value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} /></label>
 <p>Todo cambio cierra las sesiones de esta cuenta. Bloquearla cancela sus publicaciones activas y negociaciones pendientes; los acuerdos confirmados se conservan. Desbloquear no restaura publicaciones ni negociaciones.</p>
 <label className="admin-confirm"><input type="checkbox" checked={confirmed} disabled={busy} required onChange={e=>setConfirmed(e.target.checked)} />Confirmo el cambio de acceso para esta cuenta.</label>
 {error && <p role="alert">{error}</p>}<div className="admin-actions"><button className="primary-button" disabled={busy || !confirmed || (role === target.role && status === target.status)}>{busy ? 'Guardando…' : 'Guardar cambio'}</button><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cerrar</button></div></form></section>
}
export function Administration() {
 const {user} = useSyncExternalStore(authStore.subscribe,authStore.getSnapshot,authStore.getSnapshot)
 const [tab,setTab] = useState<'users'|'audit'|'datasets'>('users'), [search,setSearch] = useState(''), [query,setQuery] = useState(''), [role,setRole] = useState(''), [status,setStatus] = useState(''), [page,setPage] = useState(1), [revision,setRevision] = useState(0)
 const [users,setUsers] = useState<Users|null>(null), [audit,setAudit] = useState<Audit|null>(null), [loading,setLoading] = useState(true), [error,setError] = useState(''), [message,setMessage] = useState(''), [target,setTarget] = useState<User|null>(null)
 const isAdmin = user?.role === 'ADMIN'
 useEffect(()=>{
  if (!isAdmin || tab === 'datasets') return
  const controller = new AbortController()
  const params = new URLSearchParams({page: String(page)})
  if (tab === 'users') {params.set('search',query);if(role)params.set('role',role);if(status)params.set('status',status)}
  void loadAdminPage(tab,params,controller.signal).then(data=>{if(!controller.signal.aborted && data){if('users' in data)setUsers(data);else setAudit(data);setLoading(false)}}).catch(error=>{if(!controller.signal.aborted){setError(authErrorMessage(error));setLoading(false)}})
  return ()=>controller.abort()
 },[isAdmin,tab,page,query,role,status,revision])
 function reload(){setLoading(true);setError('');setRevision(value=>value+1)}
 function selectTab(next: typeof tab){setTab(next);setPage(1);setTarget(null);setMessage('');setError('');setLoading(true)}
 if(!isAdmin)return <section className="panel" role="alert">Se requiere una cuenta administradora activa.</section>
 const result = tab === 'users' ? users : audit
 return <div className="page-grid admin-workspace"><section className="panel"><p className="eyebrow">Administración</p><h2>Control de cuentas y datos</h2><p>Gestiona accesos y consulta los cambios registrados. Las operaciones comerciales continúan bajo la responsabilidad de cada usuario.</p><nav className="admin-tabs" aria-label="Secciones de administración">{([['users','Usuarios'],['audit','Auditoría'],['datasets','Datasets']] as const).map(([key,label])=><button type="button" key={key} aria-current={tab===key?'page':undefined} className={tab===key?'primary-button':'secondary-button'} onClick={()=>selectTab(key)}>{label}</button>)}</nav></section>
 {tab==='users' && <section className="panel"><form className="admin-fields" onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPage(1);reload()}}><label>Buscar por nombre o correo<input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} /></label><label>Rol<select value={role} onChange={e=>{setRole(e.target.value);setPage(1);reload()}}><option value="">Todos</option><option value="USER">Usuario</option><option value="ADMIN">Administrador</option></select></label><label>Estado<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);reload()}}><option value="">Todos</option><option value="ACTIVE">Activa</option><option value="BLOCKED">Bloqueada</option></select></label><button className="secondary-button">Buscar</button></form></section>}
 {message && <p role="status">{message}</p>}{target && tab==='users' && <UserAccessEditor key={target.id} target={target} onCancel={()=>setTarget(null)} onSaved={()=>{setTarget(null);setMessage('Acceso actualizado y sesiones de la cuenta cerradas.');reload()}} />}
 {tab!=='datasets' && <section className="panel">{loading ? <p role="status">Cargando…</p> : error ? <div role="alert"><p>{error}</p><button className="secondary-button" onClick={reload}>Reintentar</button></div> : <>{tab==='users' && users && <><h2>Cuentas registradas ({users.total})</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Cuenta</th><th>Rol</th><th>Estado</th><th>Registro</th><th>Acciones</th></tr></thead><tbody>{users.users.map(row=><tr key={row.id}><td><strong>{row.name}</strong><br />{row.email}</td><td>{roleLabel(row.role)}</td><td><span className={`admin-status ${row.status==='BLOCKED'?'is-blocked':''}`}>{statusLabel(row.status)}</span></td><td>{new Date(row.createdAt).toLocaleDateString('es-CO')}</td><td>{row.id===user?.id ? 'Tu cuenta' : <button type="button" className="secondary-button" onClick={()=>{setTarget(row);setMessage('')}}>Gestionar acceso</button>}</td></tr>)}</tbody></table></div>{!users.users.length && <p>No hay cuentas para estos filtros.</p>}</>}
 {tab==='audit' && audit && <><h2>Cambios registrados ({audit.total})</h2>{!audit.entries.length && <p>Aún no hay cambios registrados.</p>}<ol className="admin-audit">{audit.entries.map(entry=><li key={entry.id}><strong>{entry.target.name} · {entry.target.email}</strong><p>{entry.action==='FIRST_ADMIN_BOOTSTRAP'?'Alta del primer administrador':'Cambio de acceso'} · {new Date(entry.createdAt).toLocaleString('es-CO')}</p><p>{roleLabel(entry.before.role)} / {statusLabel(entry.before.status)} → {roleLabel(entry.after.role)} / {statusLabel(entry.after.status)}</p><p>Responsable: {entry.actor.email}</p><p>Motivo: {entry.reason}</p></li>)}</ol></>}
 {result && <div className="admin-pagination"><button type="button" className="secondary-button" disabled={page<=1} onClick={()=>{setPage(page-1);reload()}}>Anterior</button><span>Página {page} de {Math.max(1,Math.ceil(result.total/result.pageSize))}</span><button type="button" className="secondary-button" disabled={page*result.pageSize>=result.total} onClick={()=>{setPage(page+1);reload()}}>Siguiente</button></div>}</>}</section>}
 {tab==='datasets' && <DatasetManagement />}
 </div>
}

import {afterEach,expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import {authStore} from '../src/auth/authStore'
import {Administration} from '../src/pages/Administration'
import {AppShell} from '../src/components/layout/AppShell'
import {parseAuthUser} from '../src/services/authService'
const original=authStore.getSnapshot
afterEach(()=>{authStore.getSnapshot=original})
const user={id:'test',name:'Test',email:'test@example.test',createdAt:'2026-10-21T00:00:00Z',status:'ACTIVE' as const}
test('ADM-UI-01: navegación de usuario conserva orden y oculta Administración',()=>{
 authStore.getSnapshot=()=>({status:'authenticated',user:{...user,role:'USER'},error:null})
 const html=renderToStaticMarkup(<AppShell activePage="dashboard" onNavigate={()=>{}}><p>Inicio</p></AppShell>)
 expect(html).not.toContain('title="Usuarios, auditoría y datos"')
 expect(renderToStaticMarkup(<Administration />)).toContain('Se requiere una cuenta administradora activa.')
})
test('ADM-UI-02: administrador conserva acceso normal y ofrece usuarios, auditoría y datasets',()=>{
 authStore.getSnapshot=()=>({status:'authenticated',user:{...user,role:'ADMIN'},error:null})
 const shell=renderToStaticMarkup(<AppShell activePage="admin" onNavigate={()=>{}}><Administration /></AppShell>)
 for(const label of ['Inicio','Predicciones','Mercado','Transacciones','Patrones','Perfil','Administración','Usuarios','Auditoría','Datasets'])expect(shell).toContain(label)
 expect(shell).not.toContain('Eliminar usuario');expect(shell).not.toContain('passwordHash')
})
test('ADM-UI-03: sesión conserva permisos reconocidos y rechaza valores desconocidos',()=>{
 expect(parseAuthUser({user:{...user,role:'ADMIN'}}).role).toBe('ADMIN')
 expect(()=>parseAuthUser({user:{...user,role:'SUPERADMIN'}})).toThrow('permisos')
 expect(()=>parseAuthUser({user:{...user,role:['ADMIN']}})).toThrow()
})

import {parseUsers,parseAudit} from '../src/services/adminService'
test('ADM-UI-04: contratos de cuentas y auditoría rechazan respuestas incompletas',()=>{
 const page={total:1,page:1,pageSize:25}
 expect(parseUsers({...page,users:[{...user,role:'ADMIN'}]}).users).toHaveLength(1)
 expect(()=>parseUsers({...page,users:[user]})).toThrow()
 expect(()=>parseUsers({...page,pageSize:1000,users:[]})).toThrow()
 expect(()=>parseAudit({...page,entries:[{id:'x'}]})).toThrow()
 expect(parseAudit({...page,total:0,entries:[]}).entries).toEqual([])
})

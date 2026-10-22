import { expect,test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileContent } from '../src/pages/Profile'
import type { AuthState } from '../src/auth/authStore'
const state: AuthState = {status:'authenticated',error:null,user:{id:'test-profile-id',name:'Usuario de Prueba',email:'profile@example.test',createdAt:'2026-10-21T10:00:00Z'}}
test('PROFILE-01: datos disponibles y simulación conservan alcance incluyen cambio de contraseña autorizado',()=>{
 const html=renderToStaticMarkup(<ProfileContent state={state} />)
 expect(html).toContain('Usuario de Prueba')
 expect(html).toContain('profile@example.test')
 expect(html).toContain('Fecha de registro')
 expect(html).toContain('Sesión activa')
 expect(html).toContain('Detalles técnicos de la cuenta')
 expect(html).toContain('Copiar identificador')
 expect(html).toContain('Perfil de simulación de oferta')
 expect(html).toContain('Perfil de simulación de demanda')
 expect(html).toContain('Cambiar contraseña')
 expect(html).not.toContain('Información pública')
})
test('PROFILE-02: sesión ausente no se anuncia activa ni permite configuración',()=>{
 const html=renderToStaticMarkup(<ProfileContent state={{status:'anonymous',user:null,error:null}} />)
 expect(html).toContain('Sesión no disponible')
 expect(html).not.toContain('Sesión activa')
 expect(html).not.toContain('Guardar nueva versión')
 expect(html).not.toContain('Copiar identificador')
 expect(html).not.toContain('Cambiar contraseña')
})

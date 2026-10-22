import {afterEach,expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import {ChangePasswordForm} from '../src/components/ChangePasswordForm'
import {changeOwnPassword} from '../src/services/changePasswordService'
const original=globalThis.fetch
afterEach(()=>{globalThis.fetch=original})
test('PWD-UI-01: pide actual, nueva y confirmación sin editar otras cuentas',()=>{
 const html=renderToStaticMarkup(<ChangePasswordForm />);for(const text of ['Contraseña actual','Nueva contraseña','Confirmar nueva contraseña','Actualizar contraseña','current-password','new-password'])expect(html).toContain(text);expect(html).not.toContain('name="email"');expect(html).not.toContain('name="userId"')
})
test('PWD-UI-02: envía solo contraseñas en JSON con cookies',async()=>{
 let request:RequestInit|undefined;globalThis.fetch=(async(_url,options)=>{request=options;return Response.json({message:'Actualizada'})}) as typeof fetch;expect(await changeOwnPassword('old-test-password','new-test-password')).toBe('Actualizada');expect(request?.credentials).toBe('include');expect(JSON.parse(String(request?.body))).toEqual({currentPassword:'old-test-password',newPassword:'new-test-password'})
})

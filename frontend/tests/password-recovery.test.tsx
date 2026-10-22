import {afterEach,expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import {AuthPage} from '../src/pages/AuthPage'
import {ResetPassword} from '../src/pages/ResetPassword'
import {recoveryTokenFromHash,requestPasswordRecovery,resetPassword} from '../src/services/passwordRecoveryService'
const original=globalThis.fetch
afterEach(()=>{globalThis.fetch=original})
test('REC-UI-01: login ofrece recuperación y el formulario solo pide correo',()=>{
 expect(renderToStaticMarkup(<AuthPage />)).toContain('¿Olvidaste tu contraseña?');const html=renderToStaticMarkup(<AuthPage initialMode="forgot" />);expect(html).toContain('Enviar enlace de recuperación');expect(html).toContain('type="email"');expect(html).not.toContain('type="password"')
})
test('REC-UI-02: contraseña con confirmación, token no visible',()=>{
 const token='a'.repeat(43),html=renderToStaticMarkup(<ResetPassword token={token} onReturn={()=>{}} />);expect(html).toContain('Confirmar nueva contraseña');expect(html).toContain('autoComplete="new-password"');expect(html).not.toContain(token);expect(html).not.toContain('type="email"');expect(html).toContain('minLength="12"')
})
test('REC-UI-03: valida fragmento y enlace corrupto',()=>{
 const token='a'.repeat(43);expect(recoveryTokenFromHash('#recuperar='+token)).toBe(token);expect(recoveryTokenFromHash('#recuperar=bad')).toBe('');expect(recoveryTokenFromHash('#otra')).toBeNull();expect(renderToStaticMarkup(<ResetPassword token="" onReturn={()=>{}} />)).toContain('El enlace no es válido.')
})
test('REC-UI-04: API usa JSON y token en cuerpo, sin correo ni rol al restablecer',async()=>{
 const calls:{url:string;options?:RequestInit}[]=[];globalThis.fetch=(async(url,options)=>{calls.push({url:String(url),options});return Response.json({message:'Confirmación segura'})}) as typeof fetch
 await requestPasswordRecovery('test@example.test');await resetPassword('a'.repeat(43),'test-only-password-long');expect(calls[0].url.endsWith('/auth/forgot-password')).toBe(true);expect(calls[0].options?.credentials).toBe('include');expect(JSON.parse(String(calls[0].options?.body))).toEqual({email:'test@example.test'});expect(calls[1].url).not.toContain('a'.repeat(43));expect(JSON.parse(String(calls[1].options?.body))).toEqual({token:'a'.repeat(43),password:'test-only-password-long'})
})

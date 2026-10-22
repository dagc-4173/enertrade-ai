import {afterEach,expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import {ActiveSessions} from '../src/components/ActiveSessions'
import {ChangePasswordForm} from '../src/components/ChangePasswordForm'
import {parseSessions,revokeSessions} from '../src/services/sessionManagementService'
const original=globalThis.fetch
afterEach(()=>{globalThis.fetch=original})
test('SES-UI-01: contraseña y sesiones son desplegables cerrados inicialmente',()=>{
 for(const [component,title] of [[<ChangePasswordForm />,'Cambiar contraseña'],[<ActiveSessions />,'Sesiones activas']] as const){const html=renderToStaticMarkup(component);expect(html).toContain(`<summary`);expect(html).toContain(title);expect(html).not.toMatch(/<details[^>]*\sopen(?:=|>)/)}
 expect(renderToStaticMarkup(<ActiveSessions />)).not.toContain('Consultar sesiones…')
})
test('SES-UI-02: contrato exige sesión actual única y elimina campos ajenos',()=>{
 const row={id:'session-id',createdAt:'2026-10-21T00:00:00Z',expiresAt:'2026-10-22T00:00:00Z',isCurrent:true};expect(parseSessions({sessions:[{...row,tokenHash:'private'}]})).toEqual([row]);expect(()=>parseSessions({sessions:[]})).toThrow();expect(()=>parseSessions({sessions:[row,row]})).toThrow();expect(()=>parseSessions({sessions:[{...row,isCurrent:false}]})).toThrow();
})
test('SES-UI-03: cerrar sesiones usa cookies y no envía identidad ajena',async()=>{
 const calls:{url:string;options?:RequestInit}[]=[];globalThis.fetch=(async(url,options)=>{calls.push({url:String(url),options});return Response.json({revoked:1})}) as typeof fetch;expect(await revokeSessions()).toBe(1);await revokeSessions('session-id');expect(calls[0].url.endsWith('/auth/sessions/revoke-others')).toBe(true);expect(calls[1].url.endsWith('/auth/sessions/session-id/revoke')).toBe(true);expect(calls[0].options?.credentials).toBe('include');expect(calls[0].options?.body).toBe('{}');
})

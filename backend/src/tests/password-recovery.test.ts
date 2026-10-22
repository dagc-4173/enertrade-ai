import {afterAll,expect,test} from 'bun:test';
import express from 'express';
import {createPasswordRecoveryRouter} from '@/controllers/password-recovery.controller';
import {createPasswordRecoveryService,recoveryEmail,recoveryNotice,resetHash,resetInput,type RecoveryRepository} from '@/services/password-recovery.service';
import {recoveryMailConfig,recoveryLink} from '@/integrations/recovery-mail';
const servers:ReturnType<typeof express.application.listen>[]=[];
function server(service:Parameters<typeof createPasswordRecoveryRouter>[0]){const app=express();app.use('/auth',createPasswordRecoveryRouter(service));const server=app.listen(0,'127.0.0.1');servers.push(server);const address=server.address();if(!address || typeof address==='string')throw Error('No port');return `http://127.0.0.1:${address.port}/auth`;}
afterAll(()=>{for(const server of servers)server.close()});
const post=(base:string,path:string,body:unknown,headers:Record<string,string>={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
async function rejection(promise:Promise<unknown>){try{await promise}catch(error){return error}throw Error('Expected rejection')}
test('REC-01: enlace opaco, SHA256 persistido y vencimiento de 30 minutos',async()=>{
 let stored:any=null,delivery:any=null;
 const repo:RecoveryRepository={issue:async(email,tokenHash,expiresAt)=>{stored={tokenHash,expiresAt};return {id:'fixture',email}},revoke:async()=>{},consume:async()=>false};
 const now=new Date('2030-01-01T00:00:00Z');
 const service=createPasswordRecoveryService(repo,{ready:()=>true,send:async(to,link)=>{delivery={to,link}}},()=>now,()=> 'https://enertrade.example.test');await service.request('test@example.test');
 const url=new URL(delivery.link),token=url.hash.slice('#recuperar='.length);
 expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(stored.tokenHash).toBe(resetHash(token));expect(stored.tokenHash).not.toBe(token);expect(stored.expiresAt.getTime()-now.getTime()).toBe(30*60*1000);expect(url.search).toBe('');expect(delivery.to).toBe('test@example.test');
});
test('REC-02: cuenta ausente o bloqueada no genera correo',async()=>{
 let sent=0;const service=createPasswordRecoveryService({issue:async()=>null,revoke:async()=>{},consume:async()=>false},{ready:()=>true,send:async()=>{sent++}});await service.request('absent@example.test');expect(sent).toBe(0);
});
test('REC-03: fallo SMTP invalida el enlace emitido y oculta detalles',async()=>{
 let revoked='';const service=createPasswordRecoveryService({issue:async()=>({id:'fixture',email:'test@example.test'}),revoke:async hash=>{revoked=hash},consume:async()=>false},{ready:()=>true,send:async()=>{throw Error('SMTP private details')}});
 expect(await rejection(service.request('test@example.test'))).toMatchObject({message:'RECOVERY_MAIL_FAILED'});expect(revoked).toMatch(/^[a-f0-9]{64}$/);
});
test('REC-04: almacena Argon2id, nunca contraseña en claro',async()=>{
 let stored='';const password='a-long-test-password-123';const service=createPasswordRecoveryService({issue:async()=>null,revoke:async()=>{},consume:async(_token,passwordHash)=>{stored=passwordHash;return true}},{ready:()=>true,send:async()=>{}});
 await service.reset({token:'a'.repeat(43),password});expect(stored).toStartWith('$argon2id$');expect(await Bun.password.verify(password,stored)).toBe(true);
});
test('REC-05: enlace inválido, usado o vencido devuelve error genérico',async()=>{
 const service=createPasswordRecoveryService({issue:async()=>null,revoke:async()=>{},consume:async()=>false},{ready:()=>true,send:async()=>{}});
 expect(await rejection(service.reset({token:'a'.repeat(43),password:'a-long-test-password-123'}))).toMatchObject({code:'INVALID_RESET_LINK'});expect(()=>resetInput({token:'bad',password:'a-long-test-password-123'})).toThrow('El enlace no es válido');
});
test('REC-06: HTTP responde antes de resolver búsqueda/correo, sin enumeración',async()=>{
 let release:()=>void=()=>{};const wait=new Promise<void>(resolve=>{release=resolve});const base=server({ready:()=>true,request:async()=>wait,reset:async()=>{}});
 try{const result=await post(base,'/forgot-password',{email:'unknown@example.test'});expect(result.status).toBe(202);expect(await result.json()).toEqual({message:recoveryNotice});expect(result.headers.get('cache-control')).toBe('no-store')}finally{release()}
});
test('REC-07: sin SMTP devuelve 503 sin confirmar cuenta existente',async()=>{
 let called=0;const base=server({ready:()=>false,request:async()=>{called++},reset:async()=>{}});
 for(const email of ['existing@example.test','absent@example.test']){const result=await post(base,'/forgot-password',{email});expect(result.status).toBe(503);expect((await result.json() as {error:string}).error).toBe('RECOVERY_UNAVAILABLE')}expect(called).toBe(0);
});
test('REC-08: limita IP y correo manteniendo respuesta genérica',async()=>{
 let called=0;const base=server({ready:()=>true,request:async()=>{called++},reset:async()=>{}});
 for(let index=0;index<5;index++)expect((await post(base,'/forgot-password',{email:'test@example.test'})).status).toBe(202);expect((await post(base,'/forgot-password',{email:'another@example.test'})).status).toBe(429);expect(called).toBe(3);
});
test('REC-09: origen cruzado y cuerpo no JSON rechazados',async()=>{
 const base=server({ready:()=>true,request:async()=>{},reset:async()=>{}});expect((await post(base,'/forgot-password',{email:'test@example.test'},{Origin:'https://foreign.example.test'})).status).toBe(403);expect((await fetch(base+'/reset-password',{method:'POST',headers:{'Content-Type':'text/plain'},body:'test'})).status).toBe(415);
});
test('REC-10: SMTP exige TLS, remitente y URL confiable',()=>{
 const env={SMTP_HOST:'smtp.example.test',SMTP_PORT:'587',SMTP_USER:'sender',SMTP_PASSWORD:'test-only',MAIL_FROM:'security@example.test',FRONTEND_ORIGIN:'https://enertrade.example.test',NODE_ENV:'production'};
 expect(recoveryMailConfig(env)?.port).toBe(587);expect(recoveryMailConfig({...env,SMTP_PORT:'25'})).toBeNull();expect(recoveryMailConfig({...env,FRONTEND_ORIGIN:'http://enertrade.example.test'})).toBeNull();expect(recoveryMailConfig({...env,MAIL_FROM:'bad\r\nheader'})).toBeNull();expect(recoveryMailConfig({...env,SMTP_PASSWORD:''})).toBeNull();expect(recoveryLink(env.FRONTEND_ORIGIN,'a'.repeat(43))).toContain('#recuperar=');
});
test.each([null,{}, {email:'bad'}, {email:'valid@example.test',role:'ADMIN'}].map(body=>({body})))('REC-11: solicitud inválida %j',({body})=>{expect(()=>recoveryEmail(body)).toThrow()});
test.each([{token:'a'.repeat(43),password:'short'},{token:'a'.repeat(43),password:'x'.repeat(129)},{token:'a'.repeat(43),password:'a-long-test-password',role:'ADMIN'}])('REC-12: contraseña o campos inválidos %j',body=>{expect(()=>resetInput(body)).toThrow()});

test('REC-13: concurrencia de restablecimientos se limita y libera al finalizar',async()=>{
 let release:()=>void=()=>{},entered:()=>void=()=>{},count=0;
 const wait=new Promise<void>(resolve=>{release=resolve}),ready=new Promise<void>(resolve=>{entered=resolve});
 const base=server({ready:()=>true,request:async()=>{},reset:async()=>{count++;if(count===4)entered();await wait}});
 const requests=Array.from({length:4},()=>post(base,'/reset-password',{}));
 try{await ready;expect((await post(base,'/reset-password',{})).status).toBe(503)}finally{release()}
 expect((await Promise.all(requests)).every(result=>result.status===200)).toBe(true);expect((await post(base,'/reset-password',{})).status).toBe(200);
});

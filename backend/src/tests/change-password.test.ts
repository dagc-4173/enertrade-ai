import {afterAll,expect,test} from 'bun:test';
import express from 'express';
import {createChangePasswordService,changePasswordInput,type PasswordChangeRepository} from '@/services/change-password.service';
import {createChangePasswordRouter} from '@/controllers/change-password.controller';
import {AuthError} from '@/services/auth.service';
const token='a'.repeat(43),current='old-test-password-long',next='new-test-password-long',expiry=new Date(Date.now()+600000);
const hash=await Bun.password.hash(current);
async function rejection(promise:Promise<unknown>){try{await promise}catch(error){return error}throw Error('Expected rejection')}
function repo():PasswordChangeRepository{return {snapshot:async()=>({userId:'test',expiresAt:expiry,user:{passwordHash:hash,status:'ACTIVE'}}),commit:async()=>expiry}}
test('PWD-01: exige actual correcta, Argon2id y nueva sesión sin ampliar vencimiento',async()=>{
 const store=repo();let saved='';store.commit=async(_old,expected,passwordHash,newTokenHash)=>{expect(expected).toBe(hash);expect(newTokenHash).toMatch(/^[a-f0-9]{64}$/);saved=passwordHash;return expiry};
 const result=await createChangePasswordService(store).change({currentPassword:current,newPassword:next},token);expect(result.token).not.toBe(token);expect(result.expiresAt).toBe(expiry);expect(await Bun.password.verify(next,saved)).toBe(true);
});
test('PWD-02: contraseña incorrecta no escribe',async()=>{
 const store=repo();let writes=0;store.commit=async()=>{writes++;return expiry};expect(await rejection(createChangePasswordService(store).change({currentPassword:'incorrect',newPassword:next},token))).toMatchObject({code:'CURRENT_PASSWORD_INCORRECT'});expect(writes).toBe(0);
});
test('PWD-03: sesión ausente, vencida o bloqueada rechazada',async()=>{
 for(const snapshot of [null,{userId:'test',expiresAt:new Date(0),user:{passwordHash:hash,status:'ACTIVE'}},{userId:'test',expiresAt:expiry,user:{passwordHash:hash,status:'BLOCKED'}}]){const store=repo();store.snapshot=async()=>snapshot;expect(await rejection(createChangePasswordService(store).change({currentPassword:current,newPassword:next},token))).toMatchObject({code:'UNAUTHENTICATED'})}
});
test('PWD-04: cambio simultáneo devuelve conflicto sin crear sesión',async()=>{
 const store=repo();store.commit=async()=>null;expect(await rejection(createChangePasswordService(store).change({currentPassword:current,newPassword:next},token))).toMatchObject({code:'PASSWORD_CHANGE_CONFLICT'});
});
test.each([null,{}, {currentPassword:current,newPassword:'short'},{currentPassword:current,newPassword:current},{currentPassword:current,newPassword:next,userId:'foreign'},{currentPassword:current,newPassword:'x'.repeat(129)}].map(body=>({body})))('PWD-05: entrada inválida %j',({body})=>{expect(()=>changePasswordInput(body)).toThrow()});
const servers:ReturnType<typeof express.application.listen>[]=[];afterAll(()=>{for(const server of servers)server.close()});
function listen(authenticated=true){const app=express();app.use('/auth',createChangePasswordRouter({change:async()=>({token:'b'.repeat(43),expiresAt:expiry})},{me:async()=>{if(!authenticated)throw new AuthError(401,'UNAUTHENTICATED','Debes iniciar sesión.');return {id:'test',name:'Test',email:'test@example.test',createdAt:new Date()}}}));const server=app.listen(0,'127.0.0.1');servers.push(server);const address=server.address();if(!address || typeof address==='string')throw Error('No port');return `http://127.0.0.1:${address.port}/auth/change-password`}
const post=(url:string,headers:Record<string,string>={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`enertrade_session=${token}`,...headers},body:JSON.stringify({currentPassword:current,newPassword:next})});
test('PWD-06: HTTP renueva cookie HttpOnly sin exponer token en JSON',async()=>{
 const result=await post(listen());expect(result.status).toBe(200);expect(result.headers.get('set-cookie')).toContain('HttpOnly');expect(result.headers.get('set-cookie')).toContain('SameSite=Lax');expect(result.headers.get('cache-control')).toBe('no-store');expect(await result.text()).not.toContain('b'.repeat(43));
});
test('PWD-07: requiere autenticación, rechaza origen cruzado y limita intentos',async()=>{
 expect((await post(listen(false))).status).toBe(401);const url=listen();expect((await post(url,{Origin:'https://foreign.example.test'})).status).toBe(403);for(let i=0;i<5;i++)expect((await post(url)).status).toBe(200);expect((await post(url)).status).toBe(429);
});

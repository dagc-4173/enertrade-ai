import {afterAll,expect,test} from 'bun:test';
import express from 'express';
import {createApp} from '@/app';
import {requireAdmin,adminOrigin} from '@/middlewares/admin.middleware';
import {AuthError,createAuthService,type AuthRepository,type AuthUser} from '@/services/auth.service';
import {assertAdminRemains,parseUserChange} from '@/services/admin.service';
const user: AuthUser = {id:crypto.randomUUID(),email:'admin-test@example.test',name:'Test',createdAt:new Date(),role:'USER',status:'ACTIVE'};
const servers: ReturnType<typeof express.application.listen>[]=[];
function listen(app:ReturnType<typeof express>) {const server=app.listen(0,'127.0.0.1');servers.push(server);const address=server.address();if(!address || typeof address==='string')throw Error('No port');return `http://127.0.0.1:${address.port}`;}
afterAll(()=>{for(const server of servers)server.close()});
test('ADM-01: permisos se deniegan por defecto y admiten únicamente ADMIN activo',async()=>{
 for (const [role,status,expected] of [['USER','ACTIVE',403],['ADMIN','BLOCKED',403],['ADMIN','ACTIVE',200],[undefined,'ACTIVE',403]] as const) {
  const app=express();app.get('/protected',...requireAdmin({me:async()=>({...user,role,status})}),(_req,res)=>res.json({ok:true}));expect((await fetch(listen(app)+'/protected')).status).toBe(expected);
 }
});
test('ADM-02: aplicación impide al usuario normal cambiar cuentas, sincronizar, importar o consultar histórico técnico',async()=>{
 const base=listen(createApp({administrativeAuth:{me:async()=>user}}));
 for(const [method,path] of [['GET','/admin/users'],['GET','/admin/audit'],['PATCH',`/admin/users/${user.id}`],['POST','/admin/xm/sync'],['POST','/datasets'],['POST','/datasets/1/validate'],['POST','/datasets/1/prepare'],['POST','/external-data/import'],['GET','/indicators'],['GET','/capabilities/versions'],['GET','/patterns']] as const) {
  const response=await fetch(base+path,{method});expect(response.status).toBe(403);expect((await response.json() as {error:string}).error).toBe('ADMIN_REQUIRED');
 }
});
test('ADM-03: origen cruzado se rechaza antes de mutaciones administrativas',async()=>{
 const app=express();app.post('/',...requireAdmin({me:async()=>({...user,role:'ADMIN'})}),adminOrigin,(_req,res)=>res.json({ok:true}));const base=listen(app);
 expect((await fetch(base,{method:'POST',headers:{Origin:'https://foreign.example.test','Sec-Fetch-Site':'cross-site'}})).status).toBe(403);
 expect((await fetch(base,{method:'POST'})).status).toBe(200);
});
test('ADM-04: último administrador no puede degradarse ni bloquearse',()=>{
 expect(()=>assertAdminRemains({role:'ADMIN',status:'ACTIVE'},{role:'USER',status:'ACTIVE'},1)).toThrow('Debe permanecer');
 expect(()=>assertAdminRemains({role:'ADMIN',status:'ACTIVE'},{role:'ADMIN',status:'BLOCKED'},1)).toThrow('Debe permanecer');
 expect(()=>assertAdminRemains({role:'ADMIN',status:'ACTIVE'},{role:'USER',status:'ACTIVE'},2)).not.toThrow();
});
test.each([null,[],{}, {role:'OWNER',reason:'Prueba válida'}, {role:['ADMIN'],reason:'Prueba válida'}, {status:'DELETED',reason:'Prueba válida'}, {role:'ADMIN',reason:'x'}, {role:'ADMIN',reason:'Prueba válida',email:'foreign@example.test'}, {password:'secret',reason:'Prueba válida'}].map(body=>({body})))('ADM-05: cambios no autorizados o incompletos rechazados %j',({body})=>{expect(()=>parseUserChange(body)).toThrow()});
test('ADM-06: bloqueo impide login y elimina sesión existente aunque tenga token válido',async()=>{
 const token='a'.repeat(43);let deleted=0;
 const password='test-only-safe-password';const passwordHash=await Bun.password.hash(password);
 const repo:AuthRepository={createUser:async()=>user,findUser:async()=>({...user,status:'BLOCKED',passwordHash}),createSession:async()=>{throw Error('No debe crear sesión')},findSession:async()=>({expiresAt:new Date(Date.now()+60000),user:{...user,status:'BLOCKED'}}),deleteSession:async()=>{deleted++}};
 const service=createAuthService(repo);
 await expect(service.login({email:user.email,password})).rejects.toMatchObject({status:403,code:'ACCOUNT_BLOCKED'});
 await expect(service.me(token)).rejects.toMatchObject({status:403,code:'ACCOUNT_BLOCKED'});expect(deleted).toBe(1);
});
test('ADM-07: registro no acepta autoconcederse rol ADMIN',async()=>{
 const service=createAuthService({} as AuthRepository);
 await expect(service.register({email:user.email,name:'Test',password:'test-only-password-long',role:'ADMIN'})).rejects.toBeInstanceOf(AuthError);
});

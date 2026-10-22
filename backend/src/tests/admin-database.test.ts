import 'dotenv/config';
import {afterAll,beforeAll,expect,test} from 'bun:test';
import pg from 'pg';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '@/generated/prisma/client';
import {changeUser} from '@/services/admin.service';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
// Explicit opt-in: all fixture data stays in a unique temporary schema.
const enabled=process.env.ADMIN_DB_TEST==='1';
const schema=`admin_test_${crypto.randomUUID().replaceAll('-','')}`;
let control:pg.Client;let database:PrismaClient;let created=false;
beforeAll(async()=>{
 if(!enabled)return;
 if(!/^admin_test_[a-f0-9]{32}$/.test(schema))throw Error('Unsafe schema');
 control=new pg.Client({connectionString:process.env.DATABASE_URL});await control.connect();
 await control.query(`CREATE SCHEMA "${schema}"`);created=true;
 await control.query(`SET search_path TO "${schema}"`);
 const path=join(import.meta.dir,'../../prisma/migrations');
 for(const directory of (await readdir(path,{withFileTypes:true})).filter(entry=>entry.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await control.query(await readFile(join(path,directory.name,'migration.sql'),'utf8'));
 database=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`},{schema})});
},60000);
afterAll(async()=>{
 await database?.$disconnect();
 if(control){if(created && /^admin_test_[a-f0-9]{32}$/.test(schema))await control.query(`DROP SCHEMA "${schema}" CASCADE`);await control.end();}
},30000);
const dbtest=enabled?test:test.skip;
async function rejection(promise:Promise<unknown>){try{await promise;}catch(error){return error;}throw Error("Expected rejection");}
async function account(role:'USER'|'ADMIN'='USER'){return database.user.create({data:{email:`${crypto.randomUUID()}@example.test`,name:'Test fixture',passwordHash:'not-a-real-login',role}})}
async function clear(){await database.adminAudit.deleteMany();await database.authSession.deleteMany();await database.energyTransaction.deleteMany();await database.energyOffer.deleteMany();await database.energyDemand.deleteMany();await database.user.deleteMany()}
dbtest('ADM-DB-01: bloqueo atómico revoca sesiones, retira publicaciones y conserva acuerdos confirmados',async()=>{
 await clear();const admin=await account('ADMIN'),target=await account(),buyer=await account();
 const offer=await database.energyOffer.create({data:{userId:target.id,quantityKwh:100,pricePerKwh:10,deliveryDate:new Date('2030-01-01')}});
 const demand=await database.energyDemand.create({data:{userId:buyer.id,quantityKwh:100,maxPricePerKwh:10,deliveryDate:new Date('2030-01-01')}});
 const common={offerId:offer.id,demandId:demand.id,sellerUserId:target.id,buyerUserId:buyer.id,quantityKwh:10,pricePerKwh:10,totalAmountCop:100,deliveryDate:new Date("2030-01-01")};
 const pending=await database.energyTransaction.create({data:common});const confirmed=await database.energyTransaction.create({data:{...common,status:'CONFIRMED',confirmedAt:new Date()}});
 await database.authSession.create({data:{userId:target.id,tokenHash:'a'.repeat(64),expiresAt:new Date(Date.now()+60000)}});
 const result=await changeUser(admin.id,target.id,{status:'BLOCKED',reason:'Prueba aislada de bloqueo'},database);
 expect(result.user.status).toBe('BLOCKED');expect(result.effects).toEqual({sessions:1,offers:1,demands:0,negotiations:1});
 expect((await database.energyTransaction.findUnique({where:{id:pending.id}}))?.status).toBe('CANCELLED');expect((await database.energyTransaction.findUnique({where:{id:confirmed.id}}))?.status).toBe('CONFIRMED');
 expect(await database.adminAudit.count()).toBe(1);
 await changeUser(admin.id,target.id,{status:'ACTIVE',reason:'Prueba aislada de desbloqueo'},database);
 expect((await database.energyOffer.findUnique({where:{id:offer.id}}))?.status).toBe('CANCELLED');expect(await database.authSession.count()).toBe(0);
},30000);
dbtest('ADM-DB-02: degradaciones concurrentes conservan un administrador activo',async()=>{
 await clear();const a=await account('ADMIN'),b=await account('ADMIN');
 const results=await Promise.allSettled([changeUser(a.id,b.id,{role:'USER',reason:'Prueba de concurrencia A'},database),changeUser(b.id,a.id,{role:'USER',reason:'Prueba de concurrencia B'},database)]);
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(await database.user.count({where:{role:'ADMIN',status:'ACTIVE'}})).toBe(1);expect(await database.adminAudit.count()).toBe(1);
},30000);
dbtest('ADM-DB-03: fallo de auditoría revierte cambio y revocación de sesiones',async()=>{
 await clear();const admin=await account('ADMIN'),target=await account();await database.authSession.create({data:{userId:target.id,tokenHash:'b'.repeat(64),expiresAt:new Date(Date.now()+60000)}});
 const broken={$transaction:(action:any,options:any)=>database.$transaction(tx=>action(new Proxy(tx,{get(object,key){if(key==='adminAudit')return {create:async()=>{throw Error('Injected audit failure')}};return Reflect.get(object,key)}})),options)} as unknown as PrismaClient;
 expect(await rejection(changeUser(admin.id,target.id,{status:'BLOCKED',reason:'Prueba de reversión completa'},broken))).toMatchObject({message:'Injected audit failure'});
 expect((await database.user.findUnique({where:{id:target.id}}))?.status).toBe('ACTIVE');expect(await database.authSession.count()).toBe(1);expect(await database.adminAudit.count()).toBe(0);
},30000);
dbtest('ADM-DB-04: el administrador no puede cambiar su propio acceso y las respuestas omiten secretos',async()=>{
 await clear();const a=await account('ADMIN'),b=await account('ADMIN');
 expect(await rejection(changeUser(a.id,a.id,{status:'BLOCKED',reason:'Prueba de autobloqueo'},database))).toMatchObject({code:'SELF_ADMIN_CHANGE_FORBIDDEN'});
 const result=await changeUser(a.id,b.id,{role:'USER',reason:'Prueba de respuesta segura'},database);expect(result.user).not.toHaveProperty('passwordHash');expect(await database.authSession.count()).toBe(0);
},30000);

dbtest('ADM-DB-05: HTTP consulta perfiles seguros, guarda permisos y expone auditoría',async()=>{
 await clear();const admin=await account('ADMIN'),target=await account();
 const express=(await import('express')).default;
 const {createAdminRouter}=await import('@/controllers/admin.controller');
 const {requireAdmin}=await import('@/middlewares/admin.middleware');
 const app=express();app.use('/admin',createAdminRouter(database,requireAdmin({me:async()=>admin})));
 const server=app.listen(0,'127.0.0.1');const address=server.address();if(!address || typeof address==='string')throw Error('No port');
 const base=`http://127.0.0.1:${address.port}/admin`;
 try {
  const list=await fetch(base+'/users?role=USER');expect(list.status).toBe(200);const data=await list.json() as {users:any[];total:number};expect(data.total).toBe(1);expect(data.users[0].email).toBe(target.email);expect(data.users[0]).not.toHaveProperty('passwordHash');
  expect((await fetch(base+'/users?role[]=ADMIN')).status).toBe(400);
  expect((await fetch(base+`/users/${target.id}`,{method:'PATCH',headers:{'Content-Type':'text/plain'},body:'x'})).status).toBe(415);
  const changed=await fetch(base+`/users/${target.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'ADMIN',reason:'Prueba aislada de endpoint'})});expect(changed.status).toBe(200);
  const audit=await (await fetch(base+'/audit')).json() as {entries:any[]};expect(audit.entries).toHaveLength(1);expect(audit.entries[0].actor.email).toBe(admin.email);expect(audit.entries[0].after.role).toBe('ADMIN');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
},30000);

dbtest('REC-DB-01: token único cambia contraseña, conserva rol y revoca sesiones',async()=>{
 await clear();const target=await account('ADMIN');const {createRecoveryRepository}=await import('@/services/password-recovery.service');const repo=createRecoveryRepository(database),hash='d'.repeat(64),now=new Date();await repo.issue(target.email,hash,new Date(now.getTime()+60000));await database.authSession.create({data:{userId:target.id,tokenHash:'e'.repeat(64),expiresAt:new Date(now.getTime()+60000)}});
 const results=await Promise.all([repo.consume(hash,'new-test-hash',now),repo.consume(hash,'other-test-hash',now)]);expect(results.filter(Boolean)).toHaveLength(1);expect(await database.authSession.count()).toBe(0);expect(await database.passwordReset.count()).toBe(0);expect((await database.user.findUnique({where:{id:target.id}}))?.role).toBe('ADMIN');expect(await repo.consume(hash,'replay',now)).toBe(false);
},30000);
dbtest('REC-DB-02: reemisión invalida anterior; vencidos/bloqueados no cambian contraseña',async()=>{
 await clear();const admin=await account('ADMIN'),target=await account();const {createRecoveryRepository}=await import('@/services/password-recovery.service');const repo=createRecoveryRepository(database),now=new Date();await repo.issue(target.email,'1'.repeat(64),new Date(now.getTime()+60000));await repo.issue(target.email,'2'.repeat(64),new Date(now.getTime()+60000));expect(await repo.consume('1'.repeat(64),'wrong',now)).toBe(false);await repo.issue(target.email,'3'.repeat(64),new Date(now.getTime()-1000));expect(await repo.consume('3'.repeat(64),'wrong',now)).toBe(false);
 await changeUser(admin.id,target.id,{status:'BLOCKED',reason:'Prueba aislada recuperación'},database);expect(await database.passwordReset.count()).toBe(0);expect(await repo.issue(target.email,'4'.repeat(64),new Date(now.getTime()+60000))).toBeNull();expect(await repo.consume('2'.repeat(64),'wrong',now)).toBe(false);expect((await database.user.findUnique({where:{id:target.id}}))?.passwordHash).toBe('not-a-real-login');
},30000);
dbtest('REC-DB-03: login verificado antes del cambio no crea sesión después',async()=>{
 await clear();const target=await account();const {createAuthRepository}=await import('@/services/auth.service');const repo=createAuthRepository(database);await database.user.update({where:{id:target.id},data:{passwordHash:'new-test-hash'}});
 expect(await rejection(repo.createSession({tokenHash:'f'.repeat(64),userId:target.id,expectedPasswordHash:'not-a-real-login',expiresAt:new Date(Date.now()+60000)}))).toMatchObject({code:'INVALID_CREDENTIALS'});expect(await database.authSession.count()).toBe(0);await repo.createSession({tokenHash:'f'.repeat(64),userId:target.id,expectedPasswordHash:'new-test-hash',expiresAt:new Date(Date.now()+60000)});expect(await database.authSession.count()).toBe(1);
},30000);

dbtest('PWD-DB-01: cambio conserva rol, rota sesión sin ampliar plazo y revoca resto/enlaces',async()=>{
 await clear();const target=await account('ADMIN'),other=await account(),expiresAt=new Date(Date.now()+600000),old='5'.repeat(64),fresh='6'.repeat(64);
 await database.authSession.createMany({data:[{userId:target.id,tokenHash:old,expiresAt},{userId:target.id,tokenHash:'7'.repeat(64),expiresAt},{userId:other.id,tokenHash:'8'.repeat(64),expiresAt}]});await database.passwordReset.create({data:{userId:target.id,tokenHash:'9'.repeat(64),expiresAt}});
 const {createPasswordChangeRepository}=await import('@/services/change-password.service');const repo=createPasswordChangeRepository(database);expect(await repo.commit(old,'not-a-real-login','new-test-hash',fresh,new Date())).toEqual(expiresAt);
 expect(await database.authSession.count({where:{userId:target.id}})).toBe(1);expect(await database.authSession.findUnique({where:{tokenHash:old}})).toBeNull();expect(await database.passwordReset.count()).toBe(0);expect(await database.authSession.count({where:{userId:other.id}})).toBe(1);expect((await database.user.findUnique({where:{id:target.id}}))?.role).toBe('ADMIN');
 expect(await repo.commit(old,'not-a-real-login','another','a'.repeat(64),new Date())).toBeNull();
},30000);
dbtest('PWD-DB-02: contraseña obsoleta o cuenta bloqueada no permite cambios',async()=>{
 await clear();const target=await account(),expiresAt=new Date(Date.now()+600000),old='5'.repeat(64);await database.authSession.create({data:{userId:target.id,tokenHash:old,expiresAt}});const {createPasswordChangeRepository}=await import('@/services/change-password.service');const repo=createPasswordChangeRepository(database);
 expect(await repo.commit(old,'stale','wrong','6'.repeat(64),new Date())).toBeNull();await database.user.update({where:{id:target.id},data:{status:'BLOCKED'}});expect(await repo.commit(old,'not-a-real-login','wrong','6'.repeat(64),new Date())).toBeNull();expect((await database.user.findUnique({where:{id:target.id}}))?.passwordHash).toBe('not-a-real-login');
},30000);

dbtest('SES-DB-01: lista propia excluye vencidas y oculta hashes; cierra ajena propia preservando actual',async()=>{
 await clear();const target=await account(),other=await account(),expiresAt=new Date(Date.now()+600000),current='a'.repeat(64);
 const a=await database.authSession.create({data:{userId:target.id,tokenHash:current,expiresAt}}),b=await database.authSession.create({data:{userId:target.id,tokenHash:'b'.repeat(64),expiresAt}}),foreign=await database.authSession.create({data:{userId:other.id,tokenHash:'c'.repeat(64),expiresAt}});const expired=await database.authSession.create({data:{userId:target.id,tokenHash:'d'.repeat(64),expiresAt:new Date(0)}});
 const {createSessionManagementRepository}=await import('@/services/session-management.service');const repo=createSessionManagementRepository(database),rows=await repo.list(target.id,current,new Date());expect(rows).toHaveLength(2);expect(rows!.filter(row=>row.isCurrent).map(row=>row.id)).toEqual([a.id]);expect(JSON.stringify(rows)).not.toContain('tokenHash');expect(await repo.revoke(target.id,current,b.id,new Date())).toBe(1);expect(await database.authSession.findUnique({where:{id:a.id}})).not.toBeNull();expect(await database.authSession.findUnique({where:{id:foreign.id}})).not.toBeNull();
 expect(await rejection(repo.revoke(target.id,current,expired.id,new Date()))).toMatchObject({code:'SESSION_NOT_FOUND'});expect(await rejection(repo.revoke(target.id,current,foreign.id,new Date()))).toMatchObject({code:'SESSION_NOT_FOUND'});expect(await rejection(repo.revoke(target.id,current,a.id,new Date()))).toMatchObject({code:'CURRENT_SESSION_PROTECTED'});
},30000);
dbtest('SES-DB-02: cerrar otras conserva actual y no afecta otra cuenta; sesión revocada no gestiona accesos',async()=>{
 await clear();const target=await account(),other=await account(),expiresAt=new Date(Date.now()+600000),current='a'.repeat(64);await database.authSession.createMany({data:[{userId:target.id,tokenHash:current,expiresAt},{userId:target.id,tokenHash:'b'.repeat(64),expiresAt},{userId:other.id,tokenHash:'c'.repeat(64),expiresAt}]});const {createSessionManagementRepository}=await import('@/services/session-management.service');const repo=createSessionManagementRepository(database);expect(await repo.revoke(target.id,current,null,new Date())).toBe(1);expect(await database.authSession.count({where:{userId:target.id}})).toBe(1);expect(await database.authSession.count({where:{userId:other.id}})).toBe(1);await database.authSession.deleteMany({where:{tokenHash:current}});expect(await rejection(repo.revoke(target.id,current,null,new Date()))).toMatchObject({code:'UNAUTHENTICATED'});
},30000);

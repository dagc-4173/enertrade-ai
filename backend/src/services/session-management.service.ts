import {createHash} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import type {Prisma} from '@/generated/prisma/client';
import {AuthError} from './auth.service';
export interface ManagedSession {id:string;createdAt:Date;expiresAt:Date;isCurrent:boolean}
export interface SessionManagementRepository {
 list(userId:string,tokenHash:string,now:Date):Promise<ManagedSession[]|null>;
 revoke(userId:string,tokenHash:string,targetId:string|null,now:Date):Promise<number>;
}
export function createSessionManagementRepository(database=prisma):SessionManagementRepository {
 async function locked<T>(userId:string,tokenHash:string,now:Date,action:(tx:Prisma.TransactionClient)=>Promise<T>) {
  return database.$transaction(async tx=>{
   const users=await tx.$queryRaw<Array<{status:string}>>`SELECT "status" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`;
   const current=await tx.authSession.findUnique({where:{tokenHash}});
   if(users[0]?.status!=='ACTIVE' || !current || current.userId!==userId || current.expiresAt<=new Date(Math.max(now.getTime(),Date.now())))throw new AuthError(401,'UNAUTHENTICATED','Debes iniciar sesión nuevamente.');
   return action(tx);
  },{maxWait:10000,timeout:15000});
 }
 return {
  list:(userId,tokenHash,now)=>locked(userId,tokenHash,now,async tx=>{
   const current=await tx.authSession.findUnique({where:{tokenHash},select:{id:true}});
   const rows=await tx.authSession.findMany({where:{userId,expiresAt:{gt:now}},select:{id:true,createdAt:true,expiresAt:true},orderBy:[{createdAt:'desc'},{id:'asc'}]});
   return rows.map(row=>({...row,isCurrent:row.id===current!.id}));
  }),
  revoke:(userId,tokenHash,targetId,now)=>locked(userId,tokenHash,now,async tx=>{
   const current=await tx.authSession.findUnique({where:{tokenHash},select:{id:true}});
   if(targetId===current!.id)throw new AuthError(409,'CURRENT_SESSION_PROTECTED','Para cerrar esta sesión utiliza Cerrar sesión.');
   const result=await tx.authSession.deleteMany({where:{userId,expiresAt:{gt:new Date(Math.max(now.getTime(),Date.now()))},tokenHash:{not:tokenHash},...(targetId?{id:targetId}:{})}});
   if(targetId && !result.count)throw new AuthError(404,'SESSION_NOT_FOUND','La sesión no existe o ya fue cerrada.');
   return result.count;
  })
 };
}
export function createSessionManagementService(repo:SessionManagementRepository=createSessionManagementRepository(),now=()=>new Date()) {
 function tokenHash(token?:string){if(!token || !/^[A-Za-z0-9_-]{43}$/.test(token))throw new AuthError(401,'UNAUTHENTICATED','Debes iniciar sesión.');return createHash('sha256').update(token).digest('hex')}
 return {
  async list(userId:string,token?:string){const sessions=await repo.list(userId,tokenHash(token),now());if(!sessions)throw new AuthError(401,'UNAUTHENTICATED','Debes iniciar sesión.');return {sessions}},
  async revoke(userId:string,token:string|undefined,id:string|null){if(id!==null && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))throw new AuthError(400,'INVALID_SESSION_ID','La sesión indicada no es válida.');return {revoked:await repo.revoke(userId,tokenHash(token),id,now())}}
 };
}

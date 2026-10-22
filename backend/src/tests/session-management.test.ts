import {afterAll,expect,test} from 'bun:test';
import express from 'express';
import {AuthError} from '@/services/auth.service';
import {createSessionManagementService,type SessionManagementRepository} from '@/services/session-management.service';
import {createSessionManagementRouter} from '@/controllers/session-management.controller';
const token='a'.repeat(43),id=crypto.randomUUID();
test('SES-01: transmite identidad de sesión y hash sin exponer token',async()=>{
 let input:any;const row={id,createdAt:new Date(),expiresAt:new Date(Date.now()+60000),isCurrent:true};const repo:SessionManagementRepository={list:async(...args)=>{input=args;return [row]},revoke:async()=>1};
 const service=createSessionManagementService(repo);expect(await service.list('owned',token)).toEqual({sessions:[row]});expect(input[0]).toBe('owned');expect(input[1]).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(await service.list('owned',token))).not.toContain(token);expect(await service.revoke('owned',token,id)).toEqual({revoked:1});
});
test('SES-02: exige cookie válida e identificador UUID',async()=>{
 const service=createSessionManagementService({list:async()=>[],revoke:async()=>0});for(const value of [undefined,'forged']){let error;try{await service.list('owned',value)}catch(reason){error=reason}expect(error).toMatchObject({code:'UNAUTHENTICATED'})}
 let error;try{await service.revoke('owned',token,'bad')}catch(reason){error=reason}expect(error).toMatchObject({code:'INVALID_SESSION_ID'});
});
const servers:ReturnType<typeof express.application.listen>[]=[];afterAll(()=>{for(const server of servers)server.close()});
function listen(authenticated=true){const app=express();const seen:string[]=[];const service={list:async(userId:string)=>{seen.push(userId);return {sessions:[]}},revoke:async(userId:string,_token:string|undefined,target:string|null)=>{seen.push(userId);return {revoked:target?1:2}}};app.use('/auth/sessions',createSessionManagementRouter(service,{me:async()=>{if(!authenticated)throw new AuthError(401,'UNAUTHENTICATED','Inicia sesión');return {id:'session-owner',name:'Test',email:'test@example.test',createdAt:new Date()}}}));const server=app.listen(0,'127.0.0.1');servers.push(server);const address=server.address();if(!address || typeof address==='string')throw Error('No port');return {base:`http://127.0.0.1:${address.port}/auth/sessions`,seen}}
test('SES-03: rutas consultan y cierran solo para el dueño autenticado',async()=>{
 const {base,seen}=listen();expect((await fetch(base)).status).toBe(200);expect((await fetch(base+'/revoke-others',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(200);expect(seen).toEqual(['session-owner','session-owner']);
});
test('SES-04: rechaza anónimos, origen cruzado e identidad ajena en cuerpo',async()=>{
 expect((await fetch(listen(false).base)).status).toBe(401);const {base,seen}=listen();expect((await fetch(base+'/revoke-others',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://foreign.example.test'},body:'{}'})).status).toBe(403);expect((await fetch(base+'/revoke-others',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'foreign'})})).status).toBe(400);expect(seen).toHaveLength(0);expect((await fetch(base+'?userId=foreign')).status).toBe(400);
});

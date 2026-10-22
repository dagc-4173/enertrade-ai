import {afterAll,expect,test} from 'bun:test';
import express from 'express';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDeploymentHttpApp} from '@/deployment/http-app';
import {deploymentConfig} from '@/deployment/config';
import {createAuthRouter} from '@/controllers/auth.controller';
const directory=await mkdtemp(join(tmpdir(),'enertrade-deployment-'));
await mkdir(join(directory,'assets'));await writeFile(join(directory,'index.html'),'<!doctype html><html><body>EnerTrade build verificado</body></html>');await writeFile(join(directory,'assets','bundle.js'),'console.log("asset");');await writeFile(join(directory,'.env'),'private-fixture');
const user={id:crypto.randomUUID(),name:'Deployment fixture',email:'fixture@example.test',createdAt:new Date(),role:'USER' as const,status:'ACTIVE' as const};let authenticated=false;
const api=express();api.get('/health',(_req,res)=>res.json({status:'ok'}));api.use('/auth',createAuthRouter({register:async()=>user,login:async()=>{authenticated=true;return {token:'a'.repeat(43),user}},me:async(token)=>{if(!authenticated||token!=='a'.repeat(43))throw Error('Missing test cookie');return user},logout:async()=>{authenticated=false}}));
const server=createDeploymentHttpApp(api,directory).listen(0,'127.0.0.1');const address=server.address();if(!address||typeof address==='string')throw Error('No port');const base=`http://127.0.0.1:${address.port}`;
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true})});
test('DEP-01: frontend y API comparten dirección sin confundir JSON con HTML',async()=>{
 const frontend=await fetch(base+'/');expect(await frontend.text()).toContain('EnerTrade build verificado');const health=await fetch(base+'/api/health');expect(await health.json()).toEqual({status:'ok'});const missing=await fetch(base+'/api/unknown',{headers:{Accept:'text/html'}});expect(missing.status).toBe(404);expect(missing.headers.get('content-type')).toContain('application/json');
});
test('DEP-02: recursos de build se sirven con caché y secretos no se publican',async()=>{
 const asset=await fetch(base+'/assets/bundle.js');expect(asset.status).toBe(200);expect(asset.headers.get('cache-control')).toContain('immutable');expect((await fetch(base+'/assets/missing.js')).status).toBe(404);const hidden=await fetch(base+'/.env');expect(hidden.status).not.toBe(200);expect(await hidden.text()).not.toContain('private-fixture');expect((await fetch(base+'/')).headers.get('cache-control')).toBe('no-cache');
});
test('DEP-03: cookie de sesión funciona a través de /api con mismo origen',async()=>{
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:'test-only-long-password'})});expect(login.status).toBe(200);const cookie=login.headers.get('set-cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Path=/');const me=await fetch(base+'/api/auth/me',{headers:{Cookie:cookie.split(';')[0]!}});expect(me.status).toBe(200);expect(await me.json()).toMatchObject({user:{id:user.id}});
});
test('DEP-04: configuración exige origen HTTPS en producción y proxy acotado',()=>{
 const env={NODE_ENV:'production',DATABASE_URL:'postgresql://fixture',FRONTEND_DIST_DIR:directory,FRONTEND_ORIGIN:'https://enertrade.example.test'};
 expect(deploymentConfig(env).production).toBe(true);expect(()=>deploymentConfig({...env,FRONTEND_ORIGIN:'http://enertrade.example.test'})).toThrow('INVALID_PUBLIC_ORIGIN');expect(()=>deploymentConfig({...env,TRUST_PROXY_HOPS:'true'})).toThrow('INVALID_TRUST_PROXY_HOPS');expect(()=>deploymentConfig({...env,PORT:'0'})).toThrow('INVALID_DEPLOYMENT_PORT');expect(()=>deploymentConfig({...env,DATABASE_URL:''})).toThrow('DEPLOYMENT_DATABASE_REQUIRED');
});

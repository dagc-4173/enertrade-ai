import express,{type ErrorRequestHandler} from 'express';
import {createHash} from 'node:crypto';
import {AuthError} from '@/services/auth.service';
import {createPasswordRecoveryService,recoveryEmail,recoveryNotice} from '@/services/password-recovery.service';
import {adminOrigin} from '@/middlewares/admin.middleware';
import {logUnexpectedError,safeLogger} from '@/lib/safe-logger';
export function createPasswordRecoveryRouter(service=createPasswordRecoveryService(),clock=()=>Date.now()) {
 const router=express.Router();
 const limits=new Map<string,{count:number;until:number}>();
 const jobs=new Set<Promise<void>>();
 let activeResets=0;
 function limited(key:string,max:number) {
  const now=clock();for(const [key,item] of limits)if(item.until<=now)limits.delete(key);
  const item=limits.get(key)??{count:0,until:now+15*60*1000};item.count++;limits.set(key,item);return item.count>max;
 }
 router.use(adminOrigin,(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(req.method==='POST' && !req.is('application/json')){res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'Se requiere Content-Type application/json.'});return;}
  // Bound the process-local map even when clients invent addresses.
  for(const [key,item] of limits)if(item.until<=clock())limits.delete(key);
  if(limits.size>10000){res.set('Retry-After','900').status(429).json({error:'AUTH_RATE_LIMITED',message:'Demasiadas solicitudes. Inténtalo más tarde.'});return;}
  if(req.method==='POST' && limited(`ip:${req.ip}`,req.path==='/forgot-password'?5:10)){res.set('Retry-After','900').status(429).json({error:'AUTH_RATE_LIMITED',message:'Demasiadas solicitudes. Inténtalo más tarde.'});return;}next();
 },express.json({limit:'4kb'}));
 router.post('/forgot-password',(req,res)=>{
  const email=recoveryEmail(req.body);
  if(!service.ready())throw new AuthError(503,'RECOVERY_UNAVAILABLE','La recuperación por correo aún no está disponible. Contacta al administrador.');
  const key=createHash('sha256').update(email).digest('hex');
  if(limited(`email:${key}`,3)){res.status(202).json({message:recoveryNotice});return;}
  if(jobs.size>=20)throw new AuthError(503,'RECOVERY_BUSY','Hay varias solicitudes en proceso. Inténtalo más tarde.');
  // Return before account lookup or SMTP: content and latency do not reveal registration.
  const job=Promise.resolve().then(()=>service.request(email)).catch(error=>{logUnexpectedError(safeLogger,req,error,'RECOVERY_DELIVERY_FAILED');});
  jobs.add(job);void job.finally(()=>jobs.delete(job));
  res.status(202).json({message:recoveryNotice});
 });
 router.post('/reset-password',async(req,res)=>{
  if(activeResets>=4)throw new AuthError(503,'RECOVERY_BUSY','Hay varias solicitudes en proceso. Inténtalo más tarde.');
  activeResets++;try{await service.reset(req.body);res.json({message:'Contraseña actualizada. Inicia sesión nuevamente.'});}finally{activeResets--;}
 });
 const errors:ErrorRequestHandler=(error,_req,res,_next)=>{
  if(error instanceof AuthError){res.status(error.status).json({error:error.code,message:error.message});return;}
  if(error?.type==='entity.parse.failed' || error?.type==='entity.too.large'){res.status(error.type==='entity.too.large'?413:400).json({error:'INVALID_RECOVERY_REQUEST',message:'Revisa el formato y tamaño de la solicitud.'});return;}
  res.status(500).json({error:'RECOVERY_FAILED',message:'No fue posible completar la recuperación. Inténtalo más tarde.'});
 };router.use(errors);return router;
}
export const router=createPasswordRecoveryRouter();

import express,{type ErrorRequestHandler} from 'express';
import {requireAuth,type AuthLookup} from '@/middlewares/auth.middleware';
import {adminOrigin} from '@/middlewares/admin.middleware';
import {AuthError,authCookieName,sessionTokenFromCookieHeader} from '@/services/auth.service';
import {createChangePasswordService} from '@/services/change-password.service';
export function createChangePasswordRouter(service=createChangePasswordService(),auth?:AuthLookup,clock=()=>Date.now()) {
 const router=express.Router(),attempts=new Map<string,{count:number;until:number}>();let running=0;
 router.use(adminOrigin,requireAuth(auth));
 router.use((req,res,next)=>{
  if(!req.is('application/json')){res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'Se requiere Content-Type application/json.'});return;}
  const now=clock();for(const [key,item] of attempts)if(item.until<=now)attempts.delete(key);
  const key=req.authUser!.id,item=attempts.get(key)??{count:0,until:now+15*60*1000};item.count++;attempts.set(key,item);
  if(item.count>5 || attempts.size>10000){res.set('Retry-After','900').status(429).json({error:'AUTH_RATE_LIMITED',message:'Demasiados intentos. Inténtalo más tarde.'});return;}next();
 },express.json({limit:'4kb'}));
 router.post('/change-password',async(req,res)=>{
  if(running>=4)throw new AuthError(503,'PASSWORD_CHANGE_BUSY','Hay varias solicitudes en proceso. Inténtalo más tarde.');
  running++;try {
   const result=await service.change(req.body,sessionTokenFromCookieHeader(req.headers.cookie));
   res.cookie(authCookieName,result.token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',expires:result.expiresAt});
   res.json({message:'Contraseña actualizada. Las otras sesiones se cerraron y los enlaces de recuperación anteriores ya no son válidos.'});
  }finally{running--;}
 });
 const errors:ErrorRequestHandler=(error,_req,res,_next)=>{
  if(error instanceof AuthError){res.status(error.status).json({error:error.code,message:error.message});return;}
  if(error?.type==='entity.parse.failed' || error?.type==='entity.too.large'){res.status(error.type==='entity.too.large'?413:400).json({error:'INVALID_PASSWORD_CHANGE',message:'Revisa el formato y tamaño de la solicitud.'});return;}
  res.status(500).json({error:'PASSWORD_CHANGE_FAILED',message:'No fue posible cambiar la contraseña. Inténtalo más tarde.'});
 };router.use(errors);return router;
}
export const router=createChangePasswordRouter();

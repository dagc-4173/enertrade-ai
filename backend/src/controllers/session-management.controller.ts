import express,{type ErrorRequestHandler} from 'express';
import {requireAuth,type AuthLookup} from '@/middlewares/auth.middleware';
import {adminOrigin} from '@/middlewares/admin.middleware';
import {AuthError,sessionTokenFromCookieHeader} from '@/services/auth.service';
import {createSessionManagementService} from '@/services/session-management.service';
export function createSessionManagementRouter(service=createSessionManagementService(),auth?:AuthLookup) {
 const router=express.Router();router.use(adminOrigin,requireAuth(auth));
 router.use((req,res,next)=>{if(req.method==='POST' && !req.is('application/json')){res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'Se requiere Content-Type application/json.'});return;}next()},express.json({limit:'1kb'}));
 router.use((req,_res,next)=>{if(Object.keys(req.query).length || (req.body!==undefined && (!req.body || typeof req.body!=='object' || Array.isArray(req.body) || Object.keys(req.body).length)))return next(new AuthError(400,'INVALID_SESSION_REQUEST','La consulta no admite parámetros ni datos adicionales.'));next()});
 router.get('/',async(req,res)=>{res.json(await service.list(req.authUser!.id,sessionTokenFromCookieHeader(req.headers.cookie)))});
 router.post('/revoke-others',async(req,res)=>{res.json(await service.revoke(req.authUser!.id,sessionTokenFromCookieHeader(req.headers.cookie),null))});
 router.post('/:id/revoke',async(req,res)=>{res.json(await service.revoke(req.authUser!.id,sessionTokenFromCookieHeader(req.headers.cookie),String(req.params.id)))});
 const errors:ErrorRequestHandler=(error,_req,res,_next)=>{
  if(error instanceof AuthError){res.status(error.status).json({error:error.code,message:error.message});return;}
  if(error?.type==='entity.parse.failed' || error?.type==='entity.too.large'){res.status(error.type==='entity.too.large'?413:400).json({error:'INVALID_SESSION_REQUEST',message:'Revisa el formato y tamaño de la solicitud.'});return;}
  res.status(500).json({error:'SESSION_OPERATION_FAILED',message:'No fue posible gestionar tus sesiones. Inténtalo de nuevo.'});
 };router.use(errors);return router;
}
export const router=createSessionManagementRouter();

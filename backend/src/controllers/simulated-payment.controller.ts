import express, { Router, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { createSimulatedPaymentService, SimulatedPaymentError } from '@/services/simulated-payment.service';
export function createSimulatedPaymentRouter(service = createSimulatedPaymentService(), auth = requireAuth()) {
 const router=Router();router.use(auth);
 router.get('/payables',async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json(await service.payables(req.authUser!.id))}catch(error){next(error)}});
 router.get('/transactions/:id',async(req,res,next)=>{try{res.json(await service.list(req.authUser!.id,req.params.id))}catch(error){next(error)}});
 router.post('/',express.json({limit:'4kb'}),async(req,res,next)=>{try{const result=await service.create(req.authUser!.id,req.body);res.status(result.replayed?200:201).json(result)}catch(error){next(error)}});
 router.post('/:id/resolve',express.json({limit:'1kb'}),async(req,res,next)=>{try{res.json({attempt:await service.resolve(req.authUser!.id,req.params.id,req.body)})}catch(error){next(error)}});
 const errors:ErrorRequestHandler=(error,_req,res,_next)=>{
  if(error instanceof SimulatedPaymentError){res.status(error.status).json({error:error.code,message:error.message});return}
  if(error?.code==='P2034'||error?.code==='P2002'){res.status(409).json({error:'SIMULATED_PAYMENT_CONFLICT',message:'Otro intento cambió el estado del pago. Actualiza e intenta nuevamente.'});return}
  res.status(error?.type==='entity.parse.failed'?400:error?.status===413?413:500).json({error:'SIMULATED_PAYMENT_FAILED',message:'No fue posible procesar el pago simulado.'});
 };router.use(errors);return router;
}
export const router=createSimulatedPaymentRouter();

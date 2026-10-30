import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { adminOrigin } from '@/middlewares/admin.middleware';
import { forecastHistoryService } from '@/services/forecast-history.service';
import { ForecastHistoryError } from '@/services/forecast-history.contract';
import { EnergySeriesError } from '@/services/energy-series.service';
export function createForecastHistoryRouter(service = forecastHistoryService, auth: RequestHandler = requireAuth()) {
  const router = Router();
  router.use(auth,adminOrigin);
  router.get('/',async(req,res,next)=>{try{res.json(await service.list(req.authUser!.id,req.query))}catch(e){next(e)}});
  router.get('/:id',async(req,res,next)=>{try{if(Object.keys(req.query).length)throw new ForecastHistoryError(400,'INVALID_HISTORY_REQUEST','No se admiten parámetros adicionales.');res.json(await service.get(req.authUser!.id,req.params.id as string))}catch(e){next(e)}});
  router.post('/:id/evaluate',(req,res,next)=>{if(!req.is('application/json')){res.status(415).json({error:'JSON_REQUIRED',message:'Se requiere JSON.'});return}next()},express.json({limit:'1kb'}),async(req,res,next)=>{
    try{if(!req.body || typeof req.body!=='object' || Array.isArray(req.body) || Object.keys(req.body).length || Object.keys(req.query).length)throw new ForecastHistoryError(400,'INVALID_HISTORY_REQUEST','La evaluación usa los datos guardados; no admite valores enviados por el cliente.');res.json(await service.evaluate(req.authUser!.id,req.params.id as string))}catch(e){next(e)}
  });
  const errors: ErrorRequestHandler = (e,_req,res,_next) => {
    if(e instanceof ForecastHistoryError || e instanceof EnergySeriesError){res.status(e.status).json({error:e.code,message:e.message});return}
    const status=e?.status===413?413:e?.type==='entity.parse.failed'?400:503;
    res.status(status).json({error:'FORECAST_HISTORY_FAILED',message:status===503?'No fue posible consultar o guardar el seguimiento. Intenta nuevamente.':'La solicitud no contiene JSON válido o supera el límite.'});
  };
  router.use(errors);
  return router;
}
export const router = createForecastHistoryRouter();

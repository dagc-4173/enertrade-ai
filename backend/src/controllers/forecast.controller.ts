import express, { Router, type ErrorRequestHandler } from 'express';
import { forecastSupply } from '@/services/forecast.service';
import { ForecastError, messages } from '@/services/forecast.contract';
export function createForecastRouter(service = forecastSupply) {
  const router = Router();
  router.post('/supply', (req,res,next) => {
    if (!req.is('application/json')) { res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'Se requiere Content-Type application/json.'}); return; } next();
  }, express.json({limit:'16kb'}), async (req,res,next) => { try { res.json(await service(req.body)); } catch (error) { next(error); } });
  const errorHandler: ErrorRequestHandler = (error,_req,res,_next) => {
    if (error instanceof ForecastError) { res.status(error.status).json({...error.code === 'FORECAST_DATA_INSUFFICIENT' ? {status:'unavailable'} : {}, error:error.code,message:error.message}); }
    else if (error?.type === 'entity.parse.failed') res.status(400).json({error:'INVALID_FORECAST_REQUEST',message:messages.INVALID_FORECAST_REQUEST});
    else if (error?.status === 413) res.status(413).json({error:'FORECAST_REQUEST_TOO_LARGE',message:'La solicitud supera el tamaño permitido.'});
    else if (error?.status === 415) res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'La codificación del contenido no está admitida.'});
    else res.status(500).json({error:'FORECAST_FAILED',message:messages.FORECAST_FAILED});
  };
  router.use(errorHandler); return router;
}
export const router = createForecastRouter();

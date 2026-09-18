import {getDemandForecastMetrics} from '@/services/demand-forecast-metrics.service';
import { forecastDemand } from '@/services/demand-forecast.service';
import express, { Router, type ErrorRequestHandler, type Request, type Response, type NextFunction } from 'express';
import { forecastSupply } from '@/services/forecast.service';
import { ForecastError, messages } from '@/services/forecast.contract';
import {getForecastMetrics} from '@/services/forecast-metrics.service';
import { forecastPrice } from '@/services/price-forecast.service';
import { priceForecastTrace, type TraceState } from '@/services/price-forecast-trace.service';
import { logUnexpectedError, safeLogger, type SafeLogger } from '@/lib/safe-logger';
export function createForecastRouter(service = forecastSupply, metrics = getForecastMetrics, demand = forecastDemand, demandMetrics = getDemandForecastMetrics, price = forecastPrice, trace = priceForecastTrace, logger: SafeLogger = safeLogger) {
  const router = Router();
  router.get('/supply/metrics',async(req,res)=>{
    try{
      let hasBody=Number(req.get('Content-Length') ?? 0)>0 || req.get('Transfer-Encoding')!==undefined;
      if(!hasBody)for await(const chunk of req)if(chunk.length){hasBody=true;break;}
      if(hasBody||Object.keys(req.query).length){res.status(400).json({error:'INVALID_FORECAST_REQUEST',message:messages.INVALID_FORECAST_REQUEST});return;}
      res.json(metrics());
    }catch(error){
      if(error instanceof ForecastError){res.status(error.status).json({status:'unavailable',error:error.code,message:error.message});}
      else { logUnexpectedError(logger, req, error, 'FORECAST_FAILED'); res.status(500).json({error:'FORECAST_FAILED',message:messages.FORECAST_FAILED}); }
    }
  });
  router.get('/demand/metrics',async(req,res)=>{
    try{
      let hasBody=Number(req.get('Content-Length') ?? 0)>0 || req.get('Transfer-Encoding')!==undefined;
      if(!hasBody)for await(const chunk of req)if(chunk.length){hasBody=true;break;}
      if(hasBody||Object.keys(req.query).length){res.status(400).json({error:'INVALID_FORECAST_REQUEST',message:messages.INVALID_FORECAST_REQUEST});return;}
      res.json(demandMetrics());
    }catch(error){
      if(error instanceof ForecastError){res.status(error.status).json({status:'unavailable',error:error.code,message:error.message});}
      else { logUnexpectedError(logger, req, error, 'FORECAST_FAILED'); res.status(500).json({error:'FORECAST_FAILED',message:messages.FORECAST_FAILED}); }
    }
  });
  router.post('/supply', (req,res,next) => {
    if (!req.is('application/json')) { res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'Se requiere Content-Type application/json.'}); return; } next();
  }, express.json({limit:'16kb'}), async (req,res,next) => { try { res.json(await service(req.body)); } catch (error) { next(error); } });
  router.post('/demand', (req,res,next) => {
    if (!req.is('application/json')) { res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'Se requiere Content-Type application/json.'}); return; } next();
  }, express.json({limit:'16kb'}), async (req,res,next) => { try { res.json(await demand(req.body)); } catch (error) { next(error); } });
  const priceError: ErrorRequestHandler = async (error,req,res,_next) => {
    let status = 500, code = 'FORECAST_FAILED', message: string = messages.FORECAST_FAILED;
    if (error instanceof ForecastError) { status = error.status; code = error.code; message = error.message; }
    else if (error?.type === 'entity.parse.failed') { status = 400; code = 'INVALID_FORECAST_REQUEST'; message = messages.INVALID_FORECAST_REQUEST; }
    else if (error?.status === 413) { status = 413; code = 'FORECAST_REQUEST_TOO_LARGE'; message = 'La solicitud supera el tamaño permitido.'; }
    else if (error?.status === 415) {
      status = 415; code = 'UNSUPPORTED_MEDIA_TYPE';
      message = error.type === 'price.content-type.unsupported'
        ? 'Se requiere Content-Type application/json.'
        : 'La codificación del contenido no está admitida.';
    }
    const state = res.locals.priceTrace as TraceState;
    const saved = await trace.failExecution(state, req.body, status, code);
    if (status === 500) logUnexpectedError(logger, req, error, code);
    res.status(status).json({ ...(code === 'FORECAST_DATA_INSUFFICIENT' ? { status: 'unavailable' } : {}), error: code, message, trace: saved });
  };
  router.post('/price', async (_req: Request,res: Response,next: NextFunction) => {
    res.locals.priceTrace = await trace.startExecution(); next();
  }, (req: Request,_res: Response,next: NextFunction) => {
    if (!req.is('application/json')) { next({ status: 415, type: 'price.content-type.unsupported' }); return; } next();
  }, express.json({limit:'16kb'}), async (req: Request,res: Response,next: NextFunction) => {
    try {
      if (Object.keys(req.query).length) throw new ForecastError(400, 'INVALID_FORECAST_REQUEST');
      const state = res.locals.priceTrace as TraceState;
      const result = await price(req.body, state.context);
      const saved = await trace.completeExecution(state, req.body, result);
      res.json({ ...result, trace: saved });
    } catch (error) { next(error); }
  }, priceError);
  const errorHandler: ErrorRequestHandler = (error,req,res,_next) => {
    if (error instanceof ForecastError) {
      if (error.status >= 500) logUnexpectedError(logger, req, error, error.code);
      res.status(error.status).json({...error.code === 'FORECAST_DATA_INSUFFICIENT' ? {status:'unavailable'} : {}, error:error.code,message:error.message});
    }
    else if (error?.type === 'entity.parse.failed') res.status(400).json({error:'INVALID_FORECAST_REQUEST',message:messages.INVALID_FORECAST_REQUEST});
    else if (error?.status === 413) res.status(413).json({error:'FORECAST_REQUEST_TOO_LARGE',message:'La solicitud supera el tamaño permitido.'});
    else if (error?.status === 415) res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'La codificación del contenido no está admitida.'});
    else { logUnexpectedError(logger, req, error, 'FORECAST_FAILED'); res.status(500).json({error:'FORECAST_FAILED',message:messages.FORECAST_FAILED}); }
  };
  router.use(errorHandler); return router;
}
export const router = createForecastRouter();

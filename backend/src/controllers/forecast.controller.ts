import {getDemandForecastMetrics} from '@/services/demand-forecast-metrics.service';
import { forecastDemand } from '@/services/demand-forecast.service';
import express, { Router, type ErrorRequestHandler } from 'express';
import { forecastSupply } from '@/services/forecast.service';
import { ForecastError, messages } from '@/services/forecast.contract';
import {getForecastMetrics} from '@/services/forecast-metrics.service';
export function createForecastRouter(service = forecastSupply, metrics = getForecastMetrics, demand = forecastDemand, demandMetrics = getDemandForecastMetrics) {
  const router = Router();
  router.get('/supply/metrics',async(req,res)=>{
    try{
      let hasBody=Number(req.get('Content-Length') ?? 0)>0 || req.get('Transfer-Encoding')!==undefined;
      if(!hasBody)for await(const chunk of req)if(chunk.length){hasBody=true;break;}
      if(hasBody||Object.keys(req.query).length){res.status(400).json({error:'INVALID_FORECAST_REQUEST',message:messages.INVALID_FORECAST_REQUEST});return;}
      res.json(metrics());
    }catch(error){
      if(error instanceof ForecastError){res.status(error.status).json({status:'unavailable',error:error.code,message:error.message});}
      else res.status(500).json({error:'FORECAST_FAILED',message:messages.FORECAST_FAILED});
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
      else res.status(500).json({error:'FORECAST_FAILED',message:messages.FORECAST_FAILED});
    }
  });
  router.post('/supply', (req,res,next) => {
    if (!req.is('application/json')) { res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'Se requiere Content-Type application/json.'}); return; } next();
  }, express.json({limit:'16kb'}), async (req,res,next) => { try { res.json(await service(req.body)); } catch (error) { next(error); } });
  router.post('/demand', (req,res,next) => {
    if (!req.is('application/json')) { res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'Se requiere Content-Type application/json.'}); return; } next();
  }, express.json({limit:'16kb'}), async (req,res,next) => { try { res.json(await demand(req.body)); } catch (error) { next(error); } });
  const errorHandler: ErrorRequestHandler = (error,_req,res,_next) => {
    if (error instanceof ForecastError) { res.status(error.status).json({...error.code === 'FORECAST_DATA_INSUFFICIENT' ? {status:'unavailable'} : {}, error:error.code,message:error.message}); }
    else if (error?.type === 'entity.parse.failed') res.status(400).json({error:'INVALID_FORECAST_REQUEST',message:messages.INVALID_FORECAST_REQUEST});
    else if (error?.status === 413) res.status(413).json({error:'FORECAST_REQUEST_TOO_LARGE',message:'La solicitud supera el tamaÃ±o permitido.'});
    else if (error?.status === 415) res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'La codificaciÃ³n del contenido no estÃ¡ admitida.'});
    else res.status(500).json({error:'FORECAST_FAILED',message:messages.FORECAST_FAILED});
  };
  router.use(errorHandler); return router;
}
export const router = createForecastRouter();

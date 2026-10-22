import express, { Router, type RequestHandler, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { chronosHourlyService, ChronosError } from '@/services/chronos-hourly.service';

export function createChronosHourlyRouter(service = chronosHourlyService, auth: RequestHandler = requireAuth()) {
  const router = Router();
  router.use(auth);
  router.get('/models', async (_req, res, next) => { try { res.json(await service.models()); } catch (error) { next(error); } });
  router.post('/', (req, res, next) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere JSON.' }); return; }
    if (Object.keys(req.query).length) { res.status(400).json({ error: 'INVALID_CHRONOS_REQUEST', message: 'La consulta no admite parámetros adicionales.' }); return; }
    next();
  }, express.json({ limit: '1kb' }), async (req, res, next) => { try { res.json(await service.forecast(req.body)); } catch (error) { next(error); } });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ChronosError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
    const status = error?.status === 413 ? 413 : error?.type === 'entity.parse.failed' ? 400 : 503;
    res.status(status).json({ error: status === 503 ? 'CHRONOS_FAILED' : 'INVALID_CHRONOS_REQUEST', message: status === 503 ? 'No fue posible consultar el modelo experimental.' : 'La solicitud JSON no es válida o supera el límite permitido.' });
  };
  router.use(errors);
  return router;
}
export const router = createChronosHourlyRouter();

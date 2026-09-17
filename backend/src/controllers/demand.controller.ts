import express, { Router, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { EnergyMarketInputError } from '@/services/energy-market.validation';
import { createDemandService } from '@/services/demand.service';

export function createDemandRouter(service = createDemandService(), auth = requireAuth()) {
  const router = Router();
  router.use(auth);
  router.get('/mine', async (req, res, next) => {
    try { res.json({ demands: await service.findMine(req.authUser!.id) }); } catch (error) { next(error); }
  });
  router.post('/', (req, res, next) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere Content-Type application/json.' }); return; }
    next();
  }, express.json({ limit: '8kb' }), async (req, res, next) => {
    try { res.status(201).json({ demand: await service.create(req.authUser!.id, req.body) }); } catch (error) { next(error); }
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof EnergyMarketInputError) { res.status(400).json({ error: error.code, message: error.message }); return; }
    if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'INVALID_MARKET_REQUEST', message: 'El cuerpo debe contener JSON válido.' }); return; }
    if (error?.status === 413) { res.status(413).json({ error: 'MARKET_REQUEST_TOO_LARGE', message: 'La solicitud supera el tamaño permitido.' }); return; }
    res.status(500).json({ error: 'DEMAND_OPERATION_FAILED', message: 'No fue posible procesar la demanda.' });
  };
  router.use(errors);
  return router;
}

export const router = createDemandRouter();

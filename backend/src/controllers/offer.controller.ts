import express, { Router, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { EnergyMarketInputError } from '@/services/energy-market.validation';
import { createOfferService, PublicationConflictError } from '@/services/offer.service';

export function createOfferRouter(service = createOfferService(), auth = requireAuth()) {
  const router = Router();
  router.use(auth);
  router.get('/mine', async (req, res, next) => {
    try { res.json({ offers: await service.findMine(req.authUser!.id) }); } catch (error) { next(error); }
  });
  router.post('/', (req, res, next) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere Content-Type application/json.' }); return; }
    next();
  }, express.json({ limit: '8kb' }), async (req, res, next) => {
    try { res.status(201).json({ offer: await service.create(req.authUser!.id, req.body) }); } catch (error) { next(error); }
  });
  router.patch('/:id', express.json({ limit: '8kb' }), async (req, res, next) => { try { res.json({ offer: await service.update(req.authUser!.id, req.params.id, req.body) }); } catch (error) { next(error); } });
  router.post('/:id/cancel', express.json({ limit: '1kb' }), async (req, res, next) => { try { if (Object.keys(req.body ?? {}).length !== 0) throw new EnergyMarketInputError('INVALID_MARKET_REQUEST', 'La solicitud no debe incluir cuerpo.'); res.json({ offer: await service.cancel(req.authUser!.id, req.params.id) }); } catch (error) { next(error); } });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof EnergyMarketInputError) { res.status(400).json({ error: error.code, message: error.message }); return; }
    if (error instanceof PublicationConflictError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
    if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'INVALID_MARKET_REQUEST', message: 'El cuerpo debe contener JSON válido.' }); return; }
    if (error?.status === 413) { res.status(413).json({ error: 'MARKET_REQUEST_TOO_LARGE', message: 'La solicitud supera el tamaño permitido.' }); return; }
    res.status(500).json({ error: 'OFFER_OPERATION_FAILED', message: 'No fue posible procesar la oferta.' });
  };
  router.use(errors);
  return router;
}

export const router = createOfferRouter();

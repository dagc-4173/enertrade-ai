import { Router, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { createMarketService } from '@/services/market.service';

export function createMarketRouter(service = createMarketService(), auth = requireAuth()) {
  const router = Router();
  router.use(auth);
  router.get('/offers', async (req, res, next) => { try { res.json({ offers: await service.offers(req.authUser!.id) }); } catch (error) { next(error); } });
  router.get('/demands', async (req, res, next) => { try { res.json({ demands: await service.demands(req.authUser!.id) }); } catch (error) { next(error); } });
  const errors: ErrorRequestHandler = (_error, _req, res, _next) => res.status(500).json({ error: 'MARKET_OPERATION_FAILED', message: 'No fue posible consultar el mercado activo.' });
  router.use(errors);
  return router;
}

export const router = createMarketRouter();
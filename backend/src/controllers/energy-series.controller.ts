import { Router, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { EnergySeriesError, energySeriesService } from '@/services/energy-series.service';
import { logUnexpectedError, safeLogger, type SafeLogger } from '@/lib/safe-logger';

export function createEnergySeriesRouter(service = energySeriesService, authMiddleware = requireAuth(), logger: SafeLogger = safeLogger) {
  const router = Router();
  router.use(authMiddleware);
  router.get('/', async (req, res, next) => {
    try { res.json(await service.read(req.query)); }
    catch (error) { next(error); }
  });
  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof EnergySeriesError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
    logUnexpectedError(logger, req, error, 'ENERGY_SERIES_FAILED');
    res.status(500).json({ error: 'ENERGY_SERIES_FAILED', message: 'No fue posible consultar las series históricas.' });
  };
  router.use(errors);
  return router;
}

export const router = createEnergySeriesRouter();
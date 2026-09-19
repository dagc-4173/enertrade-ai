import { Router, type Request } from 'express';
import { logUnexpectedError, safeLogger, type SafeLogger } from '@/lib/safe-logger';
import { indicatorsService } from '@/services/indicators.service';

function hasBody(req: Request): boolean { return Number(req.get('Content-Length') ?? 0) > 0 || req.get('Transfer-Encoding') !== undefined; }

export function createIndicatorsRouter(service = indicatorsService, logger: SafeLogger = safeLogger) {
  const router = Router();
  router.get('/', async (req, res) => {
    if (hasBody(req) || Object.keys(req.query).length > 0) {
      res.status(400).json({ error: 'INVALID_INDICATORS_REQUEST', message: 'La consulta de indicadores no admite cuerpo ni parámetros.' });
      return;
    }
    try { res.json(await service.get()); }
    catch (error) {
      logUnexpectedError(logger, req, error, 'INDICATORS_FAILED');
      res.status(500).json({ error: 'INDICATORS_FAILED', message: 'No fue posible consultar los indicadores.' });
    }
  });
  return router;
}

export const router = createIndicatorsRouter();
import express, { type ErrorRequestHandler, type Request, type Response, type Router } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import type { MatchingService } from '@/services/matching.service';
import { logUnexpectedError, safeLogger, type SafeLogger } from '@/lib/safe-logger';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function createMatchingRouter(
  service: MatchingService,
  authMiddleware = requireAuth(),
  logger: SafeLogger = safeLogger,
): Router {
  const router = express.Router();
  router.use(express.json({ limit: '8kb' }));
  router.use(authMiddleware);

  router.post('/suggest', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!isPlainObject(body) || Object.keys(body).length > 0) {
      return res.status(400).json({ error: 'INVALID_BODY', message: 'El cuerpo debe estar vacío.' });
    }

    if (Object.keys(req.query ?? {}).length > 0) {
      return res.status(400).json({ error: 'INVALID_QUERY', details: 'No query parameters are allowed.' });
    }

    const result = await service.suggest();
    const cleaned = JSON.parse(JSON.stringify(result, (_key, value) => {
      if (value && typeof value === 'object' && 'userId' in value) {
        const clone = { ...value };
        delete clone.userId;
        return clone;
      }
      return value;
    }));

    return res.status(200).json(cleaned);
  });

  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'INVALID_JSON', message: 'El cuerpo debe contener JSON válido.' });
      return;
    }
    logUnexpectedError(logger, req, error, 'MATCHING_OPERATION_FAILED');
    res.status(500).json({ error: 'MATCHING_OPERATION_FAILED', message: 'No fue posible sugerir emparejamientos.' });
  };
  router.use(errors);
  return router;
}

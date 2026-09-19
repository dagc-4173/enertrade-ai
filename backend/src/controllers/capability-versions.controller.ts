import { Router, type Request } from 'express';
import { logUnexpectedError, safeLogger, type SafeLogger } from '@/lib/safe-logger';
import { capabilityVersionsService } from '@/services/capability-versions.service';

function hasBody(req: Request): boolean {
  return Number(req.get('Content-Length') ?? 0) > 0 || req.get('Transfer-Encoding') !== undefined;
}

export function createCapabilityVersionsRouter(service = capabilityVersionsService, logger: SafeLogger = safeLogger) {
  const router = Router();
  router.get('/versions', (req, res) => {
    if (hasBody(req) || Object.keys(req.query).length > 0) {
      res.status(400).json({ error: 'INVALID_CAPABILITY_VERSIONS_REQUEST', message: 'La consulta de versiones no admite cuerpo ni parámetros.' });
      return;
    }
    try { res.json({ capabilities: service.list() }); }
    catch (error) {
      logUnexpectedError(logger, req, error, 'CAPABILITY_VERSIONS_FAILED');
      res.status(500).json({ error: 'CAPABILITY_VERSIONS_FAILED', message: 'No fue posible consultar las versiones activas.' });
    }
  });
  return router;
}

export const router = createCapabilityVersionsRouter();
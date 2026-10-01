import express, { Router, type ErrorRequestHandler, type Request } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { XmDailySyncError, xmDailySyncService, type XmSyncMetric } from '@/services/xm-daily-sync.service';
import { logUnexpectedError, safeLogger, type SafeLogger } from '@/lib/safe-logger';

type SyncService = { availability(): Promise<unknown>; sync(metric?: XmSyncMetric): Promise<unknown> };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasBody = (req: Request) => Number(req.get('Content-Length') ?? 0) > 0 || req.get('Transfer-Encoding') !== undefined;

function metric(body: unknown): XmSyncMetric | undefined {
  if (!object(body) || Object.keys(body).some(key => key !== 'metric')) throw new XmDailySyncError(400, 'INVALID_XM_SYNC_REQUEST', 'La solicitud de sincronización XM no es válida.');
  if (body.metric === undefined) return undefined;
  if (body.metric === 'Gene' || body.metric === 'DemaSIN' || body.metric === 'PrecBolsNaci') return body.metric;
  throw new XmDailySyncError(400, 'INVALID_XM_SYNC_REQUEST', 'La solicitud de sincronización XM no es válida.');
}

// The current authentication model has no roles; requireAuth is the narrowest existing access control.
// Mounted at app root ('/'), so auth is applied per-route (never via router.use) to avoid shadowing unrelated paths.
export function createXmDailySyncRouter(service: SyncService = xmDailySyncService, auth = requireAuth(), logger: SafeLogger = safeLogger) {
  const router = Router();
  router.get('/forecast-availability', auth, async (req, res, next) => {
    try {
      if (hasBody(req) || Object.keys(req.query).length > 0) throw new XmDailySyncError(400, 'INVALID_FORECAST_AVAILABILITY_REQUEST', 'La consulta de disponibilidad no admite cuerpo ni parámetros.');
      res.json({ availability: await service.availability() });
    } catch (error) { next(error); }
  });
  router.post('/admin/xm/sync', auth, (req, res, next) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere Content-Type application/json.' }); return; }
    next();
  }, express.json({ limit: '1kb' }), async (req, res, next) => {
    try {
      if (Object.keys(req.query).length > 0) throw new XmDailySyncError(400, 'INVALID_XM_SYNC_REQUEST', 'La solicitud de sincronización XM no es válida.');
      res.json(await service.sync(metric(req.body)));
    } catch (error) { next(error); }
  });
  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof XmDailySyncError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
    if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'INVALID_XM_SYNC_REQUEST', message: 'La solicitud de sincronización XM no es válida.' }); return; }
    logUnexpectedError(logger, req, error, 'XM_DAILY_SYNC_FAILED');
    res.status(500).json({ error: 'XM_DAILY_SYNC_FAILED', message: 'No fue posible sincronizar los datos XM.' });
  };
  router.use(errors);
  return router;
}

export const router = createXmDailySyncRouter();
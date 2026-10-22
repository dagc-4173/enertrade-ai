import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { createHourlyRidgeService, HourlyRidgeError } from '@/services/hourly-ridge.service';
import { ExternalDataError } from '@/integrations/types/external-data';
export function createHourlyRidgeRouter(auth: RequestHandler = requireAuth(), services = { demand: createHourlyRidgeService('demand'), price: createHourlyRidgeService('price') }) {
  const router = Router(); router.use(auth);
  for (const series of ['demand', 'price'] as const) {
    router.get(`/${series}/availability`, async (req, res, next) => {
      try { if (Object.keys(req.query).length) throw new HourlyRidgeError(400, 'INVALID_RIDGE_REQUEST', 'No se admiten parámetros.'); res.json(await services[series].availability()) } catch (e) { next(e) }
    });
    router.post(`/${series}`, (req, res, next) => {
      if (!req.is('application/json')) { res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere JSON.' }); return }
      if (Object.keys(req.query).length) { res.status(400).json({ error: 'INVALID_RIDGE_REQUEST', message: 'No se admiten parámetros.' }); return }
      next();
    }, express.json({ limit: '1kb' }), async (req, res, next) => { try { res.json(await services[series].forecast(req.body)) } catch (e) { next(e) } });
  }
  const errors: ErrorRequestHandler = (e, _req, res, _next) => {
    if (e instanceof HourlyRidgeError || e instanceof ExternalDataError) { res.status(e.status).json({ error: e.code, message: e.message }); return }
    const status = e?.status === 413 ? 413 : e?.type === 'entity.parse.failed' ? 400 : 503;
    res.status(status).json({ error: 'RIDGE_FAILED', message: status === 503 ? 'No fue posible consultar Ridge.' : 'Solicitud JSON inválida o demasiado grande.' });
  }; router.use(errors); return router;
}
export const router = createHourlyRidgeRouter();

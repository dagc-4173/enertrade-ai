import express, { Router, type ErrorRequestHandler } from 'express';
import { ExternalDataService } from '@/integrations/external-data.service';
import { XmProvider } from '@/integrations/providers/xm.provider';
import { ExternalDataError } from '@/integrations/types/external-data';

export function createExternalDataRouter(service = new ExternalDataService([new XmProvider()])) {
  const router = Router();
  router.get('/providers', (_req, res) => { res.json({ providers: service.listProviders() }); });
  router.post('/query', (req, res, next) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere Content-Type application/json.' });
      return;
    }
    next();
  }, express.json({ limit: '16kb' }), async (req, res, next) => {
    try { res.json(await service.query(req.body)); } catch (error) { next(error); }
  });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ExternalDataError) {
      res.status(error.status).json({ error: error.code, message: error.message });
    } else if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'INVALID_EXTERNAL_QUERY', message: 'El cuerpo debe contener JSON válido.' });
    } else if (error?.status === 413) {
      res.status(413).json({ error: 'EXTERNAL_QUERY_TOO_LARGE', message: 'La consulta supera el tamaño permitido.' });
    } else if (error?.status === 415) {
      res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'La codificación del contenido no está admitida.' });
    } else {
      res.status(500).json({ error: 'EXTERNAL_QUERY_FAILED', message: 'No fue posible consultar los datos externos.' });
    }
  };
  router.use(handleError);
  return router;
}

export const router = createExternalDataRouter();

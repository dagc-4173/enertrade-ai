import { Router } from 'express';
import { ForecastError } from '@/services/forecast.contract';
import { createModelCatalogService, modelCatalogService } from '@/services/model-catalog.service';

export function createModelCatalogRouter(service = modelCatalogService) {
  const router = Router();
  router.get('/', (_req, res) => {
    try { res.json({ artifacts: service.list() }); }
    catch (error) { sendError(res, error); }
  });
  router.get('/:id/metrics', (req, res) => {
    try {
      const artifact = service.get(req.params.id);
      if (!artifact) return notFound(res);
      res.json(service.metrics(artifact.id, artifact.version));
    } catch (error) { sendError(res, error); }
  });
  router.get('/:id', (req, res) => {
    try {
      const artifact = service.get(req.params.id);
      if (!artifact) return notFound(res);
      res.json(artifact);
    } catch (error) { sendError(res, error); }
  });
  return router;
}

function notFound(res: Parameters<NonNullable<Parameters<Router['get']>[1]>>[1]) {
  return res.status(404).json({ error: 'PREDICTIVE_ARTIFACT_NOT_FOUND', message: 'Artefacto predictivo no encontrado.' });
}

function sendError(res: Parameters<NonNullable<Parameters<Router['get']>[1]>>[1], error: unknown) {
  if (error instanceof ForecastError) return res.status(error.status).json({ error: error.code, message: error.message });
  return res.status(500).json({ error: 'MODEL_CATALOG_FAILED', message: 'No fue posible consultar el catálogo de artefactos predictivos.' });
}

export const router = createModelCatalogRouter();
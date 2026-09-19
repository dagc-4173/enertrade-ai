import { Router, type Request } from 'express';
import { logUnexpectedError, safeLogger, type SafeLogger } from '@/lib/safe-logger';
import { preparedDatasetCatalogService } from '@/services/prepared-dataset-catalog.service';

function hasBody(req: Request): boolean {
  return Number(req.get('Content-Length') ?? 0) > 0 || req.get('Transfer-Encoding') !== undefined;
}

export function createPreparedDatasetCatalogRouter(service = preparedDatasetCatalogService, logger: SafeLogger = safeLogger) {
  const router = Router();
  router.get('/', async (req, res) => {
    if (hasBody(req) || Object.keys(req.query).length > 0) {
      res.status(400).json({ error: 'INVALID_PREPARED_DATASET_CATALOG_REQUEST', message: 'La consulta de datasets preparados no admite cuerpo ni parámetros.' });
      return;
    }
    try {
      res.json({ preparedDatasets: await service.list() });
    } catch (error) {
      logUnexpectedError(logger, req, error, 'PREPARED_DATASET_CATALOG_FAILED');
      res.status(500).json({ error: 'PREPARED_DATASET_CATALOG_FAILED', message: 'No fue posible consultar los datasets preparados.' });
    }
  });
  return router;
}

export const router = createPreparedDatasetCatalogRouter();
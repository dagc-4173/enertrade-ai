import express, { type ErrorRequestHandler, type Request, type Response, type Router } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { PatternAnalysisError } from '@/services/pattern-analysis.service';
import { createPatternsService, PatternsError, type PatternFilters } from '@/services/patterns.service';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function filters(query: Request['query']): PatternFilters {
  const keys = Object.keys(query);
  if (keys.some(key => !['from', 'to', 'dataType', 'variable'].includes(key))) throw new PatternsError(400, 'INVALID_PATTERN_QUERY', 'Los filtros de patrones no son válidos.');
  const { from, to, dataType, variable } = query;
  if ((from !== undefined && !calendarDate(from)) || (to !== undefined && !calendarDate(to)) || (typeof from === 'string' && typeof to === 'string' && from > to)) {
    throw new PatternsError(400, 'INVALID_PATTERN_QUERY', 'Los filtros de patrones no son válidos.');
  }
  if (dataType !== undefined && !['generacion', 'demanda', 'precios'].includes(String(dataType))) throw new PatternsError(400, 'INVALID_PATTERN_QUERY', 'Los filtros de patrones no son válidos.');
  if (variable !== undefined && !['energia_kwh', 'demanda_kwh', 'precio_cop_kwh'].includes(String(variable))) throw new PatternsError(400, 'INVALID_PATTERN_QUERY', 'Los filtros de patrones no son válidos.');
  return { ...(typeof from === 'string' ? { from } : {}), ...(typeof to === 'string' ? { to } : {}), ...(typeof dataType === 'string' ? { dataType: dataType as PatternFilters['dataType'] } : {}), ...(typeof variable === 'string' ? { variable: variable as PatternFilters['variable'] } : {}) };
}

export function createPatternsRouter(service = createPatternsService(), authMiddleware = requireAuth()): Router {
  const router = express.Router();
  router.use(express.json({ limit: '8kb' }));
  router.use(authMiddleware);
  router.post('/analyze', async (req: Request, res: Response, next) => {
    try {
      const preparedDatasetId = object(req.body) ? req.body.preparedDatasetId : undefined;
      if (!object(req.body) || Object.keys(req.body).length !== 1 || typeof preparedDatasetId !== 'number' || !Number.isInteger(preparedDatasetId) || preparedDatasetId < 1 || Object.keys(req.query).length > 0) {
        throw new PatternsError(400, 'INVALID_PATTERN_REQUEST', 'La solicitud de análisis de patrones no es válida.');
      }
      res.status(200).json(await service.analyze(preparedDatasetId));
    } catch (error) { next(error); }
  });
  router.get('/', async (req: Request, res: Response, next) => {
    try { res.status(200).json(await service.list(filters(req.query))); }
    catch (error) { next(error); }
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof PatternsError || error instanceof PatternAnalysisError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'INVALID_PATTERN_REQUEST', message: 'La solicitud de análisis de patrones no es válida.' });
      return;
    }
    if (error?.status === 413) {
      res.status(413).json({ error: 'PATTERN_REQUEST_TOO_LARGE', message: 'La solicitud supera el tamaño permitido.' });
      return;
    }
    res.status(500).json({ error: 'PATTERN_OPERATION_FAILED', message: 'No fue posible procesar los patrones.' });
  };
  router.use(errors);
  return router;
}

export const router = createPatternsRouter();
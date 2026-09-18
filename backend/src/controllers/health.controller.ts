import { Router } from 'express';
import { healthService, type HealthService } from '@/services/health.service';

export function createHealthRouter(service: HealthService = healthService) {
  const router = Router();
  router.get('/', async (_req, res) => {
    const result = await service.check();
    res.status(result.status === 'ok' ? 200 : 503).json(result);
  });
  return router;
}

export const router = createHealthRouter();
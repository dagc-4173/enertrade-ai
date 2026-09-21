import express, { Router, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { createEnergyTransactionService, EnergyTransactionError } from '@/services/energy-transaction.service';

export function createEnergyTransactionRouter(service = createEnergyTransactionService(), auth = requireAuth()) {
  const router = Router();
  router.use(auth);
  router.get('/mine', async (req, res, next) => { try { res.json({ transactions: await service.findMine(req.authUser!.id, typeof req.query.status === 'string' ? req.query.status : undefined) }); } catch (error) { next(error); } });
  router.get('/:id', async (req, res, next) => { try { res.json({ transaction: await service.findOne(req.authUser!.id, req.params.id) }); } catch (error) { next(error); } });
  router.post('/', (req, res, next) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere Content-Type application/json.' }); return; }
    next();
  }, express.json({ limit: '8kb' }), async (req, res, next) => { try { res.status(201).json({ transaction: await service.create(req.authUser!.id, req.body) }); } catch (error) { next(error); } });
  router.patch('/:id', (req, res, next) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere Content-Type application/json.' }); return; }
    next();
  }, express.json({ limit: '8kb' }), async (req, res, next) => { try { res.json({ transaction: await service.edit(req.authUser!.id, req.params.id, req.body) }); } catch (error) { next(error); } });
  for (const [path, action] of [['/:id/accept', 'accept'], ['/:id/reject', 'reject'], ['/:id/cancel', 'cancel']] as const) {
    router.post(path, express.json({ limit: '1kb' }), async (req, res, next) => { try { if (Object.keys(req.body ?? {}).length !== 0) throw new EnergyTransactionError(400, 'INVALID_TRANSACTION_REQUEST', 'La solicitud no debe incluir cuerpo.'); res.json({ transaction: await service[action](req.authUser!.id, req.params.id) }); } catch (error) { next(error); } });
  }
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof EnergyTransactionError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
    if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'INVALID_TRANSACTION_REQUEST', message: 'El cuerpo debe contener JSON válido.' }); return; }
    res.status(500).json({ error: 'TRANSACTION_OPERATION_FAILED', message: 'No fue posible procesar la transacción.' });
  };
  router.use(errors);
  return router;
}

export const router = createEnergyTransactionRouter();
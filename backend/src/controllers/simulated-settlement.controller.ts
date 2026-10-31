import express, { Router, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { adminOrigin } from '@/middlewares/admin.middleware';
import { createSettlementService, SettlementError } from '@/services/simulated-settlement.service';
export function createSettlementRouter(service = createSettlementService(), auth = requireAuth()) {
    const router = Router();
    router.use(auth, adminOrigin);
    router.get('/disputes', async (req, res, next) => { try {
        res.json(await service.disputes(req.authUser!.id));
    }
    catch (e) {
        next(e);
    } });
    router.get('/:id', async (req, res, next) => { try {
        res.json(await service.get(req.authUser!.id, req.params.id));
    }
    catch (e) {
        next(e);
    } });
    router.post('/:id', express.json({ limit: '8kb' }), async (req, res, next) => { try {
        res.json(await service.act(req.authUser!.id, req.params.id, req.body));
    }
    catch (e) {
        next(e);
    } });
    const errors: ErrorRequestHandler = (e, _req, res, _next) => {
        if (e instanceof SettlementError) {
            res.status(e.status).json({ error: e.code, message: e.message });
            return;
        }
        if (['P2034', 'P2002'].includes(e?.code)) {
            res.status(409).json({ error: 'SETTLEMENT_CONFLICT', message: 'El estado cambió. Actualiza y reintenta.' });
            return;
        }
        res.status(e?.type === 'entity.parse.failed' ? 400 : e?.status === 413 ? 413 : 500).json({ error: 'SETTLEMENT_FAILED', message: 'No fue posible procesar la entrega simulada.' });
    };
    router.use(errors);
    return router;
}

import express, { type ErrorRequestHandler } from 'express'
import {router as authRouter} from "@/controllers/auth.controller";
import {router as datasetRouter} from "@/controllers/dataset.controller";
import { validateDatasetRequest } from '@/controllers/dataset-validation.controller';
import { prepareDatasetRequest } from '@/controllers/dataset-preparation.controller';
import { router as externalDataRouter } from '@/controllers/external-data.controller';
import { router as forecastRouter } from '@/controllers/forecast.controller';
import { router as offerRouter } from '@/controllers/offer.controller';
import { router as demandRouter } from '@/controllers/demand.controller';
import { createMatchingRouter } from '@/controllers/matching.controller';
import { router as modelCatalogRouter } from '@/controllers/model-catalog.controller';
import { router as patternsRouter } from '@/controllers/patterns.controller';
import { router as healthRouter } from '@/controllers/health.controller';
import { router as capabilityVersionsRouter } from '@/controllers/capability-versions.controller';
import { router as indicatorsRouter } from '@/controllers/indicators.controller';
import { requestIdMiddleware } from '@/middlewares/request-id.middleware';
import { createAiQueryTraceMiddleware } from '@/middlewares/ai-query-trace.middleware';
import { prisma } from '@/lib/prisma';
import type { MatchingReadRepository } from '@/services/matching.service';
import { createTracedMatchingService, matchingTrace } from '@/services/matching-trace.service';
const app = express()
const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim()

const matchingRepository: MatchingReadRepository = {
    listActiveOffers: () => prisma.energyOffer.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } }),
    listActiveDemands: () => prisma.energyDemand.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } }),
}
const matchingRouter = createMatchingRouter(createTracedMatchingService(matchingRepository, matchingTrace))

app.use(requestIdMiddleware)
app.use(createAiQueryTraceMiddleware())

// CORS de desarrollo: únicamente el origen configurado, con cookies de sesión.
app.use((req, res, next) => {
    res.vary('Origin')
    if (frontendOrigin && req.get('Origin') === frontendOrigin) {
        res.set('Access-Control-Allow-Origin', frontendOrigin)
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.set('Access-Control-Allow-Credentials', 'true')
        res.set('Access-Control-Allow-Headers', 'Content-Type, Accept')
        if (req.method === 'OPTIONS') {
            res.sendStatus(204)
            return
        }
    }
    next()
})

app.post('/datasets/:id/validate', validateDatasetRequest)
app.post('/datasets/:id/prepare', prepareDatasetRequest)

// Parser exclusivo de HU-01; no se establece todavía un límite de tamaño.
app.use('/datasets', (req, res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) {
        res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Se requiere Content-Type application/json.' });
        return;
    }
    next();
}, express.json({ limit: Infinity }), datasetRouter)

const datasetJsonError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'INVALID_DATASET_FORMAT', message: 'El cuerpo debe contener JSON válido.' });
        return;
    }
    if (error?.status === 415) {
        res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'La codificación del contenido no está admitida.' });
        return;
    }
    res.status(500).json({ error: 'DATASET_REGISTRATION_FAILED', message: 'No fue posible registrar el dataset.' });
};
app.use('/datasets', datasetJsonError)

app.use('/external-data', externalDataRouter)
app.use('/forecasts', forecastRouter)
app.use('/offers', offerRouter)
app.use('/demands', demandRouter)
app.use('/matches', matchingRouter)
app.use('/models', modelCatalogRouter)
app.use('/capabilities', capabilityVersionsRouter)
app.use('/indicators', indicatorsRouter)
app.use('/patterns', patternsRouter)
app.use('/auth', authRouter)
app.use('/health', healthRouter)

export { app }

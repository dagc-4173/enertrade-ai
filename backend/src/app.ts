import express, { type ErrorRequestHandler } from 'express'
import {router as authRouter} from "@/controllers/auth.controller";
import {router as datasetRouter} from "@/controllers/dataset.controller";
import { validateDatasetRequest } from '@/controllers/dataset-validation.controller';
import { prepareDatasetRequest } from '@/controllers/dataset-preparation.controller';
import { router as externalDataRouter } from '@/controllers/external-data.controller';
import { router as forecastRouter } from '@/controllers/forecast.controller';
const app = express()
const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim()

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
app.use('/auth', authRouter)

export { app }

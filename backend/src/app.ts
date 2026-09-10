import express, { type ErrorRequestHandler } from 'express'
import {router as authRouter} from "@/controllers/auth.controller";
import {router as datasetRouter} from "@/controllers/dataset.controller";
import { validateDatasetRequest } from '@/controllers/dataset-validation.controller';
const app = express()

app.post('/datasets/:id/validate', validateDatasetRequest)

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

app.use(express.json())
app.use('/auth', authRouter)

export { app }

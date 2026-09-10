import type { Request, Response } from 'express';
import { DatasetPreparationError, prepareDataset } from '@/services/dataset-preparation.service';

export async function prepareDatasetRequest(req: Request, res: Response) {
  try {
    const rawId = req.params.id;
    const id = Number(rawId);
    if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId) || !Number.isInteger(id) || id > 2147483647) {
      res.status(400).json({error: 'INVALID_PREPARATION_REQUEST', message: 'El identificador debe ser un entero positivo válido.'}); return;
    }
    let hasBody = false;
    for await (const chunk of req) if (chunk.length) hasBody = true;
    if (hasBody) { res.status(400).json({error: 'INVALID_PREPARATION_REQUEST', message: 'Esta operación no admite un cuerpo de solicitud.'}); return; }
    res.status(200).json(await prepareDataset(id));
  } catch (error) {
    if (error instanceof DatasetPreparationError) { res.status(error.status).json({error: error.code, message: error.message}); return; }
    res.status(500).json({error: 'DATASET_PREPARATION_FAILED', message: 'No fue posible completar la preparación del dataset.'});
  }
}

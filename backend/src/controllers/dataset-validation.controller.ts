import type { Request, Response } from 'express';
import { DatasetValidationError, validateDataset } from '@/services/dataset-validation.service';

export async function validateDatasetRequest(req: Request, res: Response) {
  try {
    const rawId = req.params.id;
    const id = Number(rawId);
    if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId) || !Number.isInteger(id) || id > 2147483647) {
      res.status(400).json({ error: 'INVALID_VALIDATION_REQUEST', message: 'El identificador debe ser un entero positivo válido.' });
      return;
    }
    // La ruta se monta antes de los parsers: detecta contenido sin almacenarlo.
    let hasBody = false;
    for await (const chunk of req) if (chunk.length) hasBody = true;
    if (hasBody) {
      res.status(400).json({ error: 'INVALID_VALIDATION_REQUEST', message: 'Esta operación no admite un cuerpo de solicitud.' });
      return;
    }
    res.status(200).json(await validateDataset(id));
  } catch (error) {
    if (error instanceof DatasetValidationError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    res.status(500).json({ error: 'DATASET_VALIDATION_FAILED', message: 'No fue posible completar la validación del dataset.' });
  }
}

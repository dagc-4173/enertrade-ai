import { Router } from 'express';
import { DatasetInputError, registerDataset } from '@/services/dataset.service';

export const router = Router();

router.post('/', async (req, res) => {
  try {
    res.status(201).json(await registerDataset(req.body));
  } catch (error) {
    if (error instanceof DatasetInputError) {
      res.status(400).json({ error: error.code, message: error.message });
      return;
    }
    res.status(500).json({
      error: 'DATASET_REGISTRATION_FAILED',
      message: 'No fue posible registrar el dataset.',
    });
  }
});

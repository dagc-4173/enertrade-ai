import express, { Router, type ErrorRequestHandler } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/lib/prisma';
import { publicationWindow, validateHourlyPublication } from '@/services/hourly-publication.contract';
import { EnergyMarketInputError } from '@/services/energy-market.validation';

export function createHourlyPublicationRouter(database = prisma, auth = requireAuth(), now: () => Date = () => new Date()) {
const router = Router();
router.use(auth);
router.get('/window', (_req, res) => { res.json(publicationWindow(now())); });
router.post('/', express.json({ limit: '64kb' }), async (req, res, next) => {
  try {
    const input = validateHourlyPublication(req.body, now());
    const publications = await database.$transaction(async tx => {
      const rows = [];
      for (const day of input.days) {
        const deliveryDate = new Date(`${day.deliveryDate}T00:00:00Z`);
        const publication = await tx.energyPublication.upsert({
          where: { userId_kind_deliveryDate: { userId: req.authUser!.id, kind: input.kind, deliveryDate } },
          create: { userId: req.authUser!.id, kind: input.kind, deliveryDate }, update: {},
          select: { id: true, kind: true, deliveryDate: true },
        });
        if (input.kind === 'offer') await tx.energyOffer.createMany({ data: day.hours.map(slot => ({ userId: req.authUser!.id, publicationId: publication.id, deliveryDate, ...slot })) });
        else await tx.energyDemand.createMany({ data: day.hours.map(slot => ({ userId: req.authUser!.id, publicationId: publication.id, deliveryDate, hour: slot.hour, quantityKwh: slot.quantityKwh, maxPricePerKwh: slot.pricePerKwh })) });
        rows.push(publication);
      }
      return rows;
    }, { timeout: 30000, maxWait: 10000 });
    res.status(201).json({ publications });
  } catch (error) { next(error); }
});
const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof EnergyMarketInputError) { res.status(400).json({ error: error.code, message: error.message }); return; }
  if (error?.code === 'P2002') { res.status(409).json({ error: 'DAILY_PUBLICATION_EXISTS', message: 'Una de las horas ya está publicada. Edita la franja existente o selecciona horas nuevas.' }); return; }
  if (error?.type === 'entity.parse.failed' || error?.status === 413) { res.status(error.status ?? 400).json({ error: 'INVALID_HOURLY_PUBLICATION', message: 'Revisa el formato y tamaño de la publicación.' }); return; }
  res.status(500).json({ error: 'HOURLY_PUBLICATION_FAILED', message: 'No fue posible publicar las franjas.' });
};
router.use(errors);

return router;
}
export const router = createHourlyPublicationRouter();

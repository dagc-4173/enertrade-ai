import express from 'express';
import { expect, test } from 'bun:test';
import { createHourlyPublicationRouter } from '@/controllers/hourly-publication.controller';
test('HOUR-API-01: consulta de fechas, rechazo de fechas inválidas y creación bajo usuario de sesión', async () => {
 const stored: any[] = [];
 const database = { $transaction: async (action: any) => action({ energyPublication: { upsert: async (args: any) => ({ id: 'parent', ...args.create }) }, energyOffer: { createMany: async (args: any) => { stored.push(...args.data); } } }) };
 const app = express();
 const auth = (req: any, _res: any, next: any) => { req.authUser = { id: 'session-user' }; next(); };
 app.use('/publications', createHourlyPublicationRouter(database as any, auth, () => new Date('2026-10-06T15:00:00Z')));
 const server = app.listen(0); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
 try {
 const base = `http://127.0.0.1:${address.port}/publications`;
 const window = await (await fetch(`${base}/window`)).json() as { dates: string[] };
 expect(window.dates).toHaveLength(7);
 const post = (body: unknown) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
 const valid = { kind: 'offer', days: [{ deliveryDate: '2026-10-07', hours: [{ hour: 8, quantityKwh: 10.25, pricePerKwh: 900 }] }] };
 expect((await post(valid)).status).toBe(201);
 expect(stored).toMatchObject([{ userId: 'session-user', publicationId: 'parent', hour: 8, quantityKwh: 10.25 }]);
 expect((await post({ ...valid, userId: 'intruder' })).status).toBe(400);
 expect(stored).toHaveLength(1);
 } finally { server.close(); }
});

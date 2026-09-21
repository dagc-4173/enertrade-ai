import { expect, test } from 'bun:test';
import express from 'express';
import { createEnergyTransactionRouter } from '@/controllers/energy-transaction.controller';

test('C21b HTTP: GET revisions devuelve únicamente el historial seguro del participante', async () => {
  const app = express();
  app.use('/transactions', createEnergyTransactionRouter({
    revisions: async (userId: string, transactionId: string) => {
      expect(userId).toBe('participant-1');
      expect(transactionId).toBe('transaction-1');
      return [{ sequence: 1, quantityKwh: '50000', pricePerKwh: '420', totalAmountCop: '21000000', proposedByRole: 'BUYER', createdAt: '2026-09-21T10:00:00.000Z' }];
    },
  } as any, (req, _res, next) => { (req as any).authUser = { id: 'participant-1' }; next(); }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Expected listener');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/transactions/transaction-1/revisions`);
    expect(response.status).toBe(200);
    const body = await response.json() as { revisions: Array<Record<string, unknown>> };
    expect(body.revisions).toEqual([{ sequence: 1, quantityKwh: '50000', pricePerKwh: '420', totalAmountCop: '21000000', proposedByRole: 'BUYER', createdAt: '2026-09-21T10:00:00.000Z' }]);
    expect(body.revisions[0]).not.toHaveProperty('proposedByUserId');
    expect(body.revisions[0]).not.toHaveProperty('sellerUserId');
    expect(body.revisions[0]).not.toHaveProperty('buyerUserId');
    expect(body.revisions[0]).not.toHaveProperty('email');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
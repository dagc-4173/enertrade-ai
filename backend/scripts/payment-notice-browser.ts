import { createHash, randomBytes } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { configureIsolatedIntegrationDatabase } from './integration-safety';

configureIsolatedIntegrationDatabase();
process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:5174';
const { prisma } = await import('../src/lib/prisma');
const { createApp } = await import('../src/app');
const { authCookieName } = await import('../src/services/auth.service');
const { withBrowserFlowFixture } = await import('./browser-flow-fixture');
const { publicationWindow } = await import('../src/services/hourly-publication.contract');
const stop = new AbortController();
const requestStop = () => stop.abort();
process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);

async function request(base: string, cookie: string, path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() as any };
}

try {
  await withBrowserFlowFixture(prisma, async fixture => {
    const deliveryDate = fixture.date;
    assert(deliveryDate, 'Browser fixture has no delivery date.');
    const deliveryDateValue = new Date(`${deliveryDate}T00:00:00.000Z`);
    const server = createApp({ expirationScope: { userIds: [fixture.seller.id, fixture.buyer.id] } }).listen(3001, '127.0.0.1');
    try {
      await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
      const address = server.address();
      assert(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const session = async (userId: string) => {
        const token = randomBytes(32).toString('base64url');
        await prisma.authSession.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) } });
        return `${authCookieName}=${token}`;
      };
      const sellerCookie = await session(fixture.seller.id);
      const buyerCookie = await session(fixture.buyer.id);
      for (const [actorCookie, kind] of [[sellerCookie, 'offer'], [buyerCookie, 'demand']] as const) {
        const publication = await request(base, actorCookie, '/publications', { kind, days: [{ deliveryDate, hours: [{ hour: 8, quantityKwh: 10.25, pricePerKwh: kind === 'offer' ? 980.12345 : 1000 }] }] });
        assert.equal(publication.status, 201);
      }
      for (const [actorCookie, kind] of [[sellerCookie, 'offer'], [buyerCookie, 'demand']] as const) {
        const profile = await request(base, actorCookie, '/publication-verifications/profiles', { kind, limits: [{ hour: 8, maxQuantityKwh: '10.25' }] });
        assert.equal(profile.status, 201);
      }
      const offer = await prisma.energyOffer.findFirstOrThrow({ where: { userId: fixture.seller.id, deliveryDate: deliveryDateValue, hour: 8 } });
      const demand = await prisma.energyDemand.findFirstOrThrow({ where: { userId: fixture.buyer.id, deliveryDate: deliveryDateValue, hour: 8 } });
      for (const [actorCookie, kind, publicationId] of [[sellerCookie, 'offer', offer.id], [buyerCookie, 'demand', demand.id]] as const) {
        const verification = await request(base, actorCookie, `/publication-verifications/${kind}/${publicationId}`, {});
        assert.equal(verification.data.verification.status, 'APPROVED');
      }
      const proposal = await request(base, buyerCookie, '/transactions', { offerId: offer.id, demandId: demand.id, quantityKwh: '10.25', pricePerKwh: '980.12345' });
      assert.equal(proposal.status, 201);
      const accepted = await request(base, sellerCookie, `/transactions/${proposal.data.transaction.id}/accept`, {});
      assert.equal(accepted.status, 200);
      assert.equal(accepted.data.transaction.status, 'CONFIRMED');
      console.log(JSON.stringify({ ready: true, credentialsFile: 'temporary', fixtureAccounts: 2, confirmedUnpaid: 1, deliveryDate, hour: 8 }));
      await new Promise<void>(resolve => { if (stop.signal.aborted) resolve(); else stop.signal.addEventListener('abort', () => resolve(), { once: true }); });
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, { dates: publicationWindow().dates, directory: process.env.ENERTRADE_BROWSER_FIXTURE_DIRECTORY });
} finally {
  process.removeListener('SIGINT', requestStop);
  process.removeListener('SIGTERM', requestStop);
  await prisma.$disconnect();
}
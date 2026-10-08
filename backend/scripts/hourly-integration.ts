import { createHash, randomBytes } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { configureIsolatedIntegrationDatabase } from './integration-safety';

configureIsolatedIntegrationDatabase();
const { prisma } = await import('../src/lib/prisma');
const { createApp } = await import('../src/app');
const { publicationWindow } = await import('../src/services/hourly-publication.contract');
const { authCookieName } = await import('../src/services/auth.service');

// Creates and removes only fixtures owned by this execution. No credentials are logged.
const users: string[] = [];
const app = createApp({ expirationScope: { userIds: users } });
const runId = randomBytes(8).toString('hex');
const results: { id: string; status: string }[] = [];
const server = app.listen(0);
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No integration port');
const base = `http://127.0.0.1:${address.port}`;
async function actor() {
 const user = await prisma.user.create({ data: { email: `hourly-${runId}-${users.length}@example.test`, name: 'Hourly integration fixture', passwordHash: 'disabled-integration-fixture' } });
 users.push(user.id);
 const token = randomBytes(32).toString('base64url');
 await prisma.authSession.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
 return { id: user.id, cookie: `${authCookieName}=${token}` };
}
async function request(cookie: string, path: string, body?: unknown, method?: string) {
 const response = await fetch(base + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
 const data: any = await response.json();
 return { status: response.status, data };
}
const pass = (id: string) => { results.push({ id, status: 'passed' }); console.log(JSON.stringify({ id, status: 'passed' })); };
try {
 const seller = await actor(); const buyer = await actor();
 assert.equal((await request(seller.cookie, '/offers', { quantityKwh: 10, pricePerKwh: 900, deliveryDate: '2099-01-01' })).status,410);
 assert.equal((await request(buyer.cookie, '/demands', { quantityKwh: 10, maxPricePerKwh: 900, deliveryDate: '2099-01-01' })).status,410); pass('HOUR-INT-10');
 const dates = publicationWindow().dates;
 const days = (quantity: number) => dates.map(deliveryDate => ({ deliveryDate, hours: [8,9].map(hour => ({ hour, quantityKwh: quantity, pricePerKwh: 900 })) }));
 const anonymous = await request('', '/publications/window'); assert.equal(anonymous.status,401); pass('HOUR-INT-01');
 assert.equal((await request(seller.cookie, '/publications', { kind: 'offer', days: days(10) })).status,201);
 assert.equal((await request(buyer.cookie, '/publications', { kind: 'demand', days: days(10) })).status,201);
 assert.equal(await prisma.energyPublication.count({ where: { userId: { in: users } } }),14); pass('HOUR-INT-02');
 const offers = (await request(seller.cookie,'/offers/mine')).data.offers.filter((row: any) => row.deliveryDate === dates[0]).sort((a: any,b: any) => a.hour-b.hour);
 const demands = (await request(buyer.cookie,'/demands/mine')).data.demands.filter((row: any) => row.deliveryDate === dates[0]).sort((a: any,b: any) => a.hour-b.hour);
 assert.deepEqual(offers.map((row: any) => row.hour),[8,9]); assert.equal(new Set(offers.map((row: any) => row.publicationId)).size,1); pass('HOUR-INT-03');
 for (const [actor, kind] of [[seller, 'offer'], [buyer, 'demand']] as const) {
   assert.equal((await request(actor.cookie,'/publication-verifications/profiles',{kind,limits:[8,9].map(hour=>({hour,maxQuantityKwh:'10'}))})).status,201);
   const all = (await request(actor.cookie,kind==='offer'?'/offers/mine':'/demands/mine')).data[kind==='offer'?'offers':'demands'];
   for (const row of all) assert.equal((await request(actor.cookie,`/publication-verifications/${kind}/${row.id}`,{})).data.verification.status,'APPROVED');
 }
 const proposals = offers.map((offer: any,index: number) => ({ offerId: offer.id, demandId: demands[index].id, quantityKwh: 6, pricePerKwh: 900 }));
 const unavailable = await request(seller.cookie,'/transactions/batch',{ proposals: [proposals[0], { ...proposals[1], quantityKwh: 11 }] });
 console.log(JSON.stringify({ case: 'rollback', status: unavailable.status, errorCode: unavailable.data.error ?? null }));
 assert.equal(unavailable.status,409); assert.equal(await prisma.energyTransaction.count({ where: { sellerUserId: seller.id } }),0); pass('HOUR-INT-04');
 const created = await request(seller.cookie,'/transactions/batch',{ proposals }); assert.equal(created.status,201); assert.equal(created.data.transactions.length,2);
 const refreshed = (await request(seller.cookie,'/offers/mine')).data.offers.filter((row: any) => row.deliveryDate === dates[0]); assert(refreshed.every((row: any) => row.availableQuantityKwh === 4)); pass('HOUR-INT-05');
 assert.equal((await request(buyer.cookie,`/transactions/${created.data.transactions[0].id}/accept`,{})).data.transaction.status,'CONFIRMED');
 assert.equal((await request(buyer.cookie,`/transactions/${created.data.transactions[1].id}/reject`,{})).data.transaction.status,'REJECTED'); pass('HOUR-INT-06');
 const after = (await request(seller.cookie,'/offers/mine')).data.offers.filter((row: any) => row.deliveryDate === dates[0]).sort((a: any,b: any) => a.hour-b.hour);
 assert.equal(after[0].availableQuantityKwh,4); assert.equal(after[1].availableQuantityKwh,10); pass('HOUR-INT-07');
 const duplicate = await request(seller.cookie,'/publications',{ kind:'offer', days: [{ deliveryDate: dates[0], hours:[{ hour:10, quantityKwh:1, pricePerKwh:900 },{hour:8,quantityKwh:1,pricePerKwh:900}] }] });
 assert.equal(duplicate.status,409); assert.equal(await prisma.energyOffer.count({where:{userId:seller.id,deliveryDate:new Date(`${dates[0]}T00:00:00Z`),hour:10}}),0); pass('HOUR-INT-08');
 const thirdDate = dates[2]!;
 const concurrencyOffer = (await prisma.energyOffer.findFirstOrThrow({where:{userId:seller.id,deliveryDate:new Date(`${thirdDate}T00:00:00Z`),hour:8}})).id;
 const concurrencyDemand = (await prisma.energyDemand.findFirstOrThrow({where:{userId:buyer.id,deliveryDate:new Date(`${thirdDate}T00:00:00Z`),hour:8}})).id;
 const body={proposals:[{offerId:concurrencyOffer,demandId:concurrencyDemand,quantityKwh:8,pricePerKwh:900}]};
 const race=await Promise.all([request(seller.cookie,'/transactions/batch',body),request(seller.cookie,'/transactions/batch',body)]);
 assert.equal(race.filter(row=>row.status===201).length,1); assert.equal(race.filter(row=>row.status===409).length,1); pass('HOUR-INT-09');
 console.log(JSON.stringify({ status:'passed', tests:results.length }));
} catch(error) {
 console.log(JSON.stringify({ status:'failed', passed:results.length, code:(error as any)?.code ?? 'ASSERTION_OR_OPERATION_FAILED' })); process.exitCode=1;
} finally {
 try {
   const where = { sellerUserId: { in: users } };
   const transactions = await prisma.energyTransaction.findMany({ where, select:{id:true} });
   await prisma.$transaction(async tx => {
     await tx.energyTransactionRevision.deleteMany({where:{transactionId:{in:transactions.map(row=>row.id)}}});
     await tx.energyTransaction.deleteMany({where});
     await tx.publicationVerification.deleteMany({where:{userId:{in:users}}});
     await tx.simulationCapacityProfile.deleteMany({where:{userId:{in:users}}});
     await tx.energyOffer.deleteMany({where:{userId:{in:users}}});
     await tx.energyDemand.deleteMany({where:{userId:{in:users}}});
     await tx.energyPublication.deleteMany({where:{userId:{in:users}}});
     await tx.authSession.deleteMany({where:{userId:{in:users}}});
     await tx.user.deleteMany({where:{id:{in:users}}});
   },{timeout:30000});
   console.log(JSON.stringify({ cleanup:'completed', fixturesOnly:true }));
 } catch { console.log(JSON.stringify({ cleanup:'failed', runId })); process.exitCode=1; }
 server.close(); await prisma.$disconnect();
}

import { randomBytes, createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { configureIsolatedIntegrationDatabase } from './integration-safety';
configureIsolatedIntegrationDatabase();
const { createApp } = await import('../src/app');
const { prisma } = await import('../src/lib/prisma');
const { authCookieName } = await import('../src/services/auth.service');
const { publicationWindow } = await import('../src/services/hourly-publication.contract');
const users:string[]=[]; const runId=randomBytes(8).toString('hex'); const results:string[]=[];
const app = createApp({ expirationScope: { userIds: users } });
const server=app.listen(0);const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
const base=`http://127.0.0.1:${address.port}`;
async function actor(){const user=await prisma.user.create({data:{email:`verify-${runId}-${users.length}@example.test`,name:'Verification fixture',passwordHash:'disabled-integration-fixture'}});users.push(user.id);const token=randomBytes(32).toString('base64url');await prisma.authSession.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)}});return{id:user.id,cookie:`${authCookieName}=${token}`};}
async function request(cookie:string,path:string,body?:unknown){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json() as any};}
function pass(id:string){results.push(id);console.log(JSON.stringify({id,status:'passed'}));}
try{
 const owner=await actor();const other=await actor();
 assert.equal((await request('','/publication-verifications/profiles/offer')).status,401);pass('VERIFY-INT-01');
 const date=publicationWindow().dates[0]!;
 assert.equal((await request(owner.cookie,'/publications',{kind:'offer',days:[{deliveryDate:date,hours:[{hour:8,quantityKwh:10.25,pricePerKwh:900}]}]})).status,201);
 const offer=await prisma.energyOffer.findFirstOrThrow({where:{userId:owner.id}});
 const noReference=await request(owner.cookie,`/publication-verifications/offer/${offer.id}`,{});assert.equal(noReference.status,201);assert.equal(noReference.data.verification.status,'NO_REFERENCE');pass('VERIFY-INT-02');
 assert.equal((await request(other.cookie,`/publication-verifications/offer/${offer.id}`,{})).status,404);assert.equal((await request(other.cookie,'/publication-verifications/profiles/offer')).data.profile,null);pass('VERIFY-INT-03');
 const profile=await request(owner.cookie,'/publication-verifications/profiles',{kind:'offer',limits:[{hour:8,maxQuantityKwh:'10.25'}]});assert.equal(profile.status,201);assert.equal(profile.data.profile.version,1);
 const approved=await request(owner.cookie,`/publication-verifications/offer/${offer.id}`,{});assert.equal(approved.data.verification.status,'APPROVED');assert.equal(approved.data.verification.profileVersion,1);pass('VERIFY-INT-04');
 const ownList=await request(owner.cookie,'/offers/mine');assert.equal(ownList.data.offers[0].verification.status,'APPROVED');assert.equal(ownList.data.offers[0].availableQuantityKwh,10.25);pass('VERIFY-INT-05');
 const lower=await request(owner.cookie,'/publication-verifications/profiles',{kind:'offer',limits:[{hour:8,maxQuantityKwh:'10.24'}]});assert.equal(lower.data.profile.version,2);
 assert.equal((await request(owner.cookie,'/offers/mine')).data.offers[0].verification.status,'OUTDATED');
 const rejected=await request(owner.cookie,`/publication-verifications/offer/${offer.id}`,{});assert.equal(rejected.data.verification.status,'REJECTED');assert.equal(rejected.data.verification.maxQuantityKwh,'10.24');pass('VERIFY-INT-06');
 assert.equal(await prisma.publicationVerification.count({where:{offerId:offer.id}}),3);assert.equal((await prisma.simulationCapacityProfile.findUniqueOrThrow({where:{id:profile.data.profile.id}})).version,1);pass('VERIFY-INT-07');
 const malformed=await request(owner.cookie,'/publication-verifications/profiles',{kind:'offer',limits:[{hour:8,maxQuantityKwh:'1'}],userId:other.id});assert.equal(malformed.status,400);
 assert.equal((await request(owner.cookie,'/publication-verifications/profiles/demand')).data.profile,null);pass('VERIFY-INT-08');
 const race=await Promise.all([request(owner.cookie,'/publication-verifications/profiles',{kind:'offer',limits:[{hour:8,maxQuantityKwh:'12'}]}),request(owner.cookie,'/publication-verifications/profiles',{kind:'offer',limits:[{hour:8,maxQuantityKwh:'13'}]})]);
 assert(race.every(row=>row.status===201));assert.deepEqual(race.map(row=>row.data.profile.version).sort(),[3,4]);pass('VERIFY-INT-09');
 console.log(JSON.stringify({status:'passed',tests:results.length}));
}catch(error){console.log(JSON.stringify({status:'failed',passed:results.length,code:(error as any)?.code??'ASSERTION_OR_OPERATION_FAILED'}));process.exitCode=1;}
finally{
 try{await prisma.$transaction(async tx=>{await tx.publicationVerification.deleteMany({where:{userId:{in:users}}});await tx.simulationCapacityProfile.deleteMany({where:{userId:{in:users}}});await tx.energyOffer.deleteMany({where:{userId:{in:users}}});await tx.energyDemand.deleteMany({where:{userId:{in:users}}});await tx.energyPublication.deleteMany({where:{userId:{in:users}}});await tx.authSession.deleteMany({where:{userId:{in:users}}});await tx.user.deleteMany({where:{id:{in:users}}});},{timeout:30000});console.log(JSON.stringify({cleanup:'completed',fixturesOnly:true}));}catch{console.log(JSON.stringify({cleanup:'failed',runId}));process.exitCode=1;}
 server.close();await prisma.$disconnect();
}

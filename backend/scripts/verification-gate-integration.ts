import {randomBytes,createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
import {configureIsolatedIntegrationDatabase} from './integration-safety';
configureIsolatedIntegrationDatabase();
const {prisma}=await import('../src/lib/prisma');
const {createApp}=await import('../src/app');
const {authCookieName}=await import('../src/services/auth.service');
const {publicationWindow}=await import('../src/services/hourly-publication.contract');
const users:string[]=[];const matchingIds:string[]=[];const run=randomBytes(8).toString('hex');const results:string[]=[];
const server=createApp({expirationScope:{userIds:users}}).listen(0);const address=server.address();if(!address||typeof address==='string')throw new Error('No port');const base=`http://127.0.0.1:${address.port}`;
async function actor(){const user=await prisma.user.create({data:{email:`gate-${run}-${users.length}@example.test`,name:'Gate fixture',passwordHash:'disabled-fixture'}});users.push(user.id);const token=randomBytes(32).toString('base64url');await prisma.authSession.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)}});return{id:user.id,cookie:`${authCookieName}=${token}`};}
async function request(cookie:string,path:string,body?:unknown,method?:string){const response=await fetch(base+path,{method:method??(body===undefined?'GET':'POST'),headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json() as any};}
const pass=(id:string)=>{results.push(id);console.log(JSON.stringify({id,status:'passed'}));};
try{
 const seller=await actor(),buyer=await actor();const date=publicationWindow().dates[0]!;
 for(const [actor,kind] of [[seller,'offer'],[buyer,'demand']] as const)assert.equal((await request(actor.cookie,'/publications',{kind,days:[{deliveryDate:date,hours:[8,9].map(hour=>({hour,quantityKwh:10,pricePerKwh:900}))}]})).status,201);
 const offers=(await request(seller.cookie,'/offers/mine')).data.offers.sort((a:any,b:any)=>a.hour-b.hour);
 const demands=(await request(buyer.cookie,'/demands/mine')).data.demands.sort((a:any,b:any)=>a.hour-b.hour);
 const proposal=(index=0)=>({offerId:offers[index].id,demandId:demands[index].id,quantityKwh:4,pricePerKwh:900});
 assert(offers.every((row:any)=>row.status==='BLOCKED'));assert(demands.every((row:any)=>row.status==='BLOCKED'));
 assert.equal((await request(buyer.cookie,'/market/offers')).data.offers.length,0);
 assert.equal((await request(buyer.cookie,'/transactions',proposal())).status,409);
 assert.equal((await request(buyer.cookie,'/transactions/batch',{proposals:[proposal()]})).status,409);pass('GATE-INT-01');
 const noRef=await request(seller.cookie,`/publication-verifications/offer/${offers[0].id}`,{});assert.equal(noRef.data.verification.status,'NO_REFERENCE');assert.equal((await request(buyer.cookie,'/transactions',proposal())).status,409);pass('GATE-INT-02');
 async function profile(actor:{cookie:string},kind:string,max:string){assert.equal((await request(actor.cookie,'/publication-verifications/profiles',{kind,limits:[8,9].map(hour=>({hour,maxQuantityKwh:max}))})).status,201);}
 async function verify(actor:{cookie:string},kind:string,id:string,status='APPROVED'){assert.equal((await request(actor.cookie,`/publication-verifications/${kind}/${id}`,{})).data.verification.status,status);}
 await profile(seller,'offer','9');await verify(seller,'offer',offers[0].id,'REJECTED');
 const rejected=(await request(seller.cookie,'/offers/mine')).data.offers.find((row:any)=>row.id===offers[0].id);assert.equal(rejected.status,'BLOCKED');assert(rejected.verification.reason.includes('límite de capacidad'));assert(!rejected.verification.reason.includes('límite horario'));
 const matching=(await request(buyer.cookie,'/matches/suggest',{})).data;if(typeof matching.trace?.executionId==='string')matchingIds.push(matching.trace.executionId);assert.equal(matching.matches?.length ?? matching.summary.totalAssignments,0);pass('GATE-INT-03');
 await profile(seller,'offer','10');await verify(seller,'offer',offers[0].id);await profile(buyer,'demand','10');
 assert.equal((await request(buyer.cookie,'/transactions',proposal())).status,409);
 await verify(buyer,'demand',demands[0].id);
 assert.equal((await request(buyer.cookie,'/market/offers')).data.offers.length,1);
 const initial=await request(buyer.cookie,'/transactions',proposal());assert.equal(initial.status,201);const id=initial.data.transaction.id;pass('GATE-INT-04');
 await profile(seller,'offer','9');
 assert.equal((await request(seller.cookie,`/transactions/${id}/accept`,{})).data.error,'PUBLICATION_VERIFICATION_REQUIRED');
 assert.equal((await request(seller.cookie,`/transactions/${id}/counter`,{quantityKwh:3,pricePerKwh:900})).status,409);
 assert.equal((await request(buyer.cookie,'/market/offers')).data.offers.length,0);
 assert.equal((await prisma.energyTransaction.findUniqueOrThrow({where:{id}})).status,'PENDING_ACCEPTANCE');pass('GATE-INT-05');
 await verify(seller,'offer',offers[0].id,'REJECTED');assert.equal((await request(seller.cookie,`/transactions/${id}/accept`,{})).status,409);
 await profile(seller,'offer','10');await verify(seller,'offer',offers[0].id);assert.equal((await request(seller.cookie,`/transactions/${id}/accept`,{})).data.transaction.status,'CONFIRMED');pass('GATE-INT-06');
 await verify(seller,'offer',offers[1].id);await verify(buyer,'demand',demands[1].id);
 assert.equal((await request(seller.cookie,`/offers/${offers[1].id}`,{quantityKwh:11,pricePerKwh:900,deliveryDate:date},'PATCH')).status,200);
 const outdated=(await request(seller.cookie,'/offers/mine')).data.offers.find((row:any)=>row.id===offers[1].id);assert.equal(outdated.status,'BLOCKED');assert.equal(outdated.verification.status,'OUTDATED');
 const batch=await request(buyer.cookie,'/transactions/batch',{proposals:[{...proposal(),quantityKwh:2},proposal(1)]});assert.equal(batch.status,409);assert.equal(await prisma.energyTransaction.count({where:{sellerUserId:seller.id}}),1);pass('GATE-INT-07');
 await profile(buyer,'demand','0');assert.equal((await prisma.energyTransaction.findUniqueOrThrow({where:{id}})).status,'CONFIRMED');
 assert.equal((await request(buyer.cookie,`/transactions/${id}`)).data.transaction.status,'CONFIRMED');pass('GATE-INT-08');
 console.log(JSON.stringify({status:'passed',tests:results.length}));
}catch(error){console.log(JSON.stringify({status:'failed',passed:results.length,message:(error as Error).message.slice(0,250)}));process.exitCode=1;}
finally{try{await prisma.$transaction(async tx=>{const agreements=await tx.energyTransaction.findMany({where:{sellerUserId:{in:users}},select:{id:true}});const ids=agreements.map(r=>r.id);await tx.simulatedPaymentAttempt.deleteMany({where:{transactionId:{in:ids}}});await tx.energyTransactionRevision.deleteMany({where:{transactionId:{in:ids}}});await tx.energyTransaction.deleteMany({where:{id:{in:ids}}});await tx.aiQueryTrace.deleteMany({where:{requesterId:{in:users},resourceType:'matching_execution',resourceId:{in:matchingIds}}});await tx.matchingExecution.deleteMany({where:{id:{in:matchingIds}}});await tx.publicationVerification.deleteMany({where:{userId:{in:users}}});await tx.simulationCapacityProfile.deleteMany({where:{userId:{in:users}}});await tx.energyOffer.deleteMany({where:{userId:{in:users}}});await tx.energyDemand.deleteMany({where:{userId:{in:users}}});await tx.energyPublication.deleteMany({where:{userId:{in:users}}});await tx.authSession.deleteMany({where:{userId:{in:users}}});await tx.user.deleteMany({where:{id:{in:users}}});},{timeout:30000});console.log(JSON.stringify({cleanup:'completed',fixturesOnly:true}));}catch{console.log(JSON.stringify({cleanup:'failed'}));process.exitCode=1;}server.close();await prisma.$disconnect();}

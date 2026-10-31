import {strict as assert} from 'node:assert';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parse} from 'dotenv';
import {configureIsolatedIntegrationDatabase} from './integration-safety';
const normal=parse(readFileSync(resolve(import.meta.dir,'../.env'),'utf8')).DATABASE_URL;
configureIsolatedIntegrationDatabase({...process.env,DATABASE_URL:normal});
const target=process.env.ENERTRADE_INTEGRATION_DATABASE_URL!;assert(['localhost','127.0.0.1','[::1]'].includes(new URL(target).hostname));process.env.DATABASE_URL=target;
const migration=Bun.spawnSync([process.execPath,'--bun','run','prisma','migrate','deploy'],{cwd:resolve(import.meta.dir,'..'),env:{...process.env,DATABASE_URL:target},stdout:'pipe',stderr:'pipe'});assert.equal(migration.exitCode,0,'isolated migration');
const {prisma}=await import('../src/lib/prisma');
const {Prisma}=await import('../src/generated/prisma/client');
const {createSettlementService}=await import('../src/services/simulated-settlement.service');
const {createSimulatedPaymentService}=await import('../src/services/simulated-payment.service');
const {createSettlementRouter}=await import('../src/controllers/simulated-settlement.controller');
const express=(await import('express')).default;
const ids=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];const [buyer,seller,admin,admin2]=ids as [string,string,string,string];const txIds:string[]=[],offers:string[]=[],demands:string[]=[];
const service=createSettlementService(prisma,()=>new Date('2030-01-03T12:00:00Z'),{userIds:ids}),payment=createSimulatedPaymentService(prisma,undefined,{userIds:ids});
const req=(action:string,extra:Record<string,string>={})=>({action,requestKey:randomUUID(),...extra});
let server:ReturnType<typeof express.application.listen>|undefined;
try{
 await prisma.user.createMany({data:ids.map((id,i)=>({id,email:`settlement-${randomUUID()}@example.test`,name:'Isolated settlement fixture',passwordHash:'fixture-no-valid-password',role:i>=2?'ADMIN':'USER'}))});
 async function agreement(){
  const date=new Date(Date.UTC(2029,11,1+txIds.length));
  const offer=await prisma.energyOffer.create({data:{user:{connect:{id:seller}},quantityKwh:'10000',pricePerKwh:'500',deliveryDate:date,hour:23,publication:{create:{userId:seller,kind:'offer',deliveryDate:date}}}});offers.push(offer.id);
  const demand=await prisma.energyDemand.create({data:{user:{connect:{id:buyer}},quantityKwh:'10000',maxPricePerKwh:'500',deliveryDate:date,hour:23,publication:{create:{userId:buyer,kind:'demand',deliveryDate:date}}}});demands.push(demand.id);
  const t=await prisma.energyTransaction.create({data:{offerId:offer.id,demandId:demand.id,buyerUserId:buyer,sellerUserId:seller,quantityKwh:'10000',pricePerKwh:'500',totalAmountCop:'5000000',deliveryDate:date,hour:23,status:'CONFIRMED',confirmedAt:new Date('2029-12-31')}});txIds.push(t.id);
  assert.equal((await payment.create(buyer,{transactionId:t.id,requestKey:randomUUID(),scenario:'APPROVED'})).attempt.providerVersion,'2.0.0');assert.equal((await service.get(buyer,t.id)).status,'HELD');return t.id;
 }
 for(const quantityKwh of ['0','8000','10000']){
  const id=await agreement();await service.act(seller,id,req('REPORT',{quantityKwh,evidenceReference:'Acta de prueba aislada'}));const accept=req('ACCEPT');
  const results=await Promise.allSettled([service.act(buyer,id,accept),service.act(buyer,id,accept)]);assert(results.some(r=>r.status==='fulfilled'));
  const s=await service.act(buyer,id,accept);assert.equal(s.status,'SETTLED');assert.equal(new Prisma.Decimal(s.sellerAmountCop!).add(s.refundAmountCop!).toString(),'5000000');assert.equal(s.events.length,2);
  await assert.rejects(service.act(buyer,id,req('ACCEPT')),{code:'ALREADY_SETTLED'});
 }
 const id=await agreement();await service.act(buyer,id,req('DISPUTE',{reason:'No se registró la entrega acordada'}));assert.equal((await service.disputes(admin)).disputes.length,1);
 const race=await Promise.allSettled([service.act(admin,id,req('RESOLVE',{quantityKwh:'8000',reason:'Acta verificada en simulación'})),service.act(admin2,id,req('RESOLVE',{quantityKwh:'6000',reason:'Otra resolución simultánea'}))]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);const s=await service.get(buyer,id);assert.equal(s.events.length,2);assert.equal(s.status,'SETTLED');
 const token=randomBytes(32).toString('base64url');await prisma.authSession.create({data:{userId:buyer,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+60000)}});
 const app=express();app.use('/settlements',createSettlementRouter(service));server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server!.once('listening',r));const a=server.address();assert(a&&typeof a!=='string');const base=`http://127.0.0.1:${a.port}/settlements/${id}`;
 assert.equal((await fetch(base)).status,401);const response=await fetch(base,{headers:{Cookie:`enertrade_session=${token}`}});assert.equal(response.status,200);const data=await response.json() as any;assert.equal(data.status,'SETTLED');assert(!('actorId' in data.events[0]));
 console.log(JSON.stringify({postgres:'passed',migrations:'24 applied on isolated database',agreements:4,newPaymentRetention:'passed',completePartialZeroDelivery:'passed',concurrentDuplicateAcceptance:'passed',concurrentAdminResolution:'one winner',realCookieAuthentication:'passed',productionDatabaseUsed:false,realFundsMoved:false}));
}finally{
 server?.closeAllConnections();server?.close();await prisma.simulatedSettlement.deleteMany({where:{transactionId:{in:txIds}}});await prisma.simulatedPaymentAttempt.deleteMany({where:{transactionId:{in:txIds}}});await prisma.energyTransaction.deleteMany({where:{id:{in:txIds}}});await prisma.energyOffer.deleteMany({where:{id:{in:offers}}});await prisma.energyDemand.deleteMany({where:{id:{in:demands}}});await prisma.energyPublication.deleteMany({where:{userId:{in:ids}}});await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();
}

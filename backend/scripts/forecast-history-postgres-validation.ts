import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configureIsolatedIntegrationDatabase } from './integration-safety';

const require=createRequire(import.meta.url),{parse}=require('dotenv');
const protectedUrl=parse(readFileSync(resolve(import.meta.dir,'../.env'),'utf8')).DATABASE_URL;
// Explicit disposable target only. Never default to the application's database.
configureIsolatedIntegrationDatabase({...process.env,DATABASE_URL:protectedUrl});
const target=process.env.ENERTRADE_INTEGRATION_DATABASE_URL!;
const parsed=new URL(target);
assert(['localhost','127.0.0.1','[::1]'].includes(parsed.hostname),'Local validation only');
process.env.DATABASE_URL=target;
const migration=Bun.spawnSync([process.execPath,'--bun','run','prisma','migrate','deploy'],{cwd:resolve(import.meta.dir,'..'),env:{...process.env,DATABASE_URL:target},stdout:'pipe',stderr:'pipe'});
if(migration.exitCode!==0){console.error('MIGRATION_VALIDATION_FAILED');process.exit(1)}

const {prisma}=await import('../src/lib/prisma');
const {createForecastHistoryService,createHistoryRepository}=await import('../src/services/forecast-history.service');
const {createForecastObservationsService}=await import('../src/services/forecast-observations.service');
const {historyDay}=await import('../src/services/forecast-history.contract');
const {createForecastHistoryRouter}=await import('../src/controllers/forecast-history.controller');
const {createChronosHourlyRouter}=await import('../src/controllers/chronos-hourly.controller');
const {requestIdMiddleware}=await import('../src/middlewares/request-id.middleware');
const express=(await import('express')).default;
const ids=[randomUUID(),randomUUID()];
let clock=new Date('2030-01-01T12:00:00Z');
const repo=createHistoryRepository(prisma);
const observations=createForecastObservationsService(async(series,date)=>Array.from({length:series==='daily'?1:24},(_,i)=>({date,hour:series==='daily'?null:i+1,value:101+i})),()=>clock);
const service=createForecastHistoryService(repo,observations,()=>clock);
function result(method:string,series:string) {
 const base={status:'available',targetDate:'2030-01-02',latestObservedDate:'2030-01-01',forecastOriginDate:'2030-01-01',horizonDays:1,unit:series==='price'?'COP/kWh':'kWh',modelId:`fixture-${series}-${method}`,modelVersion:'fixture-1',predictions:Array.from({length:24},(_,i)=>({periodo:i+1,value:100+i,hora_xm:i+1,energia_kwh:100+i,precio_cop_kwh:100+i,q10:90+i,q50:100+i,q90:110+i}))};
 if(method==='b1')return {...base,forecastType:'market_reference_price',rule:{id:'fixture-b1',version:'1'}};
 if(series==='daily')return {...base,forecastType:'aggregate_demand_proxy',prediction:{demanda_kwh:100}};
 if(method==='ridge' && series==='supply')return {...base,forecastType:'generation_availability_proxy'};
 return method==='ridge'?{...base,method:'ridge',series}:{...base,model:method,forecastType:`experimental_hourly_system_${series}`};
}
let server:ReturnType<typeof express.application.listen>|undefined;
try {
 await prisma.user.createMany({data:ids.map((id,i)=>({id,email:`history-validation-${i}-${randomUUID()}@example.test`,name:'Isolated validation',passwordHash:'fixture-no-valid-password',role:'USER',status:'ACTIVE'}))});
 const saved:string[]=[];
 for(const series of ['supply','demand','price'])for(const method of ['ridge','chronos2','bolt'])saved.push((await service.record(ids[0]!,randomUUID(),result(method,series))).id!);
 for(const [method,series] of [['ridge','daily'],['b1','price']])saved.push((await service.record(ids[0]!,randomUUID(),result(method!,series!))).id!);
 const request=randomUUID(),first=await service.record(ids[1]!,request,result('ridge','demand')),second=await service.record(ids[1]!,request,result('ridge','demand'));
 assert.equal(first.id,second.id);
 assert.equal((await service.list(ids[0]!,{})).total,11);assert.equal((await service.list(ids[1]!,{})).total,1);
 await assert.rejects(service.get(ids[1]!,saved[0]!),{status:404});
 const pending=await service.evaluate(ids[0]!,saved[0]!);assert.equal(pending.status,'pending');
 clock=new Date('2030-01-03T12:00:00Z');
 for(const id of saved) {
  const evaluated=await service.evaluate(ids[0]!,id);assert.equal(evaluated.status,'evaluated');assert.equal(evaluated.metrics?.MAE,1);assert.equal(evaluated.metrics?.bias,-1);
  assert.deepEqual(await service.evaluate(ids[0]!,id),evaluated);
 }
 const conflictService=createForecastHistoryService(repo,createForecastObservationsService(async(_s,date)=>Array.from({length:24},(_,i)=>({date,hour:i+1,value:200+i})),()=>clock),()=>clock);
 const [left,right]=await Promise.all([service.evaluate(ids[1]!,first.id!),conflictService.evaluate(ids[1]!,first.id!)]);
 assert.deepEqual(left,right);assert.equal((await prisma.forecastHistory.findUniqueOrThrow({where:{id:first.id!}})).forecastSha256,left.forecastSha256);

 const tokens=ids.map(()=>randomBytes(32).toString('base64url'));
 await prisma.authSession.createMany({data:ids.map((id,i)=>({userId:id,tokenHash:createHash('sha256').update(tokens[i]!).digest('hex'),expiresAt:new Date(Date.now()+60000)}))});
 const app=express();app.use(requestIdMiddleware);app.use('/forecast-history',createForecastHistoryRouter(service));
 const origin=historyDay(new Date()),tomorrow=new Date(Date.parse(origin)+86400000).toISOString().slice(0,10);
 const fakeChronos={models:async()=>({models:[]}),forecast:async()=>({...result('chronos2','demand'),targetDate:tomorrow,latestObservedDate:origin})};
 app.use('/forecasts/hourly-demand',createChronosHourlyRouter(fakeChronos as never));
 server=app.listen(0,'127.0.0.1');const address=server.address();assert(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 const cookie=(index:number)=>({Cookie:`enertrade_session=${tokens[index]}`});
 assert.equal((await fetch(`${base}/forecast-history`)).status,401);
 const denied=await fetch(`${base}/forecast-history/${saved[0]}`,{headers:cookie(1)});assert.equal(denied.status,404);
 const response=await fetch(`${base}/forecasts/hourly-demand`,{method:'POST',headers:{...cookie(0),'Content-Type':'application/json'},body:JSON.stringify({model:'chronos2',targetDate:tomorrow})});
 assert.equal(response.status,200);const body=await response.json() as any;assert.equal(body.history.status,'saved');assert.equal((await service.get(ids[0]!,body.history.id)).modelId,'fixture-demand-chronos2');
 const listResponse=await fetch(`${base}/forecast-history`,{headers:cookie(0)});assert.equal(listResponse.headers.get('cache-control'),'no-store');assert.equal((await listResponse.json() as any).total,12);
 console.log(JSON.stringify({postgres:'passed',migration:'applied-on-isolated-local-database',forecastFamilies:11,storedForecasts:13,evaluations:12,ownerIsolation:'passed',canonicalJsonbHash:'passed',concurrentFirstEvaluation:'passed',authenticatedControllerRecording:'passed',realXmCalls:0,productionDatabaseUsed:false}));
} finally {
 server?.close();
 await prisma.user.deleteMany({where:{id:{in:ids}}});
 await prisma.$disconnect();
}

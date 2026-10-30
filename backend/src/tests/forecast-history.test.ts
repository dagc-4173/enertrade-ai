import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { snapshotForecast, historyErrors, historyFilters } from '@/services/forecast-history.contract';
import { createForecastHistoryService, type HistoryRepository, type HistoryRow } from '@/services/forecast-history.service';
import { createForecastHistoryRouter } from '@/controllers/forecast-history.controller';
import { withForecastHistory } from '@/services/forecast-history-recording';
import { createForecastObservationsService } from '@/services/forecast-observations.service';

const userA='11111111-1111-4111-8111-111111111111',userB='22222222-2222-4222-8222-222222222222';
function output(kind='ridge',series='demand') {
 const q=Array.from({length:24},(_,i)=>({periodo:i+1,value:10+i,q10:8+i,q50:10+i,q90:12+i,hora_xm:i+1,energia_kwh:10+i,precio_cop_kwh:10+i}));
 const base={status:'available',targetDate:'2030-01-02',latestObservedDate:'2030-01-01',forecastOriginDate:'2030-01-01',horizonDays:1,unit:series==='price'?'COP/kWh':'kWh',modelId:'fixture',modelVersion:'1',predictions:q};
 if(kind==='b1')return {...base,forecastType:'market_reference_price',rule:{id:'b1',version:'1'}};
 if(series==='daily')return {...base,forecastType:'aggregate_demand_proxy',prediction:{demanda_kwh:100}};
 if(kind==='ridge' && series==='supply')return {...base,forecastType:'generation_availability_proxy'};
 return kind==='ridge'?{...base,method:'ridge',series}:{...base,model:kind,forecastType:`experimental_hourly_system_${series}`};
}
function memory() {
 const rows=new Map<string,HistoryRow>();let saves=0;
 const repo:HistoryRepository={
  async save(input){saves++;const existing=[...rows.values()].find(r=>r.userId===input.userId&&r.requestId===input.requestId);if(existing)return existing;const s=input.snapshot;const row={...s,...input,id:randomUUID(),targetDate:new Date(s.targetDate),originDate:new Date(s.originDate),forecastSnapshot:JSON.parse(JSON.stringify(s)),evaluationSnapshot:null,evaluatedAt:null,lastCheckedAt:null,lastCheckStatus:null};rows.set(row.id,row);return row},
  async list(userId,f){let result=[...rows.values()].filter(r=>r.userId===userId&&(!f.series||r.series===f.series)&&(!f.method||r.method===f.method)&&(!f.status||(r.evaluatedAt?'evaluated':'pending')===f.status)&&(!f.from||r.targetDate>=new Date(f.from))&&(!f.to||r.targetDate<=new Date(f.to)));return {total:result.length,items:result.slice((f.page-1)*20,f.page*20)}},
  async find(userId,id){const r=rows.get(id);return r?.userId===userId?r:null},
  async evaluate(userId,id,evaluation,at){const r=await repo.find(userId,id);if(r&&!r.evaluatedAt)Object.assign(r,{evaluationSnapshot:evaluation,evaluatedAt:at,lastCheckedAt:at,lastCheckStatus:'evaluated'});return r},
  async checked(userId,id,state,at){const r=await repo.find(userId,id);if(r&&!r.evaluatedAt)Object.assign(r,{lastCheckedAt:at,lastCheckStatus:state})}
 };
 let clock=new Date('2030-01-01T12:00:00Z'),calls=0;
 const obs=createForecastObservationsService(async(_series,date)=>{calls++;return Array.from({length:24},(_,i)=>({date,hour:i+1,value:11+i}))},()=>clock);
 return {repo,rows,service:createForecastHistoryService(repo,obs,()=>clock),setClock:(value:string)=>{clock=new Date(value)},calls:()=>calls,saves:()=>saves};
}
test('HIST-01: normaliza todas las familias sin confundir DemaReal y DemaSIN',()=>{
 for(const series of ['supply','demand','price'] as const)for(const method of ['ridge','chronos2','bolt'] as const) {
  const s=snapshotForecast(output(method,series));expect(s.series).toBe(series);expect(s.method).toBe(method);expect(s.predictions).toHaveLength(24);expect(s.source).toContain(series==='demand'?'DemaReal':series==='supply'?'Gene':'PrecBolsNaci');
 }
 expect(snapshotForecast(output('ridge','daily')).predictions).toEqual([{period:1,value:100}]);expect(snapshotForecast(output('b1','price')).method).toBe('b1');
 for(const changed of [{predictions:[]},{unit:'MWh'},{horizonDays:2},{targetDate:'bad'},{predictions:Array(24).fill({periodo:1,value:10})}])expect(()=>snapshotForecast({...output(),...changed})).toThrow();
 expect(()=>snapshotForecast({...output('bolt'),predictions:Array.from({length:24},(_,i)=>({periodo:i+1,q10:12,q50:10,q90:8}))})).toThrow();
});
test('HIST-02: por usuario, registro por ejecución, no guarda consultas retrospectivas',async()=>{
 const m=memory();const request=randomUUID();const one=await m.service.record(userA,request,output());const duplicate=await m.service.record(userA,request,output());
 expect(one.id).toBe(duplicate.id);expect(m.rows.size).toBe(1);
 await m.service.record(userB,randomUUID(),output());expect((await m.service.list(userA,{})).total).toBe(1);
 await expect(m.service.get(userB,one.id!)).rejects.toMatchObject({status:404});await expect(m.service.evaluate(userB,one.id!)).rejects.toMatchObject({status:404});expect(m.calls()).toBe(0);
 m.setClock('2030-01-03T12:00:00Z');expect(await m.service.record(userA,randomUUID(),output())).toMatchObject({status:'not_registered'});expect(m.rows.size).toBe(2);
});
test('HIST-03: guarda y conserva evaluación del mismo día, P50, sesgo y cero real',async()=>{
 const m=memory();const saved=await m.service.record(userA,randomUUID(),output('chronos2'));const before=JSON.stringify(m.rows.get(saved.id!)!.forecastSnapshot);
 m.setClock('2030-01-03T12:00:00Z');const detail=await m.service.evaluate(userA,saved.id!);
 expect(detail.status).toBe('evaluated');expect(detail.metrics).toMatchObject({MAE:1,RMSE:1,bias:-1,n:24});expect(m.calls()).toBe(1);
 const repeated=await m.service.evaluate(userA,saved.id!);expect(repeated).toEqual(detail);expect(m.calls()).toBe(1);expect(JSON.stringify(m.rows.get(saved.id!)!.forecastSnapshot)).toBe(before);
 expect(historyErrors([{period:1,value:2}],[{period:1,value:0}]).metrics.WAPE).toBeNull();
 expect(()=>historyErrors([{period:1,value:2}],[{period:2,value:3}])).toThrow();
});
test('HIST-04: futuro pendiente sin consultar, XM vacío pendiente, fallo conserva predicción',async()=>{
 const m=memory();const saved=await m.service.record(userA,randomUUID(),output());const pending=await m.service.evaluate(userA,saved.id!);expect(pending.status).toBe('pending');expect(pending.lastCheckStatus).toBe('day_not_finished');expect(m.calls()).toBe(0);
 const empty=createForecastObservationsService(async()=>[],()=>new Date('2030-01-03T12:00:00Z'));
 expect((await createForecastHistoryService(m.repo,empty).evaluate(userA,saved.id!)).lastCheckStatus).toBe('not_published');
 const bad=createForecastObservationsService(async()=>{throw Error('provider failure')},()=>new Date('2030-01-03T12:00:00Z'));
 await expect(createForecastHistoryService(m.repo,bad).evaluate(userA,saved.id!)).rejects.toThrow();expect(m.rows.get(saved.id!)!.evaluatedAt).toBeNull();expect(m.rows.get(saved.id!)!.forecastSnapshot).toBeDefined();
});
test('HIST-05: hash canónico tolera orden JSONB y detecta predicción alterada',async()=>{
 const m=memory(),saved=await m.service.record(userA,randomUUID(),output());const row=m.rows.get(saved.id!)!;
 const snapshot=row.forecastSnapshot as Record<string,unknown>;row.forecastSnapshot=Object.fromEntries(Object.entries(snapshot).reverse());m.setClock('2030-01-03T12:00:00Z');expect((await m.service.evaluate(userA,saved.id!)).status).toBe('evaluated');
 const other=memory(),next=await other.service.record(userA,randomUUID(),output());(other.rows.get(next.id!)!.forecastSnapshot as any).predictions[0].value=999;other.setClock('2030-01-03T12:00:00Z');await expect(other.service.evaluate(userA,next.id!)).rejects.toMatchObject({code:'HISTORY_INTEGRITY_FAILED'});expect(other.calls()).toBe(0);
});
test('HIST-06: filtros y paginación acotados, propietario obligatorio',async()=>{
 const m=memory();for(let i=0;i<23;i++)await m.service.record(userA,randomUUID(),output());await m.service.record(userB,randomUUID(),output());
 expect((await m.service.list(userA,{})).items).toHaveLength(20);expect((await m.service.list(userA,{page:'2'})).items).toHaveLength(3);expect((await m.service.list(userA,{method:'bolt'})).items).toHaveLength(0);
 for(const q of [{userId:userB},{page:'-1'},{page:'10001'},{series:'__proto__'},{from:'2030-02-02',to:'2030-01-01'},{status:['evaluated']}])expect(()=>historyFilters(q)).toThrow();
});
test('HIST-07: fallo del guardado conserva resultado y registro usa identidad del servidor',async()=>{
 const m=memory(),req={authUser:{id:userA,email:'fixture@example.test',name:'Fixture',createdAt:new Date()},requestId:randomUUID()};
 const result=await withForecastHistory(req,output(),m.service) as any;expect(result.history.status).toBe('saved');expect(result.predictions).toEqual((output() as any).predictions);
 const failing={...m.service,record:async()=>{throw Error('private database details')}};const failed=await withForecastHistory(req,output(),failing) as any;expect(failed.history).toEqual({status:'failed',id:null});expect(JSON.stringify(failed)).not.toContain('private database details');
});
test('HIST-08: rutas rechazan invitados, otro propietario, origen externo y datos inventados',async()=>{
 const m=memory(),saved=await m.service.record(userA,randomUUID(),output());const app=express();app.use('/forecast-history',createForecastHistoryRouter(m.service,(req,res,next)=>{const id=req.get('x-test-user');if(!id){res.sendStatus(401);return}req.authUser={id,email:'fixture@example.test',name:'Fixture',createdAt:new Date()};next()}));
 const server=app.listen(0,'127.0.0.1'),address=server.address();if(!address||typeof address==='string')throw Error('port');const base=`http://127.0.0.1:${address.port}/forecast-history`;
 try{
  expect((await fetch(base)).status).toBe(401);expect((await fetch(`${base}/${saved.id}`,{headers:{'x-test-user':userB}})).status).toBe(404);
  const headers={'x-test-user':userA,'Content-Type':'application/json'};
  expect((await fetch(`${base}/${saved.id}/evaluate`,{method:'POST',headers:{...headers,Origin:'https://evil.example.test'},body:'{}'})).status).toBe(403);
  expect((await fetch(`${base}/${saved.id}/evaluate`,{method:'POST',headers,body:'{"actual":100}'})).status).toBe(400);
  const list=await fetch(base,{headers});expect(list.status).toBe(200);expect(list.headers.get('cache-control')).toBe('no-store');expect(JSON.stringify(await list.json())).not.toContain('userId');
 }finally{server.close()}
});

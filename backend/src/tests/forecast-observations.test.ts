import { expect, test } from 'bun:test';
import { createForecastObservationsService } from '@/services/forecast-observations.service';
const now=()=>new Date('2026-10-30T15:00:00Z');
test('OBS-01: rechaza parámetros inválidos y futuro no consulta XM',async()=>{
 let calls=0;const s=createForecastObservationsService(async()=>{calls++;return []},now);
 await expect(s.read({series:'demand',date:'2026-10-31'})).resolves.toMatchObject({status:'pending',checkedAt:null,points:[]});
 await expect(s.read({series:'demand',date:'2026-10-30'})).resolves.toMatchObject({status:'pending'});
 for(const input of [{series:'__proto__',date:'2026-10-29'},{series:'demand',date:'2026-02-30'},{series:'price',date:'2026-10-29',extra:true}])await expect(s.read(input)).rejects.toMatchObject({status:400});
 expect(calls).toBe(0);
});
test('OBS-02: devuelve únicamente fecha y métrica solicitadas, 24 periodos completos',async()=>{
 const seen:string[]=[];const s=createForecastObservationsService(async(series,date)=>{seen.push(series);return Array.from({length:24},(_,i)=>({date,hour:i+1,value:i+1})).reverse()},now);
 const result=await s.read({series:'demand',date:'2026-10-29'}) as any;
 expect(result.source).toBe('XM DemaReal/Sistema');expect(result.points[0]).toEqual({period:1,value:1});expect(result.points).toHaveLength(24);expect(seen).toEqual(['demand']);
});
test('OBS-03: sin observaciones no inventa ceros; parciales o duplicadas no se comparan',async()=>{
 expect(await createForecastObservationsService(async()=>[],now).read({series:'supply',date:'2026-10-29'})).toMatchObject({status:'unavailable',points:[]});
 for(const rows of [[{date:'2026-10-29',hour:1,value:1}],Array.from({length:24},()=>({date:'2026-10-29',hour:1,value:1})),Array.from({length:24},(_,i)=>({date:'2026-10-28',hour:i+1,value:1}))]) await expect(createForecastObservationsService(async()=>rows,now).read({series:'demand',date:'2026-10-29'})).rejects.toMatchObject({code:'INCOMPLETE_FORECAST_OBSERVATIONS'});
});
test('OBS-04: precios negativos válidos; demanda negativa inválida; DemaSIN diario no se desagrega',async()=>{
 const read=async(_series:unknown,date:string)=>Array.from({length:24},(_,i)=>({date,hour:i+1,value:-1}));
 expect(await createForecastObservationsService(read,now).read({series:'price',date:'2026-10-29'})).toMatchObject({status:'available',unit:'COP/kWh'});
 await expect(createForecastObservationsService(read,now).read({series:'demand',date:'2026-10-29'})).rejects.toMatchObject({status:422});
 const daily=createForecastObservationsService(async(_s,date)=>[{date,hour:null,value:200}],now);
 expect(await daily.read({series:'daily',date:'2026-10-29'})).toMatchObject({source:'XM DemaSIN/Sistema',points:[{period:1,value:200}]});
});
test('OBS-05: deduplica solicitudes pendientes y limita consultas distintas',async()=>{
 let release!:()=>void;const wait=new Promise<void>(r=>{release=r});let count=0;
 const s=createForecastObservationsService(async()=>{count++;await wait;return []},now);
 const first=s.read({series:'demand',date:'2026-10-29'}),duplicate=s.read({series:'demand',date:'2026-10-29'}),second=s.read({series:'price',date:'2026-10-29'});
 try{await expect(s.read({series:'supply',date:'2026-10-29'})).rejects.toMatchObject({status:429});expect(count).toBe(2)}finally{release()}
 await Promise.all([first,duplicate,second]);
 await s.read({series:'supply',date:'2026-10-29'});expect(count).toBe(3);
});

test('OBS-06: ruta exige autenticación y evita caché de las observaciones',async()=>{
 const express=(await import('express')).default;
 const {createEnergySeriesRouter}=await import('@/controllers/energy-series.controller');
 let calls=0;
 const service=createForecastObservationsService(async()=>{calls++;return []},now);
 const app=express();
 app.use('/energy-series',createEnergySeriesRouter(undefined,(req,res,next)=>{if(req.headers['x-test-auth']!=='yes'){res.sendStatus(401);return}next()},undefined,undefined,service));
 const server=app.listen(0,'127.0.0.1');const address=server.address();
 if(!address || typeof address==='string')throw Error('No port');
 const url=`http://127.0.0.1:${address.port}/energy-series/forecast-observations?series=demand&date=2026-10-29`;
 try{
  expect((await fetch(url)).status).toBe(401);expect(calls).toBe(0);
  const response=await fetch(url,{headers:{'x-test-auth':'yes'}});
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(calls).toBe(1);
 }finally{server.close()}
});

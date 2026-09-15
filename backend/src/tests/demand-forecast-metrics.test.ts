import {test,expect,mock,afterAll} from 'bun:test';
import express from 'express';
import {request} from 'node:http';
import {readFileSync} from 'node:fs';
import artifact from '@/models/xm-demandasin-ridge/1.0.0/model.json';
import {loadModel,validateModel,createModelLoader} from '@/models/xm-demandasin-ridge/model-loader';
import {getDemandForecastMetrics} from '@/services/demand-forecast-metrics.service';
import {messages} from '@/services/forecast.contract';
const forbidden=mock(()=>{throw Error('unexpected database call');});
mock.module('@/lib/prisma',()=>({prisma:{preparedDataset:{findUnique:forbidden,create:forbidden},energyDataset:{findUnique:forbidden,create:forbidden,updateMany:forbidden}}}));
const {createForecastRouter}=await import('@/controllers/forecast.controller');
const app=express();app.use('/forecasts',createForecastRouter());
for(const [path,read] of Object.entries({missing:():string=>{throw Error('private path');},invalid:():string=>'{' ,summary:():string=>JSON.stringify({...artifact,evaluationSummary:null})})){
 const loader=createModelLoader(read);app.use('/'+path,createForecastRouter(undefined,undefined,undefined,()=>{loader();return getDemandForecastMetrics();}));
}
app.use('/unexpected',createForecastRouter(undefined,undefined,undefined,()=>{throw Error('secret');}));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.listening?r():server.once('listening',r));const address=server.address();if(!address||typeof address==='string')throw Error('listener');const base=`http://127.0.0.1:${address.port}`;
afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
test('HU07 exact HTTP contract, active artifact and safe scope',async()=>{
 const r=await fetch(base+'/forecasts/demand/metrics');expect(r.status).toBe(200);expect(await r.json()).toEqual({status:'available',modelId:'xm-demandasin-ridge',modelVersion:'1.0.0',active:true,forecastType:'aggregate_demand_proxy',target:'demanda_kwh',unit:'kWh',horizonDays:1,
 training:{trainedAt:null,trainedAtStatus:'not_recorded',snapshotSha256:'73e795ae04e4dd36e1dff7fda38e47627514602565ee086b2710f1c6da6c807f',sourceRange:{start:'2023-08-01',end:'2024-07-30'},effectiveRange:{start:'2023-08-29',end:'2024-07-30'},effectiveRows:337},
 evaluation:{type:'external_temporal_holdout',range:{start:'2024-07-31',end:'2024-09-28'},snapshotSha256:'ddb2b802941ae82230d9fbe0dee1847cdbaa12d986f0af460cf54a6376fd8eaa',evaluable:60,unavailable:0,MAE:{value:5140961.018887941,unit:'kWh'},RMSE:{value:6644945.165229929,unit:'kWh'},bias:{value:-1246487.8464061364,unit:'kWh'},percentageError:{metric:'WAPE',value:2.2583614453366287,unit:'percent'}},scope:{aggregation:'SIN',personalized:false,zonalFallback:false,confidenceStatus:'not_defined'}});
 const m=loadModel(),result=getDemandForecastMetrics();expect(result.modelId).toBe(m.modelId);expect(result.modelVersion).toBe(m.modelVersion);expect(result.evaluation.MAE.value).toBe(m.evaluationSummary.metrics.Ridge.MAE);expect(forbidden).not.toHaveBeenCalled();
});
test('query rejected',async()=>expect((await fetch(base+'/forecasts/demand/metrics?modelVersion=2')).status).toBe(400));
test('body rejected',async()=>{const status=await new Promise<number>(resolve=>{const req=request(base+'/forecasts/demand/metrics',{method:'GET',headers:{'Content-Length':2}},res=>{res.resume();resolve(res.statusCode!);});req.end('{}');});expect(status).toBe(400);});
test('POST metrics is not registered',async()=>expect((await fetch(base+'/forecasts/demand/metrics',{method:'POST'})).status).toBe(404));
test.each(['missing','invalid','summary'])('safe 409 %s',async path=>{const r=await fetch(base+'/'+path+'/demand/metrics');expect(r.status).toBe(409);expect(await r.json()).toEqual({status:'unavailable',error:'FORECAST_MODEL_INCOMPATIBLE',message:messages.FORECAST_MODEL_INCOMPATIBLE});});
test('unexpected safe 500',async()=>{const r=await fetch(base+'/unexpected/demand/metrics');expect(r.status).toBe(500);expect(await r.json()).toEqual({error:'FORECAST_FAILED',message:messages.FORECAST_FAILED});});
test.each(['MAE','RMSE','bias'])('nonfinite %s',key=>{for(const v of [NaN,Infinity]){const m:any=structuredClone(artifact);m.evaluationSummary.metrics.Ridge[key]=v;expect(()=>validateModel(m)).toThrow();}});
test.each([0,-1,Infinity])('bad WAPE denominator %s',v=>{const m=structuredClone(artifact);m.evaluationSummary.metrics.Ridge.WAPE.denominatorAbsoluteActualKwh=v;expect(()=>validateModel(m)).toThrow();});
test.each(['modelId','modelVersion','type','range','snapshotSha256'])('evaluation identity %s',key=>{const m:any=structuredClone(artifact);m.evaluationSummary[key]=null;expect(()=>validateModel(m)).toThrow();});
test('incoherent range/hash and WAPE',()=>{for(const change of [(m:any)=>m.externalHoldoutSnapshotSha256='a'.repeat(64),(m:any)=>m.evaluationSummary.range.start='2024-08-01',(m:any)=>m.evaluationSummary.metrics.Ridge.WAPE.value=NaN,(m:any)=>m.evaluationSummary.metrics.Ridge.WAPE.value=999,(m:any)=>m.evaluationSummary.metrics.Ridge.evaluable=59,(m:any)=>m.trainedAt='2024-07-30',(m:any)=>m.trainedAtStatus='inferred']){const m=structuredClone(artifact);change(m);expect(()=>validateModel(m)).toThrow();}});
test('cache success/failure and immutable metrics',()=>{const read=mock(()=>JSON.stringify(artifact));const load=createModelLoader(read);expect(load()).toBe(load());expect(read).toHaveBeenCalledTimes(1);expect(Object.isFrozen(load().evaluationSummary.metrics.Ridge.WAPE)).toBe(true);const bad=mock(()=>'{'),fail=createModelLoader(bad);expect(fail).toThrow();expect(fail).toThrow();expect(bad).toHaveBeenCalledTimes(1);});
test('projection has no infrastructure or metric calculation dependencies',()=>{const s=readFileSync(new URL('../services/demand-forecast-metrics.service.ts',import.meta.url),'utf8');expect(s).not.toMatch(/prisma|fetch\s*\(|XmProvider|prepareDataset|\bfit\s*\(|Math\.|reduce\s*\(/);expect(s.match(/from ['"][^'"]+['"]/g)).toEqual(["from '@/models/xm-demandasin-ridge/model-loader'"]);expect(forbidden).not.toHaveBeenCalled();});
test('promotion parameters and stored evaluation unchanged',()=>{const prior=JSON.parse(readFileSync(new URL('../../../docs/evidencias/hu-06-demandasin/external-holdout/ridge-model.json',import.meta.url),'utf8'));expect(artifact.evaluationSummary.metrics).toEqual(prior.metrics);expect(artifact.coefficients).toEqual(prior.coefficients);expect(artifact.intercept).toBe(prior.intercept);});

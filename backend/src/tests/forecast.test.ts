import {test, expect, mock, afterAll, beforeEach} from 'bun:test';
import express from 'express';
import artifact from '@/models/xm-gene-ridge/1.0.0/model.json';
import fixture from './fixtures/forecast-parity.json';
import {readFileSync} from 'node:fs';
import {createModelLoader, loadModel, validateModel} from '@/models/xm-gene-ridge/model-loader';
import {previousDate} from '@/services/forecast.contract';
const writes = mock();
mock.module('@/lib/prisma', () => ({prisma:{preparedDataset:{findUnique:mock(),create:writes},energyDataset:{create:writes,updateMany:writes,findUnique:mock()}}}));
const {createForecastService} = await import('@/services/forecast.service');
const {createForecastRouter} = await import('@/controllers/forecast.controller');
const base = () => ({id:17,sourceDatasetId:36,profileId:'xm_gene_preparacion_base',profileVersion:'1.0.0',sourceRulesetId:'xm_gene_base',sourceRulesetVersion:'1.0.0',content:{variables:{minimum:[{name:'fecha_xm',type:'string',representation:'YYYY-MM-DD'},{name:'hora_xm',type:'number',representation:'integer 1..24'},{name:'energia_kwh',type:'number',unit:'kWh'}]},records:structuredClone(fixture.records)}});
let prepared: ReturnType<typeof base> | null = base();
let loader = loadModel;
const read = mock(async (_id:number) => prepared);
const service = createForecastService(read, () => loader());
const app = express(); app.use('/forecasts',createForecastRouter(service));
const server = app.listen(0,'127.0.0.1');
await new Promise<void>(r=>server.listening?r():server.once('listening',r));
const address=server.address(); if(!address||typeof address==='string')throw Error('listener');
const url=`http://127.0.0.1:${address.port}/forecasts/supply`;
afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
beforeEach(()=>{prepared=base();loader=loadModel;read.mockClear();writes.mockClear();});
const input={preparedDatasetId:17,targetDate:'2024-04-08'};
async function post(body:unknown=input, type='application/json',raw=false){const r=await fetch(url,{method:'POST',headers:{'Content-Type':type},body:raw?String(body):JSON.stringify(body)});return {status:r.status,body:await r.json() as any};}
test('HU04 parity offline, metadata, 24 periods, deterministic and read only',async()=>{
 const a=await post(),b=await post(); expect(a.status).toBe(200);expect(a).toEqual(b);
 expect(a.body).toMatchObject({status:'available',preparedDatasetId:17,sourceDatasetId:36,forecastType:'generation_availability_proxy',target:'energia_kwh',unit:'kWh',horizonPeriods:24,modelId:'xm-gene-ridge',modelVersion:'1.0.0',targetDate:input.targetDate});
 expect(a.body.predictions.map((p:any)=>p.hora_xm)).toEqual(Array.from({length:24},(_,i)=>i+1));
 a.body.predictions.forEach((p:any,i:number)=>expect(Math.abs(p.energia_kwh-fixture.predictions[i]!)).toBeLessThan(fixture.absoluteToleranceKwh));expect(writes).not.toHaveBeenCalled();expect(read).toHaveBeenCalledWith(17);
});
test.each([{},null,{...input,extra:1},{...input,preparedDatasetId:0},{...input,preparedDatasetId:1.5},{...input,preparedDatasetId:'17'},{...input,targetDate:'2024-02-30'},{...input,targetDate:'2024-4-08'},{...input,targetDate:'2024-04-08T00:00:00Z'}])('invalid request %j',async value=>{expect((await post(value)).status).toBe(400);expect(read).not.toHaveBeenCalled();});
test('parser safe malformed JSON, type and limit',async()=>{expect((await post('{','application/json',true)).status).toBe(400);expect((await post(input,'text/plain')).status).toBe(415);expect((await post(' '.repeat(17000),'application/json',true)).status).toBe(413);});
test('404 missing',async()=>{prepared=null;expect((await post()).body.error).toBe('PREPARED_DATASET_NOT_FOUND');});
test.each(['profileId','profileVersion','sourceRulesetId','sourceRulesetVersion'] as const)('incompatible %s',async k=>{prepared![k]='other';const r=await post();expect(r.status).toBe(422);expect(r.body.error).toBe('FORECAST_PROFILE_NOT_APPLICABLE');});
test.each(['2024-03-30','2024-03-29'])('training boundary %s',async targetDate=>expect((await post({...input,targetDate})).body.error).toBe('FORECAST_DATE_NOT_SUPPORTED'));
test.each(['2024-04-01','2024-04-07'])('missing required date %s',async d=>{prepared!.content.records=prepared!.content.records.filter(r=>r.fecha_xm!==d);const r=await post();expect(r.status).toBe(422);expect(r.body).toEqual({status:'unavailable',error:'FORECAST_DATA_INSUFFICIENT',message:'No hay datos históricos suficientes para pronosticar el día solicitado.'});});
test('missing D1 period24',async()=>{prepared!.content.records=prepared!.content.records.filter(r=>!(r.fecha_xm==='2024-04-07'&&r.hora_xm===24));expect((await post()).status).toBe(422);});
test('duplicate rejected',async()=>{prepared!.content.records.push(prepared!.content.records[0]!);expect((await post()).body.error).toBe('PREPARED_DATASET_INCONSISTENT');});
test.each([NaN,Infinity,null,'1'])('corrupt value %s',async v=>{(prepared!.content.records[0] as any).energia_kwh=v;expect((await post()).status).toBe(409);});
test('incompatible variable',async()=>{prepared!.content.variables.minimum[2]!.unit='MW';expect((await post()).status).toBe(409);});
test('target/future values and record indices cannot leak',async()=>{const original=await post();for(const d of ['2024-04-08','2024-04-09'])for(let h=1;h<=24;h++)prepared!.content.records.push({fecha_xm:d,hora_xm:h,energia_kwh:-999999});expect(await post()).toEqual(original);prepared!.content.records.forEach((r:any)=>{r.sourceRecordIndex=999;r.energia_kwh=r.fecha_xm>=input.targetDate?1e20:r.energia_kwh;});expect(await post()).toEqual(original);});
test('month rollover and leap calendar without timestamp',()=>{expect(previousDate('2024-03-01',1)).toBe('2024-02-29');expect(previousDate('2024-04-01',7)).toBe('2024-03-25');});
test('month rollover inference',async()=>{prepared!.content.records.forEach(r=>{r.fecha_xm=r.fecha_xm==='2024-04-01'?'2024-03-25':'2024-03-31';});expect((await post({...input,targetDate:'2024-04-01'})).status).toBe(200);});
test('safe model failure and internal failure',async()=>{loader=createModelLoader(()=>{throw Error('secret');});let r=await post();expect(r.status).toBe(409);expect(JSON.stringify(r.body)).not.toContain('secret');loader=loadModel;read.mockRejectedValueOnce(Error('secret'));r=await post();expect(r.status).toBe(500);expect(JSON.stringify(r.body)).not.toContain('secret');});
test('loader immutable and reads once',()=>{const read=mock(()=>JSON.stringify(artifact));const load=createModelLoader(read);expect(load()).toBe(load());expect(read).toHaveBeenCalledTimes(1);expect(Object.isFrozen(load().coefficients)).toBe(true);});
test.each(['id','alpha','features','means','std','coefficient','intercept','range','profile','unit','horizon'])('model invalid %s',kind=>{const m:any=structuredClone(artifact);switch(kind){case'id':m.modelId='bad';break;case'alpha':m.alpha=NaN;break;case'features':m.orderedFeatures.reverse();break;case'means':m.scaler.means=[];break;case'std':m.scaler.standardDeviations[0]=0;break;case'coefficient':m.coefficients[0]=Infinity;break;case'intercept':m.intercept=null;break;case'range':m.trainingSourceRange.end='2024-02-30';break;case'profile':m.compatibleProfile='other';break;case'unit':m.unit='MW';break;case'horizon':m.horizonPeriods=1;}expect(()=>validateModel(m)).toThrow();});
test('negative predictions not clamped; nonfinite fails',async()=>{const m=structuredClone(artifact);m.coefficients.fill(0);m.intercept=-1;loader=()=>validateModel(m);expect((await post()).body.predictions[0].energia_kwh).toBe(-1);m.coefficients[0]=Number.MAX_VALUE;m.scaler.standardDeviations[0]=Number.MIN_VALUE;expect((await post()).body.error).toBe('FORECAST_FAILED');});

test('array body invalid',async()=>{expect((await post([])).status).toBe(400);expect(read).not.toHaveBeenCalled();});
test('promoted parameters exactly match evaluated artifact',()=>{
 const evaluated=JSON.parse(readFileSync(new URL('../../../docs/evidencias/hu-04-xm-gene/external-holdout/ridge-model.json',import.meta.url),'utf8'));
 expect(artifact.coefficients).toEqual(evaluated.coefficients);expect(artifact.intercept).toBe(evaluated.intercept);expect(artifact.scaler.means).toEqual(evaluated.scaling.means);expect(artifact.scaler.standardDeviations).toEqual(evaluated.scaling.standardDeviations);expect(artifact.orderedFeatures).toEqual(evaluated.features);expect(artifact.trainingSnapshotSha256).toBe(evaluated.snapshotSha256);
});
test('inference dependency boundary excludes XM, preparation and training',()=>{
 const source=readFileSync(new URL('../services/forecast.service.ts',import.meta.url),'utf8');
 expect(source).not.toMatch(/fetch\s*\(|prepareDataset|ExternalDataService|XmProvider|\.create\s*\(|\.update\s*\(|\.delete\s*\(|\bfit\s*\(/);
});

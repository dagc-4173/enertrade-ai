import {test, expect, mock, afterAll, beforeEach} from 'bun:test';
import express from 'express';
import artifact from '@/models/xm-gene-ridge/1.0.0/model.json';
import fixture from './fixtures/forecast-parity.json';
import {readFileSync} from 'node:fs';
import {createModelLoader, loadModel, validateModel} from '@/models/xm-gene-ridge/model-loader';
import {loadDirectSupplyModel} from '@/models/xm-gene-ridge-direct-v2/model-loader';
import {previousDate} from '@/services/forecast.contract';
const writes = mock();
mock.module('@/lib/prisma', () => ({prisma:{preparedDataset:{findMany:mock(),create:writes},energyDataset:{create:writes,updateMany:writes,findUnique:mock()}}}));
const {createForecastService} = await import('@/services/forecast.service');
const {createForecastRouter} = await import('@/controllers/forecast.controller');
const variables = {minimum:[{name:'fecha_xm',type:'string',representation:'YYYY-MM-DD'},{name:'hora_xm',type:'number',representation:'integer 1..24'},{name:'energia_kwh',type:'number',unit:'kWh'}]};
type Records = typeof fixture.records;
function preparedArtifact(id:number, sourceDatasetId:number, records:Records, overrides:Partial<{profileId:string;profileVersion:string;sourceRulesetId:string;sourceRulesetVersion:string}> = {}) {
  return {id, sourceDatasetId, profileId:'xm_gene_preparacion_base', profileVersion:'1.0.0', sourceRulesetId:'xm_gene_base', sourceRulesetVersion:'1.0.0', ...overrides,
    content:{variables:structuredClone(variables), records:structuredClone(records)}};
}
const base = () => preparedArtifact(17, 36, fixture.records);
const d1Date = '2024-04-07', d7Date = '2024-04-01';
const d1Records = () => fixture.records.filter(r => r.fecha_xm === d1Date);
const d7Records = () => fixture.records.filter(r => r.fecha_xm === d7Date);
let rows: ReturnType<typeof preparedArtifact>[] = [base()];
let loader: () => any = () => loadDirectSupplyModel(1);
let coverage: { historicalFrom: string; persistedUntil: string } | null = { historicalFrom:'2024-01-01', persistedUntil:'2024-04-07' };
const read = mock(async () => rows);
const legacyFeatures = (get:(date:string,period:number)=>number|undefined,origin:string,targetDate:string,period:number) => {
 const weekly=previousDate(targetDate,7),values=[get(origin,period),get(weekly,period),get(origin,24),...Array(14).fill(0)];
 if(values.some(value=>value===undefined))return null;
 return {values:values as number[],sourceObservations:[{date:origin,period},{date:weekly,period},{date:origin,period:24}]};
};
const service = createForecastService(read, horizonDays => ({...loader(),horizonDays,modelVersion:'1.0.0-experimental',scaler:{...loader().scaler,ddof:0}} as any), async () => coverage, legacyFeatures);
const app = express(); app.use('/forecasts',createForecastRouter(service));
const server = app.listen(0,'127.0.0.1');
await new Promise<void>(r=>server.listening?r():server.once('listening',r));
const address=server.address(); if(!address||typeof address==='string')throw Error('listener');
const url=`http://127.0.0.1:${address.port}/forecasts/supply`;
afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
beforeEach(()=>{rows=[base()];loader=()=>loadDirectSupplyModel(1);coverage={historicalFrom:'2024-01-01',persistedUntil:'2024-04-07'};read.mockClear();writes.mockClear();});
const input={targetDate:'2024-04-08'};
async function post(body:unknown=input, type='application/json',raw=false){const r=await fetch(url,{method:'POST',headers:{'Content-Type':type},body:raw?String(body):JSON.stringify(body)});return {status:r.status,body:await r.json() as any};}
test('HU04 direct V2 metadata, 24 periods, deterministic and read only',async()=>{
 const a=await post(),b=await post(); expect(a.status).toBe(200);expect(a).toEqual(b);
 expect(a.body).toMatchObject({status:'available',forecastOriginDate:'2024-04-07',horizonDays:1,forecastType:'generation_availability_proxy',target:'energia_kwh',unit:'kWh',horizonPeriods:24,modelId:'xm-gene-ridge-direct-h1-v2',modelVersion:'1.0.0-experimental',modelStatus:'experimental',academicValidation:'pending',targetDate:input.targetDate});
 expect(a.body.sourceArtifacts).toEqual([{preparedDatasetId:17,sourceDatasetId:36}]);
 expect(a.body.predictions.map((p:any)=>p.hora_xm)).toEqual(Array.from({length:24},(_,i)=>i+1));
 a.body.predictions.forEach((p:any)=>expect(Number.isFinite(p.energia_kwh)).toBe(true)); expect(writes).not.toHaveBeenCalled();
 expect(read).toHaveBeenCalledWith({profileId:'xm_gene_preparacion_base',profileVersion:'1.0.0',sourceRulesetId:'xm_gene_base',sourceRulesetVersion:'1.0.0'});
});
test.each([{},null,{...input,extra:1},{targetDate:'2024-02-30'},{targetDate:'2024-4-08'},{targetDate:'2024-04-08T00:00:00Z'}])('invalid request %j',async value=>{expect((await post(value)).status).toBe(400);expect(read).not.toHaveBeenCalled();});
test('HU04-MULTI-12 body with preparedDatasetId is rejected under the new contract',async()=>{
 const r=await post({preparedDatasetId:17,targetDate:input.targetDate});
 expect(r.status).toBe(400);expect(r.body.error).toBe('INVALID_FORECAST_REQUEST');expect(read).not.toHaveBeenCalled();
});
test('parser safe malformed JSON, type and limit',async()=>{expect((await post('{','application/json',true)).status).toBe(400);expect((await post(input,'text/plain')).status).toBe(415);expect((await post(' '.repeat(17000),'application/json',true)).status).toBe(413);});
test('HU04-MULTI-10 no compatible PreparedDataset yields a controlled 422, not a 404',async()=>{
 rows=[];const r=await post();
 expect(r.status).toBe(422);
 expect(r.body).toEqual({status:'unavailable',error:'FORECAST_DATA_INSUFFICIENT',message:'No hay datos históricos suficientes para pronosticar el día solicitado.'});
});
test.each(['2024-03-30','2024-03-29'])('HU04-MULTI-11 training boundary %s keeps existing behaviour',async targetDate=>expect((await post({targetDate})).body.error).toBe('FORECAST_DATE_NOT_SUPPORTED'));
test('D+1 with complete history remains available when coverage ends on D-1', async()=>{
 coverage={historicalFrom:'2024-01-01',persistedUntil:'2024-04-07'};
 const r=await post(); expect(r.status).toBe(200); expect(r.body.status).toBe('available');
});
test('D+1 with a missing D-7 remains FORECAST_DATA_INSUFFICIENT', async()=>{
 coverage={historicalFrom:'2024-01-01',persistedUntil:'2024-04-07'};
 rows[0]!.content.records=rows[0]!.content.records.filter(r=>r.fecha_xm!=='2024-04-01');
 const r=await post(); expect(r.status).toBe(422); expect(r.body.error).toBe('FORECAST_DATA_INSUFFICIENT');
});
test.each(['2024-04-15','2026-09-30'])('dates beyond D+7 are FORECAST_HORIZON_NOT_SUPPORTED: %s',async targetDate=>{
 coverage={historicalFrom:'2024-01-01',persistedUntil:'2024-04-07'};
 const r=await post({targetDate}); expect(r.status).toBe(422); expect(r.body.error).toBe('FORECAST_HORIZON_NOT_SUPPORTED');
 expect(r.body.message).toBe('Los modelos experimentales de Oferta admiten hasta 7 días de horizonte. La última observación disponible es 07/04/2024. El rango pronosticable actual es 08/04/2024 a 14/04/2024.');
});
test.each(['2024-04-01','2024-04-07'])('missing required date %s',async d=>{rows[0]!.content.records=rows[0]!.content.records.filter(r=>r.fecha_xm!==d);const r=await post();expect(r.status).toBe(422);expect(r.body).toEqual({status:'unavailable',error:'FORECAST_DATA_INSUFFICIENT',message:'No hay datos históricos suficientes para pronosticar el día solicitado.'});});
test('missing D1 period24',async()=>{rows[0]!.content.records=rows[0]!.content.records.filter(r=>!(r.fecha_xm==='2024-04-07'&&r.hora_xm===24));expect((await post()).status).toBe(422);});
test('duplicate rejected within the same artifact',async()=>{rows[0]!.content.records.push(rows[0]!.content.records[0]!);expect((await post()).body.error).toBe('PREPARED_DATASET_INCONSISTENT');});
test.each([NaN,Infinity,null,'1'])('corrupt value %s',async v=>{(rows[0]!.content.records[0] as any).energia_kwh=v;expect((await post()).status).toBe(409);});
test('incompatible variable',async()=>{rows[0]!.content.variables.minimum[2]!.unit='MW';expect((await post()).status).toBe(409);});
test('target/future values and record indices cannot leak',async()=>{const original=await post();for(const d of ['2024-04-08','2024-04-09'])for(let h=1;h<=24;h++)rows[0]!.content.records.push({fecha_xm:d,hora_xm:h,energia_kwh:-999999});expect(await post()).toEqual(original);rows[0]!.content.records.forEach((r:any)=>{r.sourceRecordIndex=999;r.energia_kwh=r.fecha_xm>=input.targetDate?1e20:r.energia_kwh;});expect(await post()).toEqual(original);});
test('month rollover and leap calendar without timestamp',()=>{expect(previousDate('2024-03-01',1)).toBe('2024-02-29');expect(previousDate('2024-04-01',7)).toBe('2024-03-25');});
test('month rollover inference',async()=>{coverage={historicalFrom:'2024-01-01',persistedUntil:'2024-03-31'};rows[0]!.content.records.forEach(r=>{r.fecha_xm=r.fecha_xm==='2024-04-01'?'2024-03-25':'2024-03-31';});expect((await post({targetDate:'2024-04-01'})).status).toBe(200);});
test('HU04-MULTI-01 D-1 and D-7 split across two different PreparedDataset',async()=>{
 rows=[preparedArtifact(21,40,d7Records()),preparedArtifact(22,41,d1Records())];
 const r=await post();
 expect(r.status).toBe(200);
 expect(r.body.predictions.map((p:any)=>p.hora_xm)).toEqual(Array.from({length:24},(_,i)=>i+1));
 r.body.predictions.forEach((p:any)=>expect(Number.isFinite(p.energia_kwh)).toBe(true));
 expect(r.body.sourceArtifacts).toEqual([{preparedDatasetId:21,sourceDatasetId:40},{preparedDatasetId:22,sourceDatasetId:41}]);
});
test('HU04-MULTI-02 D-1 and D-7 spread across more than two compatible PreparedDataset',async()=>{
 const d7=d7Records(), d1=d1Records();
 rows=[preparedArtifact(23,42,d7.slice(0,12)),preparedArtifact(24,43,d7.slice(12)),preparedArtifact(25,44,d1)];
 const r=await post();
 expect(r.status).toBe(200);
 expect(r.body.sourceArtifacts).toEqual([{preparedDatasetId:23,sourceDatasetId:42},{preparedDatasetId:24,sourceDatasetId:43},{preparedDatasetId:25,sourceDatasetId:44}]);
});
test('HU04-MULTI-03 missing a D-1 period even when spread across artifacts',async()=>{
 rows=[preparedArtifact(26,45,d7Records()),preparedArtifact(27,46,d1Records().filter(r=>r.hora_xm!==5))];
 const r=await post();
 expect(r.status).toBe(422);expect(r.body.error).toBe('FORECAST_DATA_INSUFFICIENT');
});
test('HU04-MULTI-04 missing a D-7 period even when spread across artifacts',async()=>{
 rows=[preparedArtifact(28,47,d7Records().filter(r=>r.hora_xm!==10)),preparedArtifact(29,48,d1Records())];
 const r=await post();
 expect(r.status).toBe(422);expect(r.body.error).toBe('FORECAST_DATA_INSUFFICIENT');
});
test('HU04-MULTI-05 identical duplicate fecha_xm+hora_xm across artifacts merges without ambiguity',async()=>{
 rows=[preparedArtifact(30,49,d7Records()),preparedArtifact(31,50,d1Records())];
 const baseline=await post();
 rows=[preparedArtifact(30,49,d7Records()),preparedArtifact(31,50,d1Records()),preparedArtifact(32,52,[{...d1Records()[0]!}])];
 const merged=await post();
 expect(merged.status).toBe(200);
 expect(merged.body.predictions).toEqual(baseline.body.predictions);
 expect(merged.body.sourceArtifacts).toContainEqual({preparedDatasetId:32,sourceDatasetId:52});
});
test('HU04-MULTI-06 conflicting fecha_xm+hora_xm across artifacts aborts deterministically',async()=>{
 const conflicting={...d1Records()[0]!, energia_kwh:d1Records()[0]!.energia_kwh+1};
 rows=[preparedArtifact(33,53,d7Records()),preparedArtifact(34,54,d1Records()),preparedArtifact(35,55,[conflicting])];
 const r=await post();
 expect(r.status).toBe(409);expect(r.body.error).toBe('PREPARED_DATASET_INCONSISTENT');
});
test('HU04-MULTI-07 incompatible profileId is ignored and does not contaminate the history',async()=>{
 rows=[preparedArtifact(36,56,d7Records()),preparedArtifact(37,57,d1Records())];
 const baseline=await post();
 rows=[...rows,preparedArtifact(38,58,[{...d1Records()[0]!,energia_kwh:-999999}],{profileId:'other_profile'})];
 const r=await post();
 expect(r.status).toBe(200);
 expect(r.body.predictions).toEqual(baseline.body.predictions);
 expect(r.body.sourceArtifacts.some((a:any)=>a.preparedDatasetId===38)).toBe(false);
});
test('HU04-MULTI-08 incompatible sourceRulesetId is ignored and does not contaminate the history',async()=>{
 rows=[preparedArtifact(39,59,d7Records()),preparedArtifact(40,60,d1Records())];
 const baseline=await post();
 rows=[...rows,preparedArtifact(41,61,[{...d1Records()[0]!,energia_kwh:-999999}],{sourceRulesetId:'other_ruleset'})];
 const r=await post();
 expect(r.status).toBe(200);
 expect(r.body.predictions).toEqual(baseline.body.predictions);
 expect(r.body.sourceArtifacts.some((a:any)=>a.preparedDatasetId===41)).toBe(false);
});
test('HU04-MULTI-09 target date or later data living in a separate compatible artifact is never used',async()=>{
 rows=[preparedArtifact(42,62,d7Records()),preparedArtifact(43,63,d1Records())];
 const baseline=await post();
 rows=[...rows,preparedArtifact(44,64,[{fecha_xm:'2024-04-08',hora_xm:1,energia_kwh:1e20},{fecha_xm:'2024-04-09',hora_xm:1,energia_kwh:1e20}])];
 const r=await post();
 expect(r.status).toBe(200);
 expect(r.body.predictions).toEqual(baseline.body.predictions);
});
test('safe model failure and internal failure',async()=>{loader=createModelLoader(()=>{throw Error('secret');});let r=await post();expect(r.status).toBe(409);expect(JSON.stringify(r.body)).not.toContain('secret');loader=loadModel;read.mockRejectedValueOnce(Error('secret'));r=await post();expect(r.status).toBe(500);expect(JSON.stringify(r.body)).not.toContain('secret');});
test('loader immutable and reads once',()=>{const read=mock(()=>JSON.stringify(artifact));const load=createModelLoader(read);expect(load()).toBe(load());expect(read).toHaveBeenCalledTimes(1);expect(Object.isFrozen(load().coefficients)).toBe(true);});
test.each(['id','alpha','features','means','std','coefficient','intercept','range','profile','unit','horizon'])('model invalid %s',kind=>{const m:any=structuredClone(artifact);switch(kind){case'id':m.modelId='bad';break;case'alpha':m.alpha=NaN;break;case'features':m.orderedFeatures.reverse();break;case'means':m.scaler.means=[];break;case'std':m.scaler.standardDeviations[0]=0;break;case'coefficient':m.coefficients[0]=Infinity;break;case'intercept':m.intercept=null;break;case'range':m.trainingSourceRange.end='2024-02-30';break;case'profile':m.compatibleProfile='other';break;case'unit':m.unit='MW';break;case'horizon':m.horizonPeriods=1;}expect(()=>validateModel(m)).toThrow();});
test('negative predictions not clamped; nonfinite fails',async()=>{const m=structuredClone(loadDirectSupplyModel(1));m.coefficients.fill(0);m.intercept=-1;loader=()=>m;expect((await post()).body.predictions[0].energia_kwh).toBe(-1);m.coefficients[0]=Number.MAX_VALUE;m.scaler.standardDeviations[0]=Number.MIN_VALUE;expect((await post()).body.error).toBe('FORECAST_FAILED');});

test('array body invalid',async()=>{expect((await post([])).status).toBe(400);expect(read).not.toHaveBeenCalled();});
test('promoted parameters exactly match evaluated artifact',()=>{
 const evaluated=JSON.parse(readFileSync(new URL('../../../docs/evidencias/hu-04-xm-gene/external-holdout/ridge-model.json',import.meta.url),'utf8'));
 expect(artifact.coefficients).toEqual(evaluated.coefficients);expect(artifact.intercept).toBe(evaluated.intercept);expect(artifact.scaler.means).toEqual(evaluated.scaling.means);expect(artifact.scaler.standardDeviations).toEqual(evaluated.scaling.standardDeviations);expect(artifact.orderedFeatures).toEqual(evaluated.features);expect(artifact.trainingSnapshotSha256).toBe(evaluated.snapshotSha256);
});
test('inference dependency boundary excludes XM, preparation and training',()=>{
 const source=readFileSync(new URL('../services/forecast.service.ts',import.meta.url),'utf8');
 expect(source).not.toMatch(/fetch\s*\(|prepareDataset|ExternalDataService|XmProvider|\.create\s*\(|\.update\s*\(|\.delete\s*\(|\bfit\s*\(/);
});

import { afterAll, expect, test } from 'bun:test';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createForecastRouter } from '@/controllers/forecast.controller';
import { createForecastService } from '@/services/forecast.service';
import { createDirectSupplyModelLoader, loadDirectSupplyModel } from '@/models/xm-gene-ridge-direct-v2/model-loader';
import { addDays, parseCsv } from '@/experiments/hu04-multihorizon';
import { predictV2, samplesV2 } from '@/experiments/hu04-multihorizon-v2';

const corpus = parseCsv(readFileSync(new URL('../../../docs/evidencias/hu-04-multihorizon/corpus/xm-gene-2024-01-01_2026-09-20.csv', import.meta.url), 'utf8'));
const prepared = { id: 68, sourceDatasetId: 198, profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', content: { variables: { minimum: [{name:'fecha_xm',type:'string',representation:'YYYY-MM-DD'},{name:'hora_xm',type:'number',representation:'integer 1..24'},{name:'energia_kwh',type:'number',unit:'kWh'}] }, records: corpus.map((record, sourceRecordIndex) => ({ ...record, sourceRecordIndex })) } };
const origin = '2026-06-01';
const service = createForecastService(async () => [prepared], loadDirectSupplyModel, async () => ({ historicalFrom: '2024-01-01', persistedUntil: origin, latestReceivedDate: origin, latestIndividuallyUsableDate: origin, semanticExcludedDates: [] }));
const app = express(); app.use('/forecasts', createForecastRouter(service));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected listener.'); const url = `http://127.0.0.1:${address.port}/forecasts/supply`;
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
async function post(targetDate: string) { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDate }) }); return { status: response.status, body: await response.json() as any }; }

test.each([1,2,3,4,5,6,7])('SUPPLY-H%s selects exact direct model and matches offline predictions', async horizonDays => {
  const targetDate = addDays(origin, horizonDays), response = await post(targetDate), model = loadDirectSupplyModel(horizonDays);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ status:'available', forecastOriginDate:origin, targetDate, horizonDays, modelId:`xm-gene-ridge-direct-h${horizonDays}-v2`, modelVersion:'1.0.0-experimental', modelStatus:'experimental', academicValidation:'pending', horizonPeriods:24, sourceArtifacts:[{preparedDatasetId:68,sourceDatasetId:198}] });
  expect(response.body.predictions).toHaveLength(24); expect(response.body.predictions.map((row:any)=>row.hora_xm)).toEqual(Array.from({length:24},(_,index)=>index+1));
  const offline = samplesV2(corpus, { start: targetDate, end: targetDate }, horizonDays).map(row => predictV2({ alpha:model.hyperparameters.alpha, coefficients:model.coefficients, intercept:model.intercept, means:model.scaler.means, standardDeviations:model.scaler.standardDeviations }, row.features));
  response.body.predictions.forEach((row:any,index:number)=>expect(Math.abs(row.energia_kwh-offline[index]!)).toBeLessThan(1e-7));
});

test('SUPPLY-H8 rejects without fallback to h1', async () => {
  const response = await post(addDays(origin, 8));
  expect(response.status).toBe(422); expect(response.body.error).toBe('FORECAST_HORIZON_NOT_SUPPORTED'); expect(response.body.message).toContain('hasta 7 días');
});

test('direct model loader rejects false candidate, wrong requested horizon and non-finite artifact', () => {
  const modelText = readFileSync(new URL('../models/xm-gene-ridge-direct-h1-v2/1.0.0/model.json', import.meta.url), 'utf8');
  const results = JSON.parse(readFileSync(new URL('../../../docs/evidencias/hu-04-multihorizon-v2/results.json', import.meta.url), 'utf8'));
  const falseCandidate = structuredClone(results); falseCandidate.results['1'].candidate = false;
  expect(() => createDirectSupplyModelLoader(() => modelText, () => JSON.stringify(falseCandidate))(1)).toThrow('compatible');
  expect(() => createDirectSupplyModelLoader(() => modelText, () => JSON.stringify(results))(2)).toThrow('compatible');
  const nonfinite = JSON.parse(modelText); nonfinite.coefficients[0] = null;
  expect(() => createDirectSupplyModelLoader(() => JSON.stringify(nonfinite), () => JSON.stringify(results))(1)).toThrow('compatible');
});
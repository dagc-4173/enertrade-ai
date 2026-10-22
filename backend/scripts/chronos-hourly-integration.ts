import 'dotenv/config';
import express from 'express';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createChronosHourlyRouter } from '@/controllers/chronos-hourly.controller';
import { bogotaDate, captureDemand, createChronosHourlyService } from '@/services/chronos-hourly.service';
import { replayHourlyDemand, type HourlyDemandAcquisition } from '@/integrations/xm-hourly-demand-acquisition';

const args = process.argv.slice(2);
let service;
if (args.length) {
  if (args.length !== 2 || args[0] !== '--replay-inputs') throw Error('Usage: --replay-inputs PROSPECTIVE_CAPTURE_DIRECTORY');
  const source = resolve(args[1]!);
  const read = async (path: string) => readFile(resolve(source, path), 'utf8');
  const acquisition: HourlyDemandAcquisition = { rawBody: await read('inputs/raw.json'), catalogRawBody: await read('inputs/catalog-raw.json'),
    normalized: JSON.parse(await read('inputs/normalized.json')), manifest: JSON.parse(await read('inputs/manifest.json')) };
  replayHourlyDemand(acquisition);
  const frozen = JSON.parse(await read('manifest.json'));
  const rawBody = await read('discovery/raw.json'), receipt = JSON.parse(await read('discovery/receipt.json'));
  service = createChronosHourlyService({
    discover: async () => ({ rawBody, retrievedAt: receipt.retrieved_at, requestedRange: { startDate: receipt.body.StartDate, endDate: receipt.body.EndDate }, latestCompleteDay: frozen.latest_complete_day, incompleteDates: frozen.incomplete_discovery_dates }),
    acquire: async range => { if (JSON.stringify(range) !== JSON.stringify(acquisition.manifest.requestedRange)) throw Error('Replay range changed'); return captureDemand(acquisition) },
  });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const evidence = resolve(import.meta.dir, '../../docs/evidencias/chronos-hourly-integration', stamp);
await mkdir(evidence, { recursive: true });
const app = express();
// Authentication boundary substituted only here; no credentials, session or DB are used.
app.use('/forecasts/hourly-demand', createChronosHourlyRouter(service, (_req, _res, next) => next()));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw Error('listener');
const base = `http://127.0.0.1:${address.port}/forecasts/hourly-demand`;
const today = bogotaDate(new Date());
const targetDate = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
const results = [];
try {
  const catalogResponse = await fetch(`${base}/models`), catalog = await catalogResponse.json() as any;
  if (catalogResponse.status !== 200 || !catalog.models.every((m: any) => m.configured)) throw Error('Models not configured');
  await writeFile(resolve(evidence, 'catalog.json'), JSON.stringify(catalog, null, 2), { flag: 'wx' });
  for (const model of ['chronos2', 'bolt']) {
    const started = performance.now();
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, targetDate }) });
    const body = await response.json() as any;
    await writeFile(resolve(evidence, `${model}.json`), JSON.stringify(body, null, 2), { flag: 'wx' });
    if (response.status !== 200 || body.predictions?.length !== 24 || body.model !== model || body.targetDate !== targetDate) throw Error(`Integration failed for ${model}: ${response.status} ${body.error ?? ''}`);
    const item = { model, status: 'passed', httpStatus: response.status, targetDate, horizonDays: body.horizonDays, generatedPeriods: body.generatedPeriods, bridgePeriods: body.bridgePeriods, rows: body.predictions.length, executionId: body.trace.executionId, seconds: (performance.now() - started) / 1000 };
    results.push(item); console.log(JSON.stringify(item));
  }
  await writeFile(resolve(evidence, 'verification.json'), JSON.stringify({ status: 'passed', testId: 'CHRONOS-HTTP-REAL-01', executedAt: new Date().toISOString(), authentication: 'substituted middleware; not a real session test', databaseAccess: false, xm: args.length ? 'offline replay of previously acquired actual XM snapshots; no live provider validation' : 'live real public data', python: 'real local inference', models: results }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ evidence, status: 'passed' }));
} finally { await new Promise<void>(resolve => server.close(() => resolve())) }

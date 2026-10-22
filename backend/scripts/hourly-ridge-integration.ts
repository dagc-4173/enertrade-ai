import 'dotenv/config';
import express from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHourlyRidgeRouter } from '@/controllers/hourly-ridge.controller';
import { bogotaDate } from '@/services/chronos-hourly.service';
const directory = resolve(import.meta.dir, '../../docs/evidencias/ridge-hourly-demand-price', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(directory, { recursive: true });
const app = express(); app.use('/forecasts/hourly-ridge', createHourlyRidgeRouter((_req, _res, next) => next()));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const port = (server.address() as { port: number }).port;
const targetDate = new Date(Date.parse(bogotaDate(new Date())) + 86400000).toISOString().slice(0, 10);
const results = [];
try {
  for (const series of ['demand', 'price']) {
    const base = `http://127.0.0.1:${port}/forecasts/hourly-ridge/${series}`;
    const catalog = await fetch(`${base}/availability`), availability = await catalog.json() as any;
    await writeFile(resolve(directory, `${series}-availability.json`), JSON.stringify(availability, null, 2), { flag: 'wx' });
    if (catalog.status !== 200 || !availability.eligibleTargetDates.includes(targetDate)) throw Error(`No eligible live target: ${series}/${catalog.status}`);
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDate }) });
    const result = await response.json() as any;
    await writeFile(resolve(directory, `${series}-forecast.json`), JSON.stringify(result, null, 2), { flag: 'wx' });
    if (response.status !== 200 || result.predictions?.length !== 24 || result.referenceDay?.values?.length !== 24 || result.series !== series || result.historicalMetrics.horizonDays !== result.horizonDays) throw Error(`Live forecast failed: ${series}/${response.status}/${result.error}`);
    const entry = { series, httpStatus: response.status, modelId: result.modelId, targetDate, origin: result.latestObservedDate, horizonDays: result.horizonDays, rows: result.predictions.length, executionId: result.trace.executionId };
    results.push(entry); console.log(JSON.stringify(entry));
  }
  await writeFile(resolve(directory, 'verification.json'), JSON.stringify({ status: 'passed', executedAt: new Date().toISOString(), source: 'live XM acquisition; actual frozen Ridge inference', authentication: 'substituted only in this loopback test; not a session/browser test', training: false, scoring: false, results }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ directory, status: 'passed' }));
} catch (e) {
  await writeFile(resolve(directory, 'failure.json'), JSON.stringify({ status: 'failed', executedAt: new Date().toISOString(), completed: results }), { flag: 'wx' });
  throw e;
} finally { await new Promise<void>(resolve => server.close(() => resolve())) }

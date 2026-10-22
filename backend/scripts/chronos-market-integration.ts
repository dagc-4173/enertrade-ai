import 'dotenv/config';
import express from 'express';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createMarketSeriesAdapter, marketSeries } from '@/integrations/chronos-market-series';
import { createChronosHourlyService } from '@/services/chronos-hourly.service';
import { createChronosHourlyRouter } from '@/controllers/chronos-hourly.controller';

// Explicit historical integration replay; neither a live XM test nor a prospective forecast.
const catalogPath = process.argv[2];
if (!catalogPath || process.argv.length !== 3) throw Error('Usage: bun scripts/chronos-market-integration.ts CAPTURED_XM_CATALOG_JSON');
const catalogText = await readFile(resolve(catalogPath), 'utf8');
const corpusPath = resolve(import.meta.dir, '../../docs/evidencias/hu-08-price-multihorizon-v3-exogenous/corpus/xm-price-gene-demand-2024-01-01_2026-09-28.csv');
const corpus = await readFile(corpusPath, 'utf8');
const rows = corpus.trim().split(/\r?\n/).slice(1).map(s => s.split(','));
const origin = rows.at(-1)![0]!;
const offset = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const clock = new Date(`${offset(origin, 1)}T08:00:00Z`), targetDate = offset(origin, 2);
const evidence = resolve(import.meta.dir, '../../docs/evidencias/chronos-market-integration', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(evidence, { recursive: true });
const results = [];
for (const series of ['supply', 'price'] as const) {
  const adapter = createMarketSeriesAdapter(series, async (url, init) => {
    if (url.endsWith('/Lists')) return new Response(catalogText, { headers: { 'Content-Type': 'application/json' } });
    const query = JSON.parse(String(init.body)), byDate = new Map<string, Record<string, number | string>>();
    for (const row of rows) {
      const date = row[0]!, period = Number(row[1]);
      if (date < query.StartDate || date > query.EndDate) continue;
      const values = byDate.get(date) ?? { code: 'Sistema' };
      values[`Hour${String(period).padStart(2, '0')}`] = Number(row[series === 'price' ? 2 : 3]);
      byDate.set(date, values);
    }
    return Response.json({ Metric: { Id: marketSeries[series].metric }, Items: [...byDate].map(([Date, Values]) => ({ Date, HourlyEntities: [{ Id: 'Sistema', Values }] })) });
  });
  const service = createChronosHourlyService({ ...adapter, now: () => clock }, series);
  const app = express(); app.use(`/forecasts/hourly-${series}`, createChronosHourlyRouter(service, (_req, _res, next) => next()));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('listener');
  try {
    for (const model of ['chronos2', 'bolt']) {
      const started = performance.now();
      const response = await fetch(`http://127.0.0.1:${address.port}/forecasts/hourly-${series}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, targetDate }) });
      const result = await response.json() as any;
      await writeFile(resolve(evidence, `${series}-${model}.json`), JSON.stringify(result, null, 2), { flag: 'wx' });
      if (response.status !== 200 || result.predictions?.length !== 24 || result.series !== series || result.unit !== marketSeries[series].unit || result.historicalMetrics !== null) throw Error(`Failed: ${series}/${model}: ${response.status} ${result.error}`);
      const entry = { series, model, status: 'passed', httpStatus: response.status, unit: result.unit, rows: result.predictions.length, origin, targetDate, horizonDays: result.horizonDays, executionId: result.trace.executionId, seconds: (performance.now() - started) / 1000 };
      results.push(entry); console.log(JSON.stringify(entry));
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}
await writeFile(resolve(evidence, 'verification.json'), JSON.stringify({ status: 'passed', testId: 'CHM-REAL-WORKER-01', executedAt: new Date().toISOString(), clock: clock.toISOString(), mode: 'historical integration replay; XM-shaped fixtures reconstructed from actual historical corpus, not original raw responses', authentication: 'substituted; not a real session test', databaseAccess: false, liveXm: false, python: 'real local inference, both checkpoints hash-verified by worker', metricsComputed: false, corpusPath, corpusSha256: createHash('sha256').update(corpus).digest('hex'), catalogSha256: createHash('sha256').update(catalogText).digest('hex'), results }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ evidence, status: 'passed' }));

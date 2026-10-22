import 'dotenv/config';
import express from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '@/lib/prisma';
import { xmDailySyncService } from '@/services/xm-daily-sync.service';
import { createForecastRouter } from '@/controllers/forecast.controller';
import { createModelCatalogRouter } from '@/controllers/model-catalog.controller';
import { createCapabilityVersionsRouter } from '@/controllers/capability-versions.controller';
const directory = resolve(import.meta.dir, '../../docs/evidencias/ridge-recovery', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(directory, { recursive: true });
const app = express(); app.use('/models', createModelCatalogRouter()); app.use('/capabilities', createCapabilityVersionsRouter()); app.use('/forecasts', createForecastRouter());
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw Error('listener');
const base = `http://127.0.0.1:${address.port}`;
const get = async (path: string) => { const r = await fetch(base + path); if (r.status !== 200) throw Error(`HTTP ${r.status} ${path}`); return r.json() as Promise<any> };
try {
  const catalog = await get('/models'), capabilities = await get('/capabilities/versions');
  await writeFile(resolve(directory, 'catalog.json'), JSON.stringify(catalog, null, 2), { flag: 'wx' });
  await writeFile(resolve(directory, 'capabilities.json'), JSON.stringify(capabilities, null, 2), { flag: 'wx' });
  const metrics = [];
  for (const c of capabilities.capabilities) {
    if (c.artifactType === 'deterministic_method') continue;
    const detail = await get(`/models/${c.id}`), metric = await get(`/models/${c.id}/metrics`);
    if (detail.version !== c.version || !detail.lifecycle.activeInRuntime || metric.id !== c.id || metric.version !== c.version) throw Error('Catalog/runtime identity mismatch');
    metrics.push(metric);
  }
  for (const id of ['xm-gene-ridge', 'xm-demandasin-ridge']) if ((await get(`/models/${id}`)).lifecycle.activeInRuntime) throw Error('Legacy model active');
  await writeFile(resolve(directory, 'metrics.json'), JSON.stringify(metrics, null, 2), { flag: 'wx' });
  const availability = await xmDailySyncService.availability(), forecasts = [];
  for (const a of availability) {
    if (a.series === 'PrecBolsNaci') continue;
    const kind = a.series === 'Gene' ? 'supply' : 'demand';
    for (const targetDate of a.eligibleFutureTargetDates) {
      const r = await fetch(`${base}/forecasts/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDate }) });
      const body = await r.json() as any;
      if (r.status !== 200 || body.targetDate !== targetDate || !capabilities.capabilities.some((c: any) => c.id === body.modelId && c.version === body.modelVersion)) throw Error('Forecast/catalog identity mismatch');
      if (kind === 'supply' ? body.predictions?.length !== 24 : !Number.isFinite(body.prediction?.demanda_kwh)) throw Error('Invalid predictions');
      const item = { kind, targetDate, httpStatus: r.status, modelId: body.modelId, modelVersion: body.modelVersion, origin: body.forecastOriginDate, horizonDays: body.horizonDays, rows: kind === 'supply' ? 24 : 1 };
      forecasts.push(item);
      await writeFile(resolve(directory, `${kind}-${targetDate}.json`), JSON.stringify({ emittedAt: new Date().toISOString(), response: body }, null, 2), { flag: 'wx' });
    }
  }
  await writeFile(resolve(directory, 'verification.json'), JSON.stringify({ status: 'passed', executedAt: new Date().toISOString(), mode: 'isolated HTTP routers with real Prisma services; not an authentication/browser test; no sync/training/scoring', catalogCount: catalog.artifacts.length, activeCapabilityArtifacts: capabilities.capabilities.length, historicalArtifacts: 2, matchedMetricArtifacts: metrics.length, forecasts, availability }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ directory, status: 'passed', forecasts, priceAvailability: availability.find(a => a.series === 'PrecBolsNaci') }));
} finally { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect() }

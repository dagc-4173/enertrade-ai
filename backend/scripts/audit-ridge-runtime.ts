import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '@/lib/prisma';
import { xmDailySyncService } from '@/services/xm-daily-sync.service';
import { forecastSupply } from '@/services/forecast.service';
import { forecastDemandV5, createDemandV5ForecastService } from '@/services/demand-v5-forecast.service';
import { forecastPrice, priceCompatibility } from '@/services/price-forecast.service';
import { getForecastMetrics } from '@/services/forecast-metrics.service';
import { getDemandV5Metrics } from '@/services/demand-v5-metrics.service';
import { loadDirectSupplyModel } from '@/models/xm-gene-ridge-direct-v2/model-loader';
import { loadDirectDemandV5Model } from '@/models/xm-demandasin-ridge-direct-v5/model-loader';

// Read-only database audit: never invoke sync, controller trace, scheduler or model fitting.
const directory = resolve(import.meta.dir, '../../docs/evidencias/ridge-runtime-review', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(directory, { recursive: true });
const result: Record<string, unknown> = { executedAt: new Date().toISOString(), mode: 'read-only DB and direct runtime service calls; no HTTP/session test; no sync/training/scoring', models: {}, availability: null, currentRuntime: [], historicalSmoke: [] };
const safe = (failure: unknown) => { const e = failure as { code?: unknown; status?: unknown }; return { status: typeof e?.status === 'number' ? e.status : null, code: typeof e?.code === 'string' ? e.code : 'AUDIT_FAILED' } };
try {
  result.models = {
    supply: Array.from({ length: 7 }, (_, i) => { const m = loadDirectSupplyModel(i + 1); return { id: m.modelId, alpha: m.hyperparameters.alpha, features: m.orderedFeatures.length, metrics: getForecastMetrics(i + 1) } }),
    demand: Array.from({ length: 6 }, (_, i) => { const m = loadDirectDemandV5Model(i + 1); return { id: m.modelId, alpha: m.selectedAlpha, features: m.orderedFeatures.length, metrics: getDemandV5Metrics(i + 1) } }),
    price: { active: 'B1', ridgeRuntime: false },
  };
  const availability = await xmDailySyncService.availability(); result.availability = availability;
  const calls: unknown[] = [];
  for (const a of availability) {
    const dates = a.eligibleFutureTargetDates;
    if (dates.length === 0) { calls.push({ series: a.series, status: 'not_available', reason: a.availabilityReason }); continue }
    const targetDate = dates[0]!;
    try {
      const response = a.series === 'Gene' ? await forecastSupply({ targetDate }) : a.series === 'DemaSIN' ? await forecastDemandV5({ targetDate }) : await forecastPrice({ targetDate, preparedDatasetId: a.eligiblePreparedDatasetIds![0] });
      calls.push({ series: a.series, status: 'passed', response });
    } catch (e) { calls.push({ series: a.series, outcome: 'failed', ...safe(e) }) }
  }
  result.currentRuntime = calls;
  // If no future window exists, a historical call can distinguish stale sources from a broken service.
  const historical: unknown[] = [];
  const supply = availability.find(a => a.series === 'Gene');
  if (supply?.latestObservationDate && !supply.hasFutureForecastWindow) {
    const targetDate = new Date(Date.parse(supply.latestObservationDate) + 86400000).toISOString().slice(0, 10);
    try { historical.push({ series: 'Gene', status: 'passed', historicalOnly: true, response: await forecastSupply({ targetDate }) }) }
    catch (e) { historical.push({ series: 'Gene', state: 'failed', ...safe(e) }) }
  }
  const prepared = await prisma.preparedDataset.findMany({ where: priceCompatibility, select: { id: true, content: true } });
  const candidates: { id: number; date: string }[] = [];
  for (const p of prepared) {
    const content = p.content as { records?: { fecha_xm?: unknown }[] } | null;
    if (Array.isArray(content?.records)) for (const r of content.records) if (typeof r.fecha_xm === 'string') candidates.push({ id: p.id, date: r.fecha_xm });
  }
  candidates.sort((a, b) => b.date.localeCompare(a.date));
  const latest = candidates[0];
  if (latest) {
    const targetDate = new Date(Date.parse(latest.date) + 86400000).toISOString().slice(0, 10);
    try { historical.push({ series: 'PrecBolsNaci', status: 'passed', historicalOnly: true, response: await forecastPrice({ targetDate, preparedDatasetId: latest.id }) }) }
    catch (e) { historical.push({ series: 'PrecBolsNaci', state: 'failed', ...safe(e) }) }
  }
  result.historicalSmoke = historical;
  const demandReplay = createDemandV5ForecastService(criteria => prisma.preparedDataset.findMany({ where: criteria,
    select: { id: true, sourceDatasetId: true, profileId: true, profileVersion: true, sourceRulesetId: true, sourceRulesetVersion: true, content: true } }), undefined, undefined, () => new Date('2026-10-06T17:00:00Z'));
  // The clock is substituted solely for historical diagnostics. It is never changed in the application.
  try { historical.push({ series: 'DemaSIN', status: 'passed', historicalOnly: true, clock: '2026-10-06T17:00:00Z', response: await demandReplay({ targetDate: '2026-10-07' }) }) }
  catch (e) { historical.push({ series: 'DemaSIN', state: 'failed', ...safe(e) }) }
  const tomorrow = new Date(Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) + 86400000).toISOString().slice(0, 10);
  const rejections: unknown[] = [];
  for (const [series, call] of [
    ['Gene', () => forecastSupply({ targetDate: tomorrow })],
    ['DemaSIN', () => forecastDemandV5({ targetDate: tomorrow })],
    ['PrecBolsNaci', () => forecastPrice({ targetDate: tomorrow, preparedDatasetId: latest?.id })],
  ] as const) {
    try { await call(); rejections.push({ series, outcome: 'unexpected_available' }) }
    catch (e) { rejections.push({ series, targetDate: tomorrow, outcome: 'rejected', ...safe(e) }) }
  }
  result.futureRequests = rejections;
} catch (e) { result.auditError = safe(e) }
finally { await prisma.$disconnect() }
await writeFile(resolve(directory, 'audit.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ directory, auditError: result.auditError ?? null, availability: result.availability, currentRuntime: (result.currentRuntime as any[]).map(v => ({ series: v.series, status: v.status, reason: v.reason })), historicalSmoke: (result.historicalSmoke as any[]).map(v => ({ series: v.series, status: v.status ?? v.state, code: v.code })) }));

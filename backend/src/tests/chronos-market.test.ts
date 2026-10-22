import { expect, test } from 'bun:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createMarketSeriesAdapter, normalizeMarketSeries, marketSeries, type MarketSeries } from '@/integrations/chronos-market-series';
import { createChronosHourlyService } from '@/services/chronos-hourly.service';
import { createChronosHourlyRouter } from '@/controllers/chronos-hourly.controller';
import metadata from '@/models/chronos-hourly/metadata.json';

const offset = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
function raw(kind: MarketSeries, start: string, days: number) {
  return { Metric: { Id: marketSeries[kind].metric }, Items: Array.from({ length: days }, (_, i) => ({ Date: offset(start, i), HourlyEntities: [{ Id: 'Sistema', Values: { code: 'Sistema', ...Object.fromEntries(Array.from({ length: 24 }, (_, j) => [`Hour${String(j + 1).padStart(2, '0')}`, kind === 'price' ? 100 + i + j / 10 : 8000000 + i * 100 + j])) } }] })) };
}
function transport(kind: MarketSeries) {
  return async (url: string, init: RequestInit) => {
    const q = JSON.parse(String(init.body));
    return Response.json(url.endsWith('/Lists') ? { Items: [{ ListEntities: [{ Values: { MetricId: marketSeries[kind].metric, Entity: 'Sistema', MetricUnits: marketSeries[kind].unit, Type: 'HourlyEntities', Url: 'https://servapibi.xm.com.co/hourly', MaxDays: 30 } }] }] } : raw(kind, q.StartDate, (Date.parse(q.EndDate) - Date.parse(q.StartDate)) / 86400000 + 1));
  };
}
for (const kind of ['supply', 'price'] as const) {
  test(`CHM-${kind}-01: strict source, complete calendar, values and period validation`, () => {
    const body = raw(kind, '2026-10-01', 2), range = { startDate: '2026-10-01', endDate: '2026-10-02' };
    expect(normalizeMarketSeries(kind, JSON.stringify(body), range).records).toHaveLength(48);
    expect(() => normalizeMarketSeries(kind === 'supply' ? 'price' : 'supply', JSON.stringify(body), range)).toThrow();
    expect(() => normalizeMarketSeries(kind, JSON.stringify({ ...body, Items: body.Items.slice(1) }), range)).toThrow();
    (body.Items[0]!.HourlyEntities[0]!.Values as Record<string, string | number>).Hour25 = 123;
    expect(() => normalizeMarketSeries(kind, JSON.stringify(body), range)).toThrow();
  });
  test(`CHM-${kind}-02: both authenticated routes retain variable units, context and durable trace`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'chronos-market-'));
    const adapter = createMarketSeriesAdapter(kind, transport(kind));
    const service = createChronosHourlyService({ ...adapter, now: () => new Date('2026-10-21T08:00:00Z'), root: () => root,
      config: async () => ({ python: '/server/python', checkpoint: '/server/checkpoint' }),
      worker: async input => {
        expect(input.context).toHaveLength(672);
        expect(input.context[0]).toBe(kind === 'price' ? 100 : 8000000);
        return { model: input.model, revision: metadata[input.model].revision, quantiles: Array.from({ length: input.predictionPeriods }, () => [10, 20, 30]) };
      },
    }, kind);
    const app = express(); app.use(`/forecasts/hourly-${kind}`, createChronosHourlyRouter(service, (req, res, next) => { if (req.get('X-Test-Auth') !== 'yes') { res.sendStatus(401); return } next() }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw Error('listener');
    const url = `http://127.0.0.1:${address.port}/forecasts/hourly-${kind}`;
    try {
      expect((await fetch(`${url}/models`)).status).toBe(401);
      expect((await service.models()).models.every(m => m.historicalMetrics === null && m.validation === 'pending_series_evaluation')).toBe(true);
      for (const model of ['chronos2', 'bolt']) {
        const response = await fetch(url, { method: 'POST', headers: { 'X-Test-Auth': 'yes', 'Content-Type': 'application/json' }, body: JSON.stringify({ model, targetDate: '2026-10-22' }) });
        const result = await response.json() as any;
        expect(response.status).toBe(200);
        expect(result).toMatchObject({ series: kind, source: `XM ${marketSeries[kind].metric}/Sistema`, unit: marketSeries[kind].unit, target: marketSeries[kind].target, historicalMetrics: null, horizonDays: 2, bridgePeriods: 24 });
        expect(result.predictions).toHaveLength(24);
        const directory = join(root, result.trace.executionId);
        expect(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))).toMatchObject({ series: kind, unit: marketSeries[kind].unit });
        expect(JSON.parse(await readFile(join(directory, 'inputs/manifest.json'), 'utf8'))).toMatchObject({ metric: marketSeries[kind].metric, recordCount: 672 });
      }
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }) }
  });
}
test('CHM-03: incompatible catalog cannot feed either model', async () => {
  const adapter = createMarketSeriesAdapter('price', async () => Response.json({ Items: [] }));
  await expect(adapter.acquire({ startDate: '2026-10-01', endDate: '2026-10-28' })).rejects.toBeDefined();
});
test('CHM-04: negative prices preserved; negative generation rejected', () => {
  for (const kind of ['supply', 'price'] as const) {
    const data = raw(kind, '2026-10-01', 1); (data.Items[0]!.HourlyEntities[0]!.Values as Record<string, string | number>).Hour01 = -1;
    const run = () => normalizeMarketSeries(kind, JSON.stringify(data), { startDate: '2026-10-01', endDate: '2026-10-01' });
    if (kind === 'price') expect(run().records[0]!.value).toBe(-1); else expect(run).toThrow();
  }
});

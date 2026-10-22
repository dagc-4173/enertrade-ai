import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createChronosHourlyService } from '@/services/chronos-hourly.service';
import { createChronosHourlyRouter } from '@/controllers/chronos-hourly.controller';
import metadata from '@/models/chronos-hourly/metadata.json';

function fixture(root: string, options: Record<string, unknown> = {}) {
  const calls = { acquire: 0, worker: 0 };
  const service = createChronosHourlyService({ now: () => new Date('2026-10-21T06:00:00Z'), root: () => root,
    config: async () => ({ python: '/server/python', checkpoint: '/server/model' }),
    discover: async () => ({ latestCompleteDay: '2026-10-17', rawBody: '{}', retrievedAt: '2026-10-21T06:00:00Z', requestedRange: { startDate: '2026-10-14', endDate: '2026-10-20' }, incompleteDates: [] }),
    acquire: async range => { calls.acquire++; expect(range).toEqual({ startDate: '2026-09-20', endDate: '2026-10-17' }); return { context: Array(672).fill(8000000), rawSha256: 'raw', normalizedSha256: 'normalized', save: async () => {} } },
    worker: async input => { calls.worker++; expect(input.context).toHaveLength(672); return { model: input.model, revision: metadata[input.model].revision, quantiles: Array.from({ length: input.predictionPeriods }, () => [7000000, 8000000, 9000000]) } },
    ...options,
  });
  return { service, calls };
}
async function temporary(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'chronos-http-test-'));
  try { await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}
test('CHR-01: both models produce 24 outputs with full lag and durable manifest', () => temporary(async root => {
  const { service } = fixture(root);
  for (const model of ['chronos2', 'bolt']) {
    const result = await service.forecast({ model, targetDate: '2026-10-22' });
    expect(result).toMatchObject({ model, horizonDays: 5, generatedPeriods: 120, bridgePeriods: 96, experimental: true, confidenceStatus: 'not_prospectively_calibrated' });
    expect(result.predictions).toHaveLength(24); expect(result.predictions.at(-1)?.periodo).toBe(24);
    expect(await Bun.file(join(root, result.trace.executionId, 'manifest.json')).json()).toMatchObject({ status: 'completed', targetDate: '2026-10-22' });
    if (model === 'bolt') expect(result.warnings.some(w => w.includes('64 periodos'))).toBe(true);
  }
}));
test('CHR-02: arbitrary fields/model/path and past dates rejected before acquisition', () => temporary(async root => {
  const { service, calls } = fixture(root);
  for (const input of [{ model: 'bad', targetDate: '2026-10-22' }, { model: 'bolt', targetDate: '2026-10-22', checkpoint: '/tmp/user' }, { model: 'bolt', targetDate: '2026-10-21' }, { model: 'bolt', targetDate: '2026-02-30' }]) await expect(service.forecast(input)).rejects.toBeDefined();
  expect(calls).toEqual({ acquire: 0, worker: 0 });
}));
test('CHR-03: stale data and unavailable configuration have controlled errors', () => temporary(async root => {
  const { service, calls } = fixture(root);
  await expect(service.forecast({ model: 'chronos2', targetDate: '2026-10-25' })).rejects.toMatchObject({ code: 'CHRONOS_DATA_TOO_OLD' });
  expect(calls.worker).toBe(0);
  const unavailable = fixture(root, { config: async () => { throw Error('private secret') } }).service;
  expect((await unavailable.models()).models.every(m => !m.configured)).toBe(true);
}));
test('CHR-04: invalid quantiles cannot be reported as available', () => temporary(async root => {
  const { service } = fixture(root, { worker: async () => ({ model: 'chronos2', revision: metadata.chronos2.revision, quantiles: Array.from({ length: 120 }, () => [9, 8, 7]) }) });
  await expect(service.forecast({ model: 'chronos2', targetDate: '2026-10-22' })).rejects.toMatchObject({ code: 'CHRONOS_RESPONSE_INVALID' });
}));
test('CHR-05: concurrent requests blocked; lock released after completion', () => temporary(async root => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve });
  let entered!: () => void; const entry = new Promise<void>(resolve => { entered = resolve });
  const { service } = fixture(root, { worker: async (input: any) => { entered(); await held; return { model: input.model, revision: metadata[input.model as 'bolt'].revision, quantiles: Array.from({ length: 120 }, () => [1, 2, 3]) } } });
  const first = service.forecast({ model: 'bolt', targetDate: '2026-10-22' }); await entry;
  await expect(service.forecast({ model: 'bolt', targetDate: '2026-10-22' })).rejects.toMatchObject({ code: 'CHRONOS_BUSY' });
  release(); await first; await service.forecast({ model: 'bolt', targetDate: '2026-10-22' });
}));
test('CHR-06: HTTP routing, authentication gate, JSON and input contracts', () => temporary(async root => {
  const { service } = fixture(root);
  const app = express(); app.use('/forecasts/hourly-demand', createChronosHourlyRouter(service, (req, res, next) => { if (req.get('X-Test-Auth') !== 'yes') { res.sendStatus(401); return } next() }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('listener');
  const url = `http://127.0.0.1:${address.port}/forecasts/hourly-demand`;
  try {
    expect((await fetch(`${url}/models`)).status).toBe(401);
    const headers = { 'X-Test-Auth': 'yes', 'Content-Type': 'application/json' };
    expect(((await (await fetch(`${url}/models`, { headers })).json()) as { models: unknown[] }).models).toHaveLength(2);
    const good = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ model: 'bolt', targetDate: '2026-10-22' }) });
    expect(good.status).toBe(200); expect(((await good.json()) as { predictions: unknown[] }).predictions).toHaveLength(24);
    expect((await fetch(url, { method: 'POST', headers, body: '{' })).status).toBe(400);
    expect((await fetch(url, { method: 'POST', headers: { 'X-Test-Auth': 'yes', 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}));

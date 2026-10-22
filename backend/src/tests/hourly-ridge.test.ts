import { expect, test } from 'bun:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import express from 'express';
import { hourlyRidgeFeatures } from '@/services/hourly-ridge-features';
import { loadHourlyRidge, validateHourlyRidge } from '@/models/hourly-ridge/model-loader';
import { createHourlyRidgeService } from '@/services/hourly-ridge.service';
import { createHourlyRidgeRouter } from '@/controllers/hourly-ridge.controller';
import { samples } from '@/experiments/hu08-price-multihorizon';

test('RHR-01: demand runtime equals frozen Python features/predictions for every direct horizon', async () => {
  const fixture = JSON.parse(await readFile(resolve(import.meta.dir, '../../../docs/evidencias/ridge-hourly-demand-price/demand-training/parity.json'), 'utf8'));
  for (const e of fixture.expected) {
    const m = loadHourlyRidge('demand', e.horizonDays);
    for (let p = 1; p <= 24; p++) {
      const x = hourlyRidgeFeatures('demand', fixture.context, e.targetDate, p);
      x.forEach((v, j) => expect(Math.abs(v - e.features[p - 1][j])).toBeLessThan(1e-7));
      const prediction = m.intercept + x.reduce((sum, v, j) => sum + m.coefficients[j]! * ((v - m.means[j]!) / m.scales[j]!), 0);
      expect(Math.abs(prediction - e.predictions[p - 1])).toBeLessThan(1e-6);
    }
  }
});
test('RHR-02: price features match original V1 experiment exactly, without target observations', () => {
  const records = Array.from({ length: 35 * 24 }, (_, i) => ({ fecha_xm: new Date(Date.parse('2025-01-01') + Math.floor(i / 24) * 86400000).toISOString().slice(0, 10), periodo: i % 24 + 1, precio_cop_kwh: Math.sin(i / 13) * 20 + i / 10 }));
  const context = records.slice(0, 672).map(r => r.precio_cop_kwh);
  for (const h of [4, 5, 6]) {
    const target = new Date(Date.parse('2025-01-28') + h * 86400000).toISOString().slice(0, 10);
    for (const sample of samples(records, { start: target, end: target }, h)) {
      const x = hourlyRidgeFeatures('price', context, target, sample.period);
      x.forEach((v, i) => expect(v).toBeCloseTo(sample.features[i]!, 10));
    }
    expect(loadHourlyRidge('price', h).metrics.evaluationType).toBe('external_temporal_holdout');
  }
});
test('RHR-03: model tampering, unsupported horizons and corrupt context fail closed', async () => {
  const raw = await readFile(resolve(import.meta.dir, '../models/xm-demareal-ridge-direct-v1/1.0.0/h1.json'), 'utf8');
  expect(() => validateHourlyRidge('demand', 1, raw + ' ')).toThrow();
  expect(() => loadHourlyRidge('price', 1)).toThrow();
  expect(() => loadHourlyRidge('demand', 8)).toThrow();
  expect(() => hourlyRidgeFeatures('price', Array(671).fill(1), '2026-10-22', 1)).toThrow();
});
for (const series of ['demand', 'price'] as const) {
  test(`RHR-${series}-04: actual frozen inference, future limits, evidence and authentication`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'ridge-hourly-'));
    const service = createHourlyRidgeService(series, { root: () => root, now: () => new Date('2026-10-21T08:00:00Z'),
      discover: async () => ({ latestCompleteDay: '2026-10-17', rawBody: '{}', retrievedAt: '2026-10-21T08:00:00Z', requestedRange: { startDate: '2026-10-14', endDate: '2026-10-20' }, incompleteDates: [] }),
      acquire: async r => { expect(r).toEqual({ startDate: '2026-09-20', endDate: '2026-10-17' }); return { context: Array.from({ length: 672 }, (_, i) => (series === 'price' ? 200 : 8000000) + i), rawSha256: 'fixture', normalizedSha256: 'fixture', save: async () => {} } },
    });
    const app = express(); app.use('/forecasts/hourly-ridge', createHourlyRidgeRouter((req, res, next) => { if (req.get('X-Test-Auth') !== 'yes') { res.sendStatus(401); return } next() }, { demand: service, price: service }));
    const listener = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => listener.listening ? resolve() : listener.once('listening', resolve));
    const port = (listener.address() as { port: number }).port, url = `http://127.0.0.1:${port}/forecasts/hourly-ridge/${series}`;
    try {
      expect((await fetch(`${url}/availability`)).status).toBe(401);
      const availability = await service.availability();
      expect(availability.eligibleTargetDates).toEqual(series === 'price' ? ['2026-10-22', '2026-10-23'] : ['2026-10-22', '2026-10-23', '2026-10-24']);
      const r = await fetch(url, { method: 'POST', headers: { 'X-Test-Auth': 'yes', 'Content-Type': 'application/json' }, body: JSON.stringify({ targetDate: '2026-10-22' }) });
      const result = await r.json() as any;
      expect(r.status).toBe(200); expect(result.predictions).toHaveLength(24); expect(result.referenceDay.values).toHaveLength(24);
      expect(result.horizonDays).toBe(5); expect(result.unit).toBe(series === 'price' ? 'COP/kWh' : 'kWh');
      expect(result.historicalMetrics.horizonDays).toBe(5);
      expect(JSON.parse(await readFile(join(root, result.trace.executionId, 'manifest.json'), 'utf8')).modelId).toBe(result.modelId);
      await expect(service.forecast({ targetDate: '2026-10-21' })).rejects.toMatchObject({ code: 'RIDGE_DATE_UNSUPPORTED' });
      await expect(service.forecast({ targetDate: '2026-10-22', model: 'user-supplied' })).rejects.toMatchObject({ code: 'INVALID_RIDGE_REQUEST' });
      await expect(service.forecast({ targetDate: '2026-10-25' })).rejects.toMatchObject({ code: 'RIDGE_HORIZON_UNAVAILABLE' });
    } finally { await new Promise<void>(resolve => listener.close(() => resolve())); await rm(root, { recursive: true, force: true }) }
  });
}

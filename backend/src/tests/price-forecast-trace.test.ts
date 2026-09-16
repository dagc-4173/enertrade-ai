import { test, expect, mock } from 'bun:test';
import express from 'express';
import { Prisma } from '@/generated/prisma/client';
import artifact from '@/models/xm-preciobolsnaci-b1/1.0.0/rule.json';
import { createPriceForecastService } from '@/services/price-forecast.service';
import { createPriceForecastTraceService, safePriceRequest } from '@/services/price-forecast-trace.service';
import { createForecastRouter } from '@/controllers/forecast.controller';
import { ForecastError } from '@/services/forecast.contract';

const request = { preparedDatasetId: 49, targetDate: '2024-09-29' };
function fixture() {
  return { id: 49, sourceDatasetId: 68, profileId: artifact.sourceProfileId, profileVersion: '1.0.0',
    sourceRulesetId: artifact.sourceRulesetId, sourceRulesetVersion: '1.0.0', content: {
      variables: { minimum: [
        { name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' },
        { name: 'periodo', type: 'number', representation: 'integer 1..24' },
        { name: 'precio_cop_kwh', type: 'number', unit: 'COP/kWh' },
      ] }, records: Array.from({ length: 24 }, (_, i) => ({ sourceRecordIndex: 240 + i,
        fecha_xm: '2024-09-28', periodo: i + 1, precio_cop_kwh: i === 0 ? 0 : i === 1 ? -0.125 : 900 + i / 1000 })),
    } };
}
type Options = { startFails?: boolean; finishFails?: boolean; missing?: boolean; profile?: boolean; incomplete?: boolean; badRule?: boolean; unexpected?: boolean };
async function harness(options: Options = {}) {
  const events: string[] = [], rows = new Map<string, any>();
  const create = mock(async ({ data }: { data: any }) => {
    events.push('pending');
    if (options.startFails) throw Error('PRIVATE_PRISMA credentials stack');
    rows.set(data.id, { ...data }); return data;
  });
  const update = mock(async ({ where, data }: { where: { id: string }; data: any }) => {
    events.push(data.status);
    if (options.finishFails) throw Error('PRIVATE_PRISMA credentials stack');
    Object.assign(rows.get(where.id), data); return rows.get(where.id);
  });
  const trace = createPriceForecastTraceService({ create, update });
  const p = fixture();
  if (options.profile) p.profileId = 'incompatible';
  if (options.incomplete) p.content.records.pop();
  const read = mock(async () => {
    events.push('read');
    if (options.unexpected) throw Error('PRIVATE_PRISMA credentials stack');
    return options.missing ? null : p;
  });
  const engine = createPriceForecastService(read, options.badRule ? () => { throw new ForecastError(409, 'FORECAST_RULE_INCOMPATIBLE'); } : undefined);
  const price = mock(engine);
  const app = express();
  app.use('/forecasts', createForecastRouter(undefined, undefined, undefined, undefined, price, trace));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.listening ? r() : server.once('listening', r));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('listener');
  const post = async (body: unknown = request, raw = false, contentType = 'application/json', path = '/price') => {
    const res = await fetch(`http://127.0.0.1:${address.port}/forecasts${path}`, {
      method: 'POST', headers: { 'Content-Type': contentType, Authorization: 'secret-token', Cookie: 'secret-cookie' },
      body: raw ? String(body) : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as any };
  };
  return { post, rows, create, update, price, read, events, trace, base: `http://127.0.0.1:${address.port}/forecasts`,
    close: () => new Promise<void>(r => server.close(() => r())) };
}

test('HU09 pending -> one B1 inference -> atomic complete, exact input/output and partial scope', async () => {
  const h = await harness();
  try {
    const response = await h.post(); expect(response.status).toBe(200);
    expect(h.events).toEqual(['pending', 'read', 'succeeded']); expect(h.price).toHaveBeenCalledTimes(1);
    expect(h.read).toHaveBeenCalledTimes(1); expect(h.update).toHaveBeenCalledTimes(1);
    const { trace, ...technical } = response.body;
    expect(trace).toEqual({ executionId: expect.any(String), persistence: 'persisted', conditionsCompleteness: 'partial' });
    expect(trace.executionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const row = h.rows.get(trace.executionId);
    expect(row.requestPayload).toEqual(request); expect(row.preparedDatasetId).toBe(49);
    expect(row.ruleId).toBe(artifact.ruleId); expect(row.ruleVersion).toBe(artifact.ruleVersion); expect(row.ruleType).toBe(artifact.type);
    expect(row.status).toBe('succeeded'); expect(row.httpStatus).toBe(200); expect(row.completedAt).toBeInstanceOf(Date);
    expect(row.targetDate.toISOString().slice(0, 10)).toBe(request.targetDate);
    expect(row.inputSnapshot).toEqual({ sourceDatasetId: 68, preparedDatasetId: 49, referenceDate: '2024-09-28',
      values: fixture().content.records.map(({ fecha_xm, ...value }) => value) });
    expect(row.resultPayload).toEqual(technical);
    expect(technical).toEqual(await createPriceForecastService(async () => fixture())(request));
    expect(row.conditionsCompleteness).toBe('partial'); expect(row.partialReasons).toEqual(artifact.factors.omitted);
    expect(JSON.stringify(row)).not.toMatch(/secret|Authorization|Cookie|stack/);
  } finally { await h.close(); }
});

test('identical concurrent requests have independent UUIDs and contexts', async () => {
  const h = await harness();
  try {
    const [a, b] = await Promise.all([h.post(), h.post()]);
    expect(a.body.trace.executionId).not.toBe(b.body.trace.executionId); expect(h.rows.size).toBe(2);
    const { trace: ta, ...va } = a.body, { trace: tb, ...vb } = b.body; expect(va).toEqual(vb);
  } finally { await h.close(); }
});

const errors: { name: string; options?: Options; body?: unknown; raw?: boolean; type?: string; status: number; code: string; noRead?: boolean; path?: string }[] = [
  { name: 'missing prepared', options: { missing: true }, status: 404, code: 'PREPARED_DATASET_NOT_FOUND' },
  { name: 'invalid date', body: { ...request, targetDate: '2024-02-30' }, status: 422, code: 'INVALID_FORECAST_DATE', noRead: true },
  { name: 'incomplete D-1', options: { incomplete: true }, status: 422, code: 'FORECAST_DATA_INSUFFICIENT' },
  { name: 'profile', options: { profile: true }, status: 422, code: 'FORECAST_PROFILE_NOT_APPLICABLE' },
  { name: 'rule', options: { badRule: true }, status: 409, code: 'FORECAST_RULE_INCOMPATIBLE', noRead: true },
  { name: 'extra secret field', body: { ...request, extra: 'PRIVATE_SECRET' }, status: 400, code: 'INVALID_FORECAST_REQUEST', noRead: true },
  { name: 'malformed', body: '{"secret":"PRIVATE_SECRET",', raw: true, status: 400, code: 'INVALID_FORECAST_REQUEST', noRead: true },
  { name: 'content type', type: 'text/plain', status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', noRead: true },
  { name: 'oversized', body: { extra: 'PRIVATE_SECRET'.repeat(2000) }, status: 413, code: 'FORECAST_REQUEST_TOO_LARGE', noRead: true },
  { name: 'unexpected', options: { unexpected: true }, status: 500, code: 'FORECAST_FAILED' },
  { name: 'query', path: '/price?secret=PRIVATE_SECRET', status: 400, code: 'INVALID_FORECAST_REQUEST', noRead: true },
];
test.each(errors)('safe persisted error: $name', async c => {
  const h = await harness(c.options);
  try {
    const response = await h.post(c.body ?? request, c.raw, c.type, c.path);
    expect(response.status).toBe(c.status); expect(response.body.error).toBe(c.code);
    expect(response.body.trace.persistence).toBe('persisted');
    const row = h.rows.get(response.body.trace.executionId);
    expect(row.status).toBe('failed'); expect(row.httpStatus).toBe(c.status); expect(row.errorCode).toBe(c.code);
    expect(row.resultPayload).toBe(Prisma.DbNull); expect(row.completedAt).toBeInstanceOf(Date);
    expect(JSON.stringify([row, response.body])).not.toMatch(/PRIVATE|secret-token|secret-cookie|stack/);
    if (c.noRead) expect(h.read).not.toHaveBeenCalled();
    if (c.name === 'missing prepared') { expect(row.preparedDatasetId).toBeNull(); expect(row.requestPayload).toEqual(request); }
    if (c.name === 'invalid date') expect(row.targetDate).toBeNull();
    if (c.name === 'malformed' || c.name === 'oversized' || c.name === 'content type') expect(row.requestPayload).toEqual({});
    if (c.name === 'incomplete D-1') expect(response.body.status).toBe('unavailable');
  } finally { await h.close(); }
});

test.each([{ startFails: true }, { finishFails: true }])('persistence failure never hides success: %j', async options => {
  const h = await harness(options);
  try {
    const response = await h.post(); expect(response.status).toBe(200);
    const { trace, ...technical } = response.body;
    expect(technical).toEqual(await createPriceForecastService(async () => fixture())(request));
    expect(trace.persistence).toBe('failed'); expect(h.price).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|stack/);
    if (options.startFails) { expect(trace.executionId).toBeNull(); expect(h.update).not.toHaveBeenCalled(); }
    else { expect(trace.executionId).toEqual(expect.any(String)); expect(h.rows.get(trace.executionId).status).toBe('pending'); }
  } finally { await h.close(); }
});

test.each([{ startFails: true }, { finishFails: true }])('trace failure preserves original inference error: %j', async options => {
  const h = await harness({ ...options, missing: true });
  try {
    const response = await h.post(); expect(response.status).toBe(404);
    expect(response.body.error).toBe('PREPARED_DATASET_NOT_FOUND'); expect(response.body.trace.persistence).toBe('failed');
    expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|stack/);
  } finally { await h.close(); }
});

test('allowlist rejects nested, oversized and sensitive invalid field values', () => {
  expect(safePriceRequest({ preparedDatasetId: { token: 'private' }, targetDate: 'private'.repeat(10000), headers: { Authorization: 'private' } })).toEqual({});
  expect(safePriceRequest({ ...request, extra: 'private' })).toEqual(request);
  expect(safePriceRequest(null)).toEqual({});
});

test('supply/demand parser errors and all metrics never start price tracing', async () => {
  const h = await harness();
  try {
    for (const path of ['/supply', '/demand']) expect((await h.post({}, false, 'text/plain', path)).status).toBe(415);
    for (const path of ['/supply/metrics', '/demand/metrics']) {
      const res = await fetch(h.base + path); expect(res.status).toBe(200);
    }
    expect(h.create).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  } finally { await h.close(); }
});

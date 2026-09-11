import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import express from 'express';
import { createExternalDataRouter } from '@/controllers/external-data.controller';
import { ExternalDataService } from '@/integrations/external-data.service';
import { XmProvider, type ExternalFetch } from '@/integrations/providers/xm.provider';

// Fixtures sintéticos con la estructura comprobada en XM; solo el transporte externo se sustituye.
const hourly = (id = 'Gene') => ({
  Metric: { Id: id }, Items: [{ Date: '2024-04-01', HourlyEntities: [{ Id: 'Sistema', Values: {
    code: 'Sistema', ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`Hour${String(i + 1).padStart(2, '0')}`, `${i + 1}.25000`])),
  } }] }],
});
const daily = () => ({ Metric: { Id: 'DemaSIN' }, Items: [{ Date: '2024-04-01', DailyEntities: [{ Id: 'Sistema', Value: '225816448.51000' }] }] });
const outbound = mock<ExternalFetch>(async () => Response.json(hourly()));
const service = new ExternalDataService([new XmProvider(outbound, 'https://servapibi.xm.com.co', 30)]);
const app = express();
app.use('/external-data', createExternalDataRouter(service));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Servidor de prueba no disponible.');
const url = `http://127.0.0.1:${address.port}/external-data`;
const valid = { provider: 'xm', dataset: 'Gene', startDate: '2024-04-01', endDate: '2024-04-01' };
async function post(input: unknown, contentType = 'application/json', raw = false) {
  const response = await fetch(`${url}/query`, { method: 'POST', headers: { 'Content-Type': contentType }, body: raw ? String(input) : JSON.stringify(input) });
  return { status: response.status, body: await response.json() as any };
}
beforeEach(() => { outbound.mockReset(); outbound.mockImplementation(async () => Response.json(hourly())); });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

describe('Integración externa XM: HTTP local, transporte externo sustituido', () => {
  test('EXT-01: catálogo controlado, sin consulta externa', async () => {
    const response = await fetch(`${url}/providers`);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0].id).toBe('xm');
    expect(body.providers[0].datasets.map((item: any) => item.id)).toEqual(['Gene', 'DemaSIN', 'PrecBolsNaci']);
    expect(body.providers[0].datasets.every((item: any) => item.maxInclusiveDays === 30 && !item.supportsFilters)).toBe(true);
    expect(outbound).not.toHaveBeenCalled();
  });

  test.each([
    ['provider desconocido', { ...valid, provider: 'ideam' }, 'UNSUPPORTED_PROVIDER'],
    ['provider ausente', { ...valid, provider: null }, 'UNSUPPORTED_PROVIDER'],
    ['dataset desconocido', { ...valid, dataset: 'DemaReal' }, 'UNSUPPORTED_EXTERNAL_DATASET'],
    ['dataset no string', { ...valid, dataset: [] }, 'UNSUPPORTED_EXTERNAL_DATASET'],
    ['fecha imposible', { ...valid, startDate: '2024-02-30' }, 'INVALID_EXTERNAL_DATES'],
    ['año no bisiesto', { ...valid, startDate: '2023-02-29' }, 'INVALID_EXTERNAL_DATES'],
    ['fecha sin padding', { ...valid, startDate: '2024-4-01' }, 'INVALID_EXTERNAL_DATES'],
    ['timestamp', { ...valid, endDate: '2024-04-01T00:00:00Z' }, 'INVALID_EXTERNAL_DATES'],
    ['fecha ausente', { ...valid, endDate: null }, 'INVALID_EXTERNAL_DATES'],
    ['rango invertido', { ...valid, endDate: '2024-03-31' }, 'INVALID_EXTERNAL_DATE_RANGE'],
    ['31 días inclusivos', { ...valid, endDate: '2024-05-01' }, 'INVALID_EXTERNAL_DATE_RANGE'],
    ['filtro no aplicable', { ...valid, filters: { resource: 'x' } }, 'UNSUPPORTED_EXTERNAL_FILTERS'],
    ['filtro array', { ...valid, filters: [] }, 'UNSUPPORTED_EXTERNAL_FILTERS'],
    ['URL arbitraria', { ...valid, url: 'http://localhost' }, 'INVALID_EXTERNAL_QUERY'],
    ['cuerpo array', [], 'INVALID_EXTERNAL_QUERY'],
  ])('EXT-02: rechaza %s antes de llamar a XM', async (_name, input, code) => {
    const result = await post(input);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe(code);
    expect(Object.keys(result.body).sort()).toEqual(['error', 'message']);
    expect(outbound).not.toHaveBeenCalled();
  });

  test('EXT-03: normalización horaria y contrato exacto saliente', async () => {
    const result = await post({ ...valid, endDate: '2024-04-30', filters: {} });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ...valid, endDate: '2024-04-30', unit: 'kWh', granularity: 'hourly' });
    expect(result.body.records).toHaveLength(24);
    expect(result.body.records[0]).toEqual({ date: '2024-04-01', hour: 1, value: 1.25 });
    expect(result.body.records[23]).toEqual({ date: '2024-04-01', hour: 24, value: 24.25 });
    expect(result.body).not.toHaveProperty('Items');
    expect(result.body).not.toHaveProperty('Metric');
    const [target, init] = outbound.mock.calls[0]!;
    expect(target).toBe('https://servapibi.xm.com.co/hourly');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ MetricId: 'Gene', Entity: 'Sistema', StartDate: valid.startDate, EndDate: '2024-04-30', Filter: [] });
  });

  test('EXT-04: demanda SIN diaria y unidad', async () => {
    outbound.mockImplementation(async () => Response.json(daily()));
    const result = await post({ ...valid, dataset: 'DemaSIN' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ...valid, dataset: 'DemaSIN', unit: 'kWh', granularity: 'daily', records: [{ date: '2024-04-01', hour: null, value: 225816448.51 }] });
    expect(outbound.mock.calls[0]![0]).toBe('https://servapibi.xm.com.co/daily');
  });

  test('EXT-05: precio de bolsa conserva unidad y no agrega horas', async () => {
    outbound.mockImplementation(async () => Response.json(hourly('PrecBolsNaci')));
    const result = await post({ ...valid, dataset: 'PrecBolsNaci' });
    expect(result.status).toBe(200);
    expect(result.body.unit).toBe('COP/kWh');
    expect(result.body.records).toHaveLength(24);
  });

  test('EXT-06: año bisiesto válido y resultado vacío explícito', async () => {
    outbound.mockImplementation(async () => Response.json({ Metric: { Id: 'Gene' }, Items: [] }));
    const result = await post({ ...valid, startDate: '2024-02-29', endDate: '2024-02-29' });
    expect(result.status).toBe(200);
    expect(result.body.records).toEqual([]);
  });

  test.each([400, 401, 429, 500, 503])('EXT-07: HTTP XM %s -> envelope 502 seguro', async status => {
    outbound.mockImplementation(async () => new Response('credencial interna y stack privado', { status }));
    expect(await post(valid)).toEqual({ status: 502, body: { error: 'EXTERNAL_HTTP_ERROR', message: 'No fue posible consultar al proveedor.' } });
  });

  test('EXT-08: error de red -> 502 sin detalles internos', async () => {
    outbound.mockImplementation(async () => { throw new Error('secreto de transporte'); });
    expect(await post(valid)).toEqual({ status: 502, body: { error: 'EXTERNAL_NETWORK_ERROR', message: 'No fue posible establecer comunicación con el proveedor.' } });
  });

  test('EXT-09: timeout aborta realmente la llamada -> 504', async () => {
    let aborted = false;
    outbound.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('detalle privado')); }, { once: true });
    }));
    expect((await post(valid))).toEqual({ status: 504, body: { error: 'EXTERNAL_TIMEOUT', message: 'El proveedor no respondió dentro del tiempo permitido.' } });
    expect(aborted).toBe(true);
  });

  test.each([
    null, {}, { Metric: { Id: 'Gene' }, Items: {} },
    { ...hourly(), Metric: { Id: 'otra' } },
    { Metric: { Id: 'Gene' }, Items: [{ Date: '2024-04-01', HourlyEntities: [] }] },
    { Metric: { Id: 'Gene' }, Items: [{ ...hourly().Items[0], Date: '2024-04-02' }] },
    { Metric: { Id: 'Gene' }, Items: [...hourly().Items, ...hourly().Items] },
    { Metric: { Id: 'Gene' }, Items: [{ Date: '2024-04-01', HourlyEntities: [{ Id: 'Recurso', Values: {} }] }] },
  ])('EXT-10: respuesta estructuralmente malformada -> 502 (%j)', async payload => {
    outbound.mockImplementation(async () => Response.json(payload));
    expect((await post(valid)).body.error).toBe('EXTERNAL_RESPONSE_INVALID');
  });

  test.each([null, '', 'NaN', 'Infinity', true, {}, '1,25', '0x10'])('EXT-11: valor inválido %j no se transforma en cero', async value => {
    const payload = hourly();
    (payload.Items[0]!.HourlyEntities[0]!.Values as Record<string, unknown>).Hour01 = value;
    outbound.mockImplementation(async () => Response.json(payload));
    const result = await post(valid);
    expect(result.status).toBe(502);
    expect(result.body.error).toBe('EXTERNAL_RESPONSE_INVALID');
  });

  test('EXT-12: HTML de XM no se filtra', async () => {
    outbound.mockImplementation(async () => new Response('<html>stack privado</html>'));
    expect((await post(valid)).body).toEqual({ error: 'EXTERNAL_RESPONSE_INVALID', message: 'El proveedor devolvió una respuesta no válida.' });
  });

  test('EXT-13: parser local seguro: JSON inválido, media type y límite', async () => {
    expect((await post('{', 'application/json', true)).status).toBe(400);
    expect((await post(valid, 'text/plain')).status).toBe(415);
    expect((await post({ ...valid, extra: 'x'.repeat(17_000) })).status).toBe(413);
    expect(outbound).not.toHaveBeenCalled();
  });

  test('EXT-15: timeout también cubre la lectura del cuerpo', async () => {
    outbound.mockImplementation(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init.signal!.addEventListener('abort', () => controller.error(new Error('lectura interrumpida')), { once: true });
      },
    })));
    expect((await post(valid)).status).toBe(504);
  });

  test('EXT-16: hora faltante y demanda diaria malformada se rechazan', async () => {
    const payload = hourly();
    delete (payload.Items[0]!.HourlyEntities[0]!.Values as Record<string, unknown>).Hour24;
    outbound.mockImplementation(async () => Response.json(payload));
    expect((await post(valid)).status).toBe(502);
    outbound.mockImplementation(async () => Response.json({ Metric: { Id: 'DemaSIN' }, Items: [{ Date: '2024-04-01', DailyEntities: [{ Id: 'Sistema', Value: null }] }] }));
    expect((await post({ ...valid, dataset: 'DemaSIN' })).status).toBe(502);
  });

  test('EXT-17: orden cronológico, cero y negativos preservados', async () => {
    const payload = daily();
    payload.Items = [
      { Date: '2024-04-02', DailyEntities: [{ Id: 'Sistema', Value: '-1.5' }] },
      { Date: '2024-04-01', DailyEntities: [{ Id: 'Sistema', Value: '0' }] },
    ];
    outbound.mockImplementation(async () => Response.json(payload));
    const result = await post({ ...valid, dataset: 'DemaSIN', endDate: '2024-04-02' });
    expect(result.body.records).toEqual([{ date: '2024-04-01', hour: null, value: 0 }, { date: '2024-04-02', hour: null, value: -1.5 }]);
  });

  test('EXT-18: error interno inesperado tiene envelope seguro', async () => {
    const brokenApp = express();
    brokenApp.use('/external-data', createExternalDataRouter(new ExternalDataService([{
      id: 'xm', name: 'XM', listDatasets: () => new XmProvider().listDatasets(),
      query: async () => { throw new Error('stack y credenciales privadas'); },
    }])));
    const brokenServer = brokenApp.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => brokenServer.listening ? resolve() : brokenServer.once('listening', resolve));
    try {
      const address = brokenServer.address();
      if (!address || typeof address === 'string') throw new Error('Servidor no disponible');
      const response = await fetch(`http://127.0.0.1:${address.port}/external-data/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'EXTERNAL_QUERY_FAILED', message: 'No fue posible consultar los datos externos.' });
    } finally {
      await new Promise<void>((resolve, reject) => brokenServer.close(error => error ? reject(error) : resolve()));
    }
  });

  test.each(['http://servapibi.xm.com.co', 'https://evil.example', 'https://servapibi.xm.com.co/private', 'https://user:secret@servapibi.xm.com.co', 'invalid'])('EXT-14: configuración inválida nunca hace proxy: %s', async base => {
    const provider = new XmProvider(outbound, base);
    await expect(provider.query(valid)).rejects.toMatchObject({ status: 500, code: 'EXTERNAL_CONFIGURATION_ERROR' });
    expect(outbound).not.toHaveBeenCalled();
  });
});

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const create = mock(async (args: any): Promise<any> => ({}));
mock.module('@/lib/prisma', () => ({ prisma: { energyDataset: { create } } }));
const { app } = await import('@/app');

// HTTP real sobre loopback; solo se sustituye la escritura Prisma.
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No se pudo abrir el servidor de prueba.');
const url = `http://127.0.0.1:${address.port}`;
const generatedAt = new Date('2026-09-09T12:00:00Z');
const valid = () => ({
  source: 'Simulación académica', dataType: 'generacion',
  columns: [{ name: 'energia', optional: false }, { name: 'zona', optional: true }],
  records: [{ energia: 12.5, zona: 'norte' }],
});

beforeEach(() => {
  create.mockReset();
  create.mockImplementation(async (args: any): Promise<any> => ({
    id: 1, source: args.data.source, dataType: args.data.dataType,
    uploadedAt: generatedAt, status: 'recibido', pendingOptionalFields: args.data.pendingOptionalFields,
  }));
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function post(body: unknown, contentType: string | null = 'application/json', raw = false) {
  const response = await fetch(`${url}/datasets`, {
    method: 'POST', headers: contentType ? { 'Content-Type': contentType } : {},
    body: raw ? String(body) : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

describe('HU-01: registro HTTP con persistencia sustituida', () => {
  test('HU01-01: dataset válido -> 201 y una escritura', async () => {
    const result = await post(valid());
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ id: 1, status: 'recibido', recordCount: 1 });
    expect(result.body).not.toHaveProperty('content');
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('HU01-02: opcional ausente/null/vacío/espacios -> pendientes', async () => {
    const records = [{ energia: null }, { energia: '', zona: null }, { energia: 'fecha incorrecta', zona: '' }, { energia: -5, zona: '   ' }];
    const result = await post({ ...valid(), records });
    expect(result.status).toBe(201);
    expect(result.body.pendingOptionalFields).toEqual(records.map((_, recordIndex) => ({ recordIndex, field: 'zona', reason: 'empty_optional_field' })));
    expect((create.mock.calls[0]![0] as any).data.content.records).toEqual(records);
  });

  test('HU01-03: cero y false no son pendientes', async () => {
    const result = await post({ ...valid(), records: [{ energia: 1, zona: 0 }, { energia: 2, zona: false }] });
    expect(result.status).toBe(201);
    expect(result.body.pendingOptionalFields).toEqual([]);
  });

  test('HU01-04: estructuras inválidas y JSON mal formado sin escritura', async () => {
    const cases = [null, [], { ...valid(), columns: [] }, { ...valid(), records: [] },
      { ...valid(), columns: [{ name: ' ', optional: false }] },
      { ...valid(), columns: [{ name: 'energia', optional: 'false' }] },
      ...[null, [], 1, { energia: [] }, { energia: {} }, { energia: 1, extra: 2 }].map(record => ({ ...valid(), records: [record] }))];
    for (const body of cases) {
      const result = await post(body);
      expect(result.status).toBe(400);
      expect(result.body.error).toBe('INVALID_DATASET_FORMAT');
    }
    expect((await post('{', 'application/json', true)).body.error).toBe('INVALID_DATASET_FORMAT');
    expect(create).not.toHaveBeenCalled();
  });

  test('HU01-05: Content-Type incorrecto o ausente -> 415', async () => {
    for (const type of ['text/plain', 'application/xml', 'application/problem+json', 'application/json; charset=iso-8859-1', null]) {
      const result = await post(valid(), type);
      expect(result.status).toBe(415);
      expect(result.body.error).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
    expect(create).not.toHaveBeenCalled();
  });

  test('HU01-06: campos ausentes, tipo desconocido y duplicados', async () => {
    for (const field of ['source', 'dataType', 'columns', 'records']) {
      const body: Record<string, unknown> = valid();
      delete body[field];
      expect((await post(body)).body.error).toBe('MISSING_REQUIRED_FIELD');
    }
    for (const source of ['', '  ', 2, null]) expect((await post({ ...valid(), source })).status).toBe(400);
    expect((await post({ ...valid(), dataType: 'otro' })).body.error).toBe('UNSUPPORTED_DATA_TYPE');
    expect((await post({ ...valid(), columns: [valid().columns[0], valid().columns[0]] })).body.error).toBe('INVALID_DATASET_FORMAT');
    expect((await post({ ...valid(), records: [{ zona: 'norte' }] })).body.error).toBe('MISSING_REQUIRED_FIELD');
    expect(create).not.toHaveBeenCalled();
  });

  test('HU01-07: fallo Prisma -> 500 sin detalles sensibles', async () => {
    create.mockRejectedValueOnce(new Error('SQL DATABASE_URL password secreto stack dataset completo'));
    expect(await post(valid())).toEqual({ status: 500, body: {
      error: 'DATASET_REGISTRATION_FAILED', message: 'No fue posible registrar el dataset.',
    } });
  });

  test('HU01-08: contenido íntegro y defaults delegados a PostgreSQL', async () => {
    const body = { ...valid(), uploadedAt: '1900-01-01', status: 'otro' };
    const result = await post(body);
    const args = create.mock.calls[0]![0] as any;
    expect(args.data).toEqual({ source: body.source, dataType: body.dataType,
      content: { columns: body.columns, records: body.records }, pendingOptionalFields: [] });
    expect(result.body.uploadedAt).toBe(generatedAt.toISOString());
    expect(result.body.status).toBe('recibido');
  });

  test('HU01-09: seis tipos admitidos y JSON con charset', async () => {
    for (const dataType of ['generacion', 'consumo', 'oferta', 'demanda', 'precios', 'transacciones_simuladas']) {
      expect((await post({ ...valid(), dataType }, 'application/json; charset=utf-8')).status).toBe(201);
    }
  });

  test('HU01-10: no se impone límite de 100 KiB', async () => {
    expect((await post({ ...valid(), records: [{ energia: 'x'.repeat(110 * 1024) }] })).status).toBe(201);
  });

  test('HU01-11: /auth conserva validación previa al SDK', async () => {
    const response = await fetch(`${url}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'All fields are required' });
    expect(create).not.toHaveBeenCalled();
  });
});

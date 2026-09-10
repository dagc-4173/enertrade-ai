import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const create = mock(async (args: any): Promise<any> => ({}));
const findUnique = mock(async (_args: any): Promise<any> => null);
const updateMany = mock(async (_args: any): Promise<any> => ({ count: 1 }));
const preparedFind = mock(async (_args: any): Promise<any> => null);
const preparedCreate = mock(async (_args: any): Promise<any> => null);
mock.module('@/lib/prisma', () => ({ prisma: { energyDataset: { create, findUnique, updateMany }, preparedDataset: {findUnique: preparedFind, create: preparedCreate} } }));
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

const reference = () => ({
  id: 1, status: 'recibido', dataType: 'generacion',
  content: {
    columns: [{ name: 'fecha', optional: false }, { name: 'energia_kwh', optional: false }, { name: 'zona', optional: true }],
    records: [{ fecha: '2026-09-09T12:00:00Z', energia_kwh: 12.5, zona: 'etiqueta-simulada' }],
  }, pendingOptionalFields: [],
});
async function validateHttp(body?: string, id = '1') {
  const response = await fetch(`${url}/datasets/${id}/validate`, {
    method: 'POST', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body }),
  });
  return { status: response.status, body: await response.json() as any };
}
describe('HU-02: HTTP y concurrencia con Prisma sustituido', () => {
  let dataset: any;
  beforeEach(() => {
    dataset = reference();
    findUnique.mockReset();
    updateMany.mockReset();
    findUnique.mockImplementation(async () => dataset);
    updateMany.mockImplementation(async () => ({ count: 1 }));
  });
  test('HU02-01: aprobado', async () => {
    const r = await validateHttp();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'aprobado', canProceed: true, recordCount: 1, errorCount: 0, warningCount: 0, rulesetId: 'generacion_simulada_base', rulesetVersion: '1.0.0' });
  });
  test('HU02-02: zona faltante', async () => {
    for (const value of [undefined, null, '', '  ']) {
      dataset.content.records[0].zona = value;
      if (value === undefined) delete dataset.content.records[0].zona;
      const r = await validateHttp();
      expect(r.body.status).toBe('advertencia');
      expect(r.body.issues.map((i: any) => i.code)).toEqual(['OPTIONAL_VALUE_MISSING']);
    }
  });
  test('HU02-03: zona tipo incorrecto', async () => {
    for (const value of [0, false]) {
      dataset.content.records[0].zona = value;
      expect((await validateHttp()).body.issues[0].code).toBe('OPTIONAL_TYPE_MISMATCH');
    }
  });
  test('HU02-04: críticos vacíos; ausencia estructural es 409', async () => {
    for (const field of ['fecha', 'energia_kwh']) {
      for (const value of [null, '', '  ']) {
        dataset = reference(); dataset.content.records[0][field] = value;
        const r = await validateHttp();
        expect(r.body.status).toBe('rechazado');
        expect(r.body.issues.map((i: any) => i.code)).toEqual(['CRITICAL_VALUE_MISSING']);
      }
      dataset = reference(); delete dataset.content.records[0][field];
      expect((await validateHttp()).status).toBe(409);
    }
  });
  test('HU02-05: tipos críticos', async () => {
    for (const field of ['energia_kwh', 'fecha']) {
      for (const value of (field === 'fecha' ? [1, false] : ['12.5', false])) {
        dataset = reference(); dataset.content.records[0][field] = value;
        expect((await validateHttp()).body.issues.map((i: any) => i.code)).toEqual(['CRITICAL_TYPE_MISMATCH']);
      }
    }
  });
  test('HU02-06: cero y negativos', async () => {
    for (const value of [0, -12.5]) {
      dataset.content.records[0].energia_kwh = value;
      expect((await validateHttp()).body.status).toBe('aprobado');
    }
  });
  test('HU02-07: fechas, offsets y fracciones admitidas', async () => {
    for (const value of ['2026-09-09T12:00:00Z', '2026-09-09T12:00:00.1Z', '2026-09-09T12:00:00.12Z', '2026-09-09T12:00:00.123Z', '2026-09-09T07:00:00-05:00', '2026-09-09T14:00:00+02:00', '2024-02-29T00:00:00Z', '0099-01-01T00:00:00Z']) {
      dataset.content.records[0].fecha = value;
      expect((await validateHttp()).body.status).toBe('aprobado');
    }
  });
  test('HU02-08: fechas inválidas sin corrección', async () => {
    for (const value of ['2026-09-09T12:00:00', '2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', ' 2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z ', '2026-09-09T12:00:00.1234Z', '2026-09-09', '2026-09-09T24:00:00Z', '2026-09-09T12:00:00+24:00']) {
      dataset.content.records[0].fecha = value;
      expect((await validateHttp()).body.issues.map((i: any) => i.code)).toEqual(['INVALID_TIMESTAMP']);
    }
  });
  test('HU02-09: identidad por instante y primer índice', async () => {
    dataset.content.records.push({ ...dataset.content.records[0], fecha: '2026-09-09T07:00:00-05:00' }, { ...dataset.content.records[0], fecha: '2026-09-09T12:00:00.000Z' });
    const r = await validateHttp();
    expect(r.body.issues.map((i: any) => [i.code, i.recordIndex, i.relatedRecordIndex])).toEqual([
      ['DUPLICATE_TEMPORAL_IDENTITY', 1, 0], ['DUPLICATE_TEMPORAL_IDENTITY', 2, 0],
    ]);
  });
  test('HU02-10: misma energía, instantes distintos y sin ordenar', async () => {
    dataset.content.records.push({ ...dataset.content.records[0], fecha: '2026-09-08T12:00:00.001Z' });
    expect((await validateHttp()).body.status).toBe('aprobado');
  });
  test('HU02-11: error y warning conservados', async () => {
    dataset.content.records[0].energia_kwh = null; dataset.content.records[0].zona = null;
    expect((await validateHttp()).body).toMatchObject({ status: 'rechazado', errorCount: 1, warningCount: 1, canProceed: false });
  });
  test('HU02-12: inexistente', async () => {
    dataset = null;
    expect(await validateHttp()).toMatchObject({ status: 404, body: { error: 'DATASET_NOT_FOUND' } });
    expect(updateMany).not.toHaveBeenCalled();
  });
  test('HU02-13: tipo no aplicable', async () => {
    dataset.dataType = 'consumo';
    expect(await validateHttp()).toMatchObject({ status: 422, body: { error: 'RULESET_NOT_APPLICABLE' } });
    expect(updateMany).not.toHaveBeenCalled();
  });
  test('HU02-14: declaración incompatible', async () => {
    dataset.content.columns[0].optional = true;
    expect((await validateHttp()).status).toBe(422);
    dataset = reference(); dataset.content.columns.pop(); delete dataset.content.records[0].zona;
    expect((await validateHttp()).status).toBe(422);
    expect(updateMany).not.toHaveBeenCalled();
  });
  test('HU02-15: corrupción estructural', async () => {
    for (const content of [null, {}, { columns: [], records: [] }, { ...reference().content, records: [{ fecha: [] }] }]) {
      dataset.content = content;
      expect(await validateHttp()).toMatchObject({ status: 409, body: { error: 'DATASET_CONTENT_INCOMPATIBLE' } });
    }
    expect(updateMany).not.toHaveBeenCalled();
  });
  test('HU02-16: resultado previo intacto', async () => {
    for (const status of ['aprobado', 'advertencia', 'rechazado']) {
      dataset.status = status;
      expect((await validateHttp()).status).toBe(409);
    }
    expect(updateMany).not.toHaveBeenCalled();
  });
  test('HU02-17: fallos técnicos controlados', async () => {
    findUnique.mockRejectedValueOnce(new Error('SQL credencial stack'));
    expect((await validateHttp()).body.error).toBe('DATASET_VALIDATION_FAILED');
    expect(updateMany).not.toHaveBeenCalled();
    updateMany.mockRejectedValueOnce(new Error('SQL credencial stack'));
    const r = await validateHttp();
    expect(r).toEqual({ status: 500, body: { error: 'DATASET_VALIDATION_FAILED', message: 'No fue posible completar la validación del dataset.' } });
    expect(dataset.status).toBe('recibido');
    // Simula excepción inesperada al inspeccionar/evaluar el contenido.
    dataset.content = new Proxy({}, { get() { throw new Error('detalle interno'); } });
    expect((await validateHttp()).status).toBe(500);
  });
  test('HU02-18: carrera, ganador y conflicto (simulados)', async () => {
    let reads = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    findUnique.mockImplementation(async () => {
      const snapshot = structuredClone(dataset);
      reads++;
      if (reads <= 2) { if (reads === 2) release(); await barrier; return snapshot; }
      return dataset;
    });
    updateMany.mockImplementation(async (args: any) => {
      if (dataset.status !== args.where.status) return { count: 0 };
      Object.assign(dataset, args.data); return { count: 1 };
    });
    const results = await Promise.all([validateHttp(), validateHttp()]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(dataset.status).toBe('aprobado');
  });
  test('HU02-19: escritura atómica y contenido intacto', async () => {
    const before = structuredClone(dataset);
    const r = await validateHttp();
    const args = updateMany.mock.calls[0]![0];
    expect(args.where).toEqual({ id: 1, status: 'recibido' });
    expect(Object.keys(args.data).sort()).toEqual(['status', 'validatedAt', 'validationReport']);
    expect(args.data.validationReport.issues).toEqual(r.body.issues);
    expect(args.data.validatedAt.toISOString()).toBe(r.body.validatedAt);
    expect(dataset).toEqual(before);
  });
  test('HU02-20: sin body y solicitudes inválidas', async () => {
    expect((await validateHttp()).status).toBe(200);
    for (const body of ['{}', '{"rulesetId":"otro"}', '{', 'null']) expect((await validateHttp(body)).status).toBe(400);
    for (const id of ['0', '-1', '1.5', '2147483648', 'abc']) expect((await validateHttp(undefined, id)).status).toBe(400);
  });
  test('HU02-21: count cero, desaparición o estado inesperado', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValueOnce(dataset).mockResolvedValueOnce(null);
    expect((await validateHttp()).status).toBe(404);
    findUnique.mockImplementation(async () => dataset);
    expect((await validateHttp()).status).toBe(500);
  });
});

const { Prisma } = await import('@/generated/prisma/client');
const { evaluateGeneration } = await import('@/services/dataset-validation.rules');
const collision = (target: unknown = ['sourceDatasetId', 'profileId', 'profileVersion']) => new Prisma.PrismaClientKnownRequestError('private database detail', {code: 'P2002', clientVersion: '7.8.0', meta: {modelName: 'PreparedDataset', target}});
async function prepareHttp(body?: string, id = '1') {
  const response = await fetch(`${url}/datasets/${id}/prepare`, {method: 'POST', ...(body === undefined ? {} : {body, headers: {'Content-Type': 'application/json'}})});
  return {status: response.status, body: await response.json() as any};
}
describe('HU-03: preparación HTTP con Prisma sustituido', () => {
  let dataset: any;
  let artifact: any;
  function validateFixture() {
    const result = evaluateGeneration(dataset.content.records);
    dataset.status = result.status; dataset.validationReport = result.report;
  }
  beforeEach(() => {
    dataset = {...reference(), source: 'simulado', uploadedAt: generatedAt, validatedAt: generatedAt};
    validateFixture(); artifact = null;
    findUnique.mockReset(); updateMany.mockReset(); preparedFind.mockReset(); preparedCreate.mockReset();
    findUnique.mockImplementation(async () => dataset);
    preparedFind.mockImplementation(async () => artifact);
    preparedCreate.mockImplementation(async (args: any) => {
      if (artifact) throw collision();
      artifact = {id: 7, preparedAt: generatedAt, ...structuredClone(args.data)};
      return artifact;
    });
  });
  test('HU03-01: aprobado, contratos y defaults', async () => {
    const r = await prepareHttp();
    expect(r.status).toBe(200); expect(r.body).toMatchObject({datasetId: 1, preparedDatasetId: 7, reused: false, recordCount: 1});
    expect(r.body.content.variables).toEqual({minimum: [{name:'fecha',type:'string',representation:'ISO 8601 UTC canonical milliseconds'},{name:'energia_kwh',type:'number',unit:'kWh'}],context:[{name:'zona',type:'string',optional:true}]});
    expect(r.body.transformations).toEqual({temporalNormalization:{field:'fecha',target:'UTC canonical milliseconds',appliedToRecords:1},variableSelection:{minimum:['fecha','energia_kwh'],optionalContext:['zona'],unusedColumns:[]},excludedOptionalContext:[],generatedFeatures:[]});
    expect(preparedCreate.mock.calls[0]![0].data).not.toHaveProperty('preparedAt');
    expect(r.body).not.toHaveProperty('validationReport');
  });
  for (const [id,value,reason] of [['02',undefined,'missing'],['03',null,'null'],['04','','empty'],['05','  ','blank'],['06',false,'type_mismatch']] as const) {
    test(`HU03-${id}: zona ${reason}`, async () => {
      if(value===undefined) delete dataset.content.records[0].zona; else dataset.content.records[0].zona=value;
      validateFixture(); const r=await prepareHttp();
      expect(r.status).toBe(200); expect(r.body.content.records[0]).not.toHaveProperty('zona');
      expect(r.body.recordCount).toBe(1);
      expect(r.body.transformations.excludedOptionalContext).toEqual([{sourceRecordIndex:0,field:'zona',reason}]);
    });
  }
  test('HU03-07: zona exacta',async()=>{dataset.content.records[0].zona='  contexto  '; expect((await prepareHttp()).body.content.records[0].zona).toBe('  contexto  ');});
  for(const [id,input,output] of [['08','2026-09-09T07:00:00-05:00','2026-09-09T12:00:00.000Z'],['09','2026-09-09T12:00:00.1Z','2026-09-09T12:00:00.100Z'],['10','2026-09-09T12:00:00.12Z','2026-09-09T12:00:00.120Z']]) {
    test(`HU03-${id}: fecha canónica`,async()=>{dataset.content.records[0].fecha=input; expect((await prepareHttp()).body.content.records[0].fecha).toBe(output);});
  }
  test('HU03-11: columnas adicionales',async()=>{
    dataset.content.columns.push({name:'extraB',optional:true},{name:'extraA',optional:true}); Object.assign(dataset.content.records[0],{extraB:4,extraA:2});
    const r=await prepareHttp(); expect(r.body.transformations.variableSelection.unusedColumns).toEqual(['extraB','extraA']);
    expect(Object.keys(r.body.content.records[0])).toEqual(['sourceRecordIndex','fecha','energia_kwh','zona']); expect(dataset.content.records[0].extraB).toBe(4);
  });
  test('HU03-12: orden original e índices',async()=>{
    dataset.content.records.push({...dataset.content.records[0],fecha:'2026-09-08T12:00:00Z'}); validateFixture();
    const rows=(await prepareHttp()).body.content.records; expect(rows.map((r:any)=>r.sourceRecordIndex)).toEqual([0,1]); expect(rows.map((r:any)=>r.fecha)).toEqual(['2026-09-09T12:00:00.000Z','2026-09-08T12:00:00.000Z']);
  });
  test('HU03-13: energía cero y negativa intacta',async()=>{for(const value of [0,-12.5]) {artifact=null; dataset.content.records[0].energia_kwh=value; expect((await prepareHttp()).body.content.records[0].energia_kwh).toBe(value);}});
  for(const [id,state,status,code] of [['14','recibido',409,'DATASET_NOT_VALIDATED'],['15','rechazado',422,'DATASET_REJECTED']] as const) {
    test(`HU03-${id}: ${state} bloqueado`,async()=>{dataset.status=state; expect(await prepareHttp()).toMatchObject({status,body:{error:code}}); expect(preparedCreate).not.toHaveBeenCalled();});
  }
  test('HU03-16: inexistente',async()=>{dataset=null; expect(await prepareHttp()).toMatchObject({status:404,body:{error:'DATASET_NOT_FOUND'}});});
  test('HU03-17: tipo o declaración no aplicable',async()=>{
    dataset.dataType='consumo'; expect((await prepareHttp()).status).toBe(422); dataset.dataType='generacion'; dataset.content.columns[0].optional=true;
    expect(await prepareHttp()).toMatchObject({status:422,body:{error:'PREPARATION_PROFILE_NOT_APPLICABLE'}}); expect(preparedCreate).not.toHaveBeenCalled();
  });
  test('HU03-18: informe inconsistente',async()=>{
    const original=structuredClone(dataset.validationReport);
    for(const report of [null,{},[],{...original,rulesetVersion:'2'},{...original,issues:null},{...original,errorCount:1},{...original,warningCount:1},{...original,issues:[{}]}]) {
      dataset.validationReport=report; expect(await prepareHttp()).toMatchObject({status:409,body:{error:'DATASET_VALIDATION_INCONSISTENT'}});
    } expect(preparedCreate).not.toHaveBeenCalled();
  });
  test('HU03-19: contenido inconsistente',async()=>{
    const original=structuredClone(dataset.content);
    for(const record of [{energia_kwh:12.5},{fecha:'invalid',energia_kwh:1},{fecha:'2026-09-09T12:00:00Z',energia_kwh:'12.5'},null]) {
      dataset.content={...original,records:[record]}; expect(await prepareHttp()).toMatchObject({status:409,body:{error:'DATASET_CONTENT_INCONSISTENT'}});
    } expect(preparedCreate).not.toHaveBeenCalled();
  });
  test('HU03-20: IDs inválidos',async()=>{for(const id of ['0','-1','01','1.5','2147483648','abc']) expect(await prepareHttp(undefined,id)).toMatchObject({status:400,body:{error:'INVALID_PREPARATION_REQUEST'}});});
  test('HU03-21: body rechazado sin parsear',async()=>{for(const body of ['{}','{','null',' ']) expect(await prepareHttp(body)).toMatchObject({status:400,body:{error:'INVALID_PREPARATION_REQUEST'}}); expect(findUnique).not.toHaveBeenCalled();});
  test('HU03-22: sin Content-Type permitido',async()=>{expect((await prepareHttp()).status).toBe(200);});
  test('HU03-23: reutilización sin transformar',async()=>{
    const first=await prepareHttp();
    // Si se intentara transformar otra vez, esta fecha provocaría error.
    dataset.content.records[0].fecha='invalid';
    const second=await prepareHttp(); expect(second.status).toBe(200); expect(second.body).toEqual({...first.body,reused:true}); expect(preparedCreate).toHaveBeenCalledTimes(1);
    // Alteración solo del fixture: verifica recuperación del artefacto inmutable,
    // no autoriza editar el original. Ambos casos harían fallar checkContent.
    delete dataset.content.records[0].fecha;
    for (const content of [dataset.content, {columns: dataset.content.columns, records: null}]) {
      dataset.content = content;
      const reused = await prepareHttp();
      expect(reused.status).toBe(200);
      expect(reused.body).toEqual({...first.body, reused: true});
      expect(preparedCreate).toHaveBeenCalledTimes(1);
    }
  });
  test('HU03-24: original inmutable',async()=>{const before=structuredClone(dataset); await prepareHttp(); expect(dataset).toEqual(before); expect(updateMany).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();});
  test('HU03-25: sin features',async()=>{expect((await prepareHttp()).body.transformations.generatedFeatures).toEqual([]);});
  test('HU03-26: metadatos no duplicados',async()=>{expect(Object.keys((await prepareHttp()).body.content).sort()).toEqual(['records','variables']);});
  test('HU03-27: carrera simulada con unicidad',async()=>{
    let reads=0; let release!:()=>void; const barrier=new Promise<void>(resolve=>{release=resolve;});
    preparedFind.mockImplementation(async()=>{reads++; if(reads<=2){if(reads===2)release(); await barrier; return null;} return artifact;});
    const results=await Promise.all([prepareHttp(),prepareHttp()]);
    expect(results.map(r=>r.status)).toEqual([200,200]); expect(results.map(r=>r.body.preparedDatasetId)).toEqual([7,7]);
    expect(results.map(r=>r.body.reused).sort()).toEqual([false,true]); expect(preparedCreate).toHaveBeenCalledTimes(2); expect(artifact.id).toBe(7);
    expect(preparedFind.mock.calls[0]![0].where).toEqual({sourceDatasetId_profileId_profileVersion:{sourceDatasetId:1,profileId:'generacion_simulada_preparacion_base',profileVersion:'1.0.0'}});
  });
  test('HU03-28: unicidad ajena o sin identificar no se oculta',async()=>{
    for(const error of [collision(['id']),collision(null),new Error('private secret')]) {preparedCreate.mockRejectedValueOnce(error); expect(await prepareHttp()).toEqual({status:500,body:{error:'DATASET_PREPARATION_FAILED',message:'No fue posible completar la preparación del dataset.'}});}
    expect(artifact).toBeNull(); expect(preparedFind).toHaveBeenCalledTimes(3);
  });
  test('HU03-29: años UTC extendidos conservan instante',async()=>{
    for(const [input,expected] of [['0000-01-01T00:00:00+01:00','-000001-12-31T23:00:00.000Z'],['9999-12-31T23:59:59.999-01:00','+010000-01-01T00:59:59.999Z']]) {
      artifact=null; dataset.content.records[0].fecha=input; validateFixture(); expect(dataset.status).toBe('aprobado');
      expect((await prepareHttp()).body.content.records[0].fecha).toBe(expected);
    }
  });
  test('HU03-30: fallos de lectura y ganador ausente',async()=>{
    findUnique.mockRejectedValueOnce(new Error('secret')); expect((await prepareHttp()).status).toBe(500);
    preparedCreate.mockRejectedValueOnce(collision()); expect((await prepareHttp()).status).toBe(500); expect(artifact).toBeNull(); expect(dataset.status).toBe('aprobado');
  });
  test('HU03-31: unicidad identificada por driver adapter',async()=>{
    const first=await prepareHttp();
    preparedFind.mockResolvedValueOnce(null);
    preparedCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('private detail', {code:'P2002',clientVersion:'7.8.0',meta:{modelName:'PreparedDataset',driverAdapterError:{cause:{kind:'UniqueConstraintViolation',constraint:{fields:['sourceDatasetId','profileId','profileVersion']}}}}}));
    expect((await prepareHttp()).body).toEqual({...first.body,reused:true});
  });
});

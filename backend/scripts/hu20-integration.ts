import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { app } from '../src/app';
import { authCookieName } from '../src/services/auth.service';
import { prisma } from '../src/lib/prisma';

type Json = Record<string, unknown>;
type Http = { endpoint: string; status: number; body: Json; requestId: string; durationMs: number };
type Status = 'PASS' | 'FAIL' | 'BLOCKED';
type Case = { id: string; status: Status; expected: string; observed: string; endpoint?: string; httpStatus?: number; durationMs?: number; requestId?: string; traceDurationMs?: number; error?: string };
type Counts = Record<'aiQueryTrace' | 'priceForecastExecution' | 'matchingExecution' | 'patternAnalysis' | 'user' | 'authSession' | 'energyOffer' | 'energyDemand', number>;

const runId = `hu20-integration-${randomUUID()}`;
const traceIds: string[] = [], priceExecutionIds: string[] = [], matchingExecutionIds: string[] = [], patternAnalysisIds: string[] = [];
const offerIds: string[] = [], demandIds: string[] = [], sessionIds: string[] = [], userIds: string[] = [], requestIds: string[] = [];
const cases: Case[] = [];
let baseline: Counts | undefined;
let finalCounts: Counts | undefined;

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function object(value: unknown): value is Json { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function safeError(error: unknown) { return error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 300) : 'unknown integration failure'; }
function value(value: unknown, field: string) { assert(typeof value === 'string' && value.length > 0, `${field} is missing`); return value; }

async function counts(): Promise<Counts> {
  const values = await Promise.all([prisma.aiQueryTrace.count(), prisma.priceForecastExecution.count(), prisma.matchingExecution.count(), prisma.patternAnalysis.count(), prisma.user.count(), prisma.authSession.count(), prisma.energyOffer.count(), prisma.energyDemand.count()]);
  return { aiQueryTrace: values[0], priceForecastExecution: values[1], matchingExecution: values[2], patternAnalysis: values[3], user: values[4], authSession: values[5], energyOffer: values[6], energyDemand: values[7] };
}

async function request(baseUrl: string, endpoint: string, init?: RequestInit): Promise<Http> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${endpoint}`, init);
  const durationMs = performance.now() - started;
  const parsed: unknown = await response.json();
  assert(object(parsed), `${endpoint} did not return a JSON object`);
  const requestId = response.headers.get('x-request-id');
  assert(requestId !== null, `${endpoint} has no X-Request-Id`);
  if (endpoint !== '/health') requestIds.push(requestId);
  return { endpoint, status: response.status, body: parsed, requestId, durationMs };
}

async function trace(requestId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await prisma.aiQueryTrace.findFirst({ where: { requestId }, orderBy: { createdAt: 'desc' } });
    if (result) { if (!traceIds.includes(result.id)) traceIds.push(result.id); return result; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`AiQueryTrace missing for ${requestId}`);
}

async function collectTraces() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const results = await prisma.aiQueryTrace.findMany({ where: { requestId: { in: requestIds } } });
    results.forEach(result => { if (!traceIds.includes(result.id)) traceIds.push(result.id); });
    if (results.length === requestIds.length) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function runCase<T>(id: string, expected: string, action: () => Promise<{ value: T; observed: string; http?: Http; traceDurationMs?: number }>): Promise<T | undefined> {
  try {
    const result = await action();
    cases.push({ id, status: 'PASS', expected, observed: result.observed, ...(result.http ? { endpoint: result.http.endpoint, httpStatus: result.http.status, durationMs: result.http.durationMs, requestId: result.http.requestId } : {}), ...(result.traceDurationMs === undefined ? {} : { traceDurationMs: result.traceDurationMs }) });
    return result.value;
  } catch (error) {
    cases.push({ id, status: 'FAIL', expected, observed: 'No cumplido.', error: safeError(error) });
    return undefined;
  }
}

function blocked(id: string, expected: string, observed: string) { cases.push({ id, status: 'BLOCKED', expected, observed }); }

async function validateDatasets() {
  const datasets = await prisma.preparedDataset.findMany({ where: { id: { in: [17, 18, 33, 49] } }, select: { id: true, profileId: true, profileVersion: true, sourceRulesetId: true, sourceRulesetVersion: true } });
  const expected = new Map([[17, ['xm_gene_preparacion_base', 'xm_gene_base']], [18, ['xm_demandasin_preparacion_base', 'xm_demandasin_base']], [33, ['xm_demandasin_preparacion_base', 'xm_demandasin_base']], [49, ['xm_preciobolsnaci_preparacion_base', 'xm_preciobolsnaci_base']]]);
  assert(datasets.length === expected.size, 'required PreparedDataset records are missing');
  datasets.forEach(dataset => {
    const identity = expected.get(dataset.id);
    assert(identity && dataset.profileId === identity[0] && dataset.profileVersion === '1.0.0' && dataset.sourceRulesetId === identity[1] && dataset.sourceRulesetVersion === '1.0.0', `PreparedDataset ${dataset.id} is incompatible`);
  });
}

async function isolatedDate() {
  for (let offset = 1; offset <= 3650; offset += 1) {
    const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() + offset);
    const [offers, demands] = await Promise.all([prisma.energyOffer.count({ where: { status: 'ACTIVE', deliveryDate: date } }), prisma.energyDemand.count({ where: { status: 'ACTIVE', deliveryDate: date } })]);
    if (offers === 0 && demands === 0) return date;
  }
  throw new Error('no isolated delivery date');
}

async function cleanup() {
  await collectTraces();
  if (patternAnalysisIds.length) await prisma.patternAnalysis.deleteMany({ where: { id: { in: patternAnalysisIds } } });
  if (matchingExecutionIds.length) await prisma.matchingExecution.deleteMany({ where: { id: { in: matchingExecutionIds } } });
  if (priceExecutionIds.length) await prisma.priceForecastExecution.deleteMany({ where: { id: { in: priceExecutionIds } } });
  if (traceIds.length) await prisma.aiQueryTrace.deleteMany({ where: { id: { in: traceIds } } });
  if (offerIds.length) await prisma.energyOffer.deleteMany({ where: { id: { in: offerIds } } });
  if (demandIds.length) await prisma.energyDemand.deleteMany({ where: { id: { in: demandIds } } });
  if (sessionIds.length) await prisma.authSession.deleteMany({ where: { tokenHash: { in: sessionIds } } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  baseline = await counts();
  await validateDatasets();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address !== null && typeof address !== 'string', 'server has no port');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let supply: Http | undefined, demand: Http | undefined, price: Http | undefined, matching: Http | undefined, patterns: Http | undefined, invalid: Http | undefined;
  try {
    await runCase('INT20-01', 'health ok y cinco capacidades', async () => {
      const health = await request(baseUrl, '/health');
      assert(health.status === 200 && health.body.status === 'ok' && object(health.body.dependencies) && health.body.dependencies.database === 'ok', 'health contract');
      const capabilities = await request(baseUrl, '/capabilities/versions');
      assert(capabilities.status === 200 && Array.isArray(capabilities.body.capabilities) && capabilities.body.capabilities.length === 5, 'capabilities contract');
      const audit = await trace(capabilities.requestId);
      return { value: undefined, observed: 'Health y capacidades comprobados.', http: capabilities, traceDurationMs: audit.durationMs };
    });
    supply = await runCase('INT20-02', 'supply available con 24 predicciones', async () => {
      const http = await request(baseUrl, '/forecasts/supply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 17, targetDate: '2024-04-08' }) });
      assert(http.status === 200 && http.body.status === 'available' && Array.isArray(http.body.predictions) && http.body.predictions.length === 24 && http.body.modelId === 'xm-gene-ridge' && http.body.modelVersion === '1.0.0', 'supply contract');
      const audit = await trace(http.requestId); assert(audit.executionStatus === 'succeeded', 'supply trace');
      return { value: http, observed: 'Supply disponible.', http, traceDurationMs: audit.durationMs };
    });
    demand = await runCase('INT20-03', 'demand available con modelo 1.0.0', async () => {
      const http = await request(baseUrl, '/forecasts/demand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 33, targetDate: '2024-09-29' }) });
      assert(http.status === 200 && http.body.status === 'available' && object(http.body.prediction) && http.body.modelId === 'xm-demandasin-ridge' && http.body.modelVersion === '1.0.0', 'demand contract');
      const audit = await trace(http.requestId); assert(audit.executionStatus === 'succeeded', 'demand trace');
      return { value: http, observed: 'Demand disponible.', http, traceDurationMs: audit.durationMs };
    });
    price = await runCase('INT20-04', 'price con regla B1 y 24 predicciones', async () => {
      const http = await request(baseUrl, '/forecasts/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 49, targetDate: '2024-09-29' }) });
      assert(object(http.body.trace), 'price functional trace'); const executionId = value(http.body.trace.executionId, 'price executionId'); priceExecutionIds.push(executionId);
      assert(http.status === 200 && Array.isArray(http.body.predictions) && http.body.predictions.length === 24 && object(http.body.rule) && http.body.rule.id === 'xm-preciobolsnaci-b1' && http.body.rule.version === '1.0.0', 'price contract');
      assert((await prisma.priceForecastExecution.findUnique({ where: { id: executionId } }))?.status === 'succeeded', 'price execution'); const audit = await trace(http.requestId);
      return { value: http, observed: 'Price y ejecucion funcional comprobados.', http, traceDurationMs: audit.durationMs };
    });

    const user = await prisma.user.create({ data: { email: `${runId}@integration.invalid`, name: runId, passwordHash: `not-a-credential-${randomUUID()}` } }); userIds.push(user.id);
    const token = randomBytes(32).toString('base64url'), tokenHash = createHash('sha256').update(token).digest('hex');
    await prisma.authSession.create({ data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) } }); sessionIds.push(tokenHash);
    const deliveryDate = await isolatedDate();
    const offer = await prisma.energyOffer.create({ data: { userId: user.id, quantityKwh: '100.00', pricePerKwh: '50.00000', deliveryDate } }); offerIds.push(offer.id);
    const demandPublication = await prisma.energyDemand.create({ data: { userId: user.id, quantityKwh: '100.00', maxPricePerKwh: '60.00000', deliveryDate } }); demandIds.push(demandPublication.id);
    const cookie = `${authCookieName}=${token}`;
    matching = await runCase('INT20-05', 'matching con sugerencia y matching-v1', async () => {
      const http = await request(baseUrl, '/matches/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}' });
      assert(object(http.body.trace), 'matching functional trace'); const executionId = value(http.body.trace.executionId, 'matching executionId'); matchingExecutionIds.push(executionId);
      assert(http.status === 200 && Array.isArray(http.body.matches) && http.body.matches.length >= 1 && (await prisma.matchingExecution.findUnique({ where: { id: executionId } }))?.criteriaVersion === 'matching-v1', 'matching contract');
      const audit = await trace(http.requestId); assert(audit.executionStatus === 'succeeded', 'matching trace');
      return { value: http, observed: 'Matching funcional comprobado.', http, traceDurationMs: audit.durationMs };
    });
    patterns = await runCase('INT20-06', 'patterns completed o partial con metodo 1.0.0', async () => {
      const http = await request(baseUrl, '/patterns/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ preparedDatasetId: 18 }) });
      assert(http.status === 200 && (http.body.status === 'completed' || http.body.status === 'partial') && object(http.body.method) && http.body.method.id === 'energy-pattern-descriptive' && http.body.method.version === '1.0.0' && object(http.body.persistence), 'patterns contract');
      patternAnalysisIds.push(value(http.body.persistence.analysisId, 'pattern analysisId')); const audit = await trace(http.requestId); assert(audit.executionStatus === 'succeeded', 'patterns trace');
      return { value: http, observed: 'Patterns funcional comprobado.', http, traceDurationMs: audit.durationMs };
    });

    blocked('INT20-07-matching', 'matching global no_matches', 'No reproducible sin alterar publicaciones ajenas.');
    await runCase('INT20-07', 'forecast valido unavailable y traza empty', async () => {
      const http = await request(baseUrl, '/forecasts/supply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 17, targetDate: '2024-03-31' }) });
      assert(http.status === 422 && http.body.status === 'unavailable' && http.body.error === 'FORECAST_DATA_INSUFFICIENT', 'unavailable contract');
      const audit = await trace(http.requestId); assert(audit.executionStatus === 'empty', 'unavailable trace');
      return { value: http, observed: 'Solicitud valida sin historia suficiente.', http, traceDurationMs: audit.durationMs };
    });
    invalid = await runCase('INT20-08', '400 INVALID_FORECAST_REQUEST seguro', async () => {
      const http = await request(baseUrl, '/forecasts/supply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparedDatasetId: 'invalid', targetDate: '2024-04-08' }) });
      const payload = JSON.stringify(http.body).toLowerCase(); assert(http.status === 400 && http.body.error === 'INVALID_FORECAST_REQUEST' && !payload.includes('stack') && !payload.includes('select '), 'invalid contract');
      return { value: http, observed: 'Envelope seguro comprobado.', http };
    });
    if (invalid) {
      const invalidResponse = invalid;
      await runCase('INT20-09', 'AiQueryTrace failed con codigo publico', async () => {
      const audit = await trace(invalidResponse.requestId); assert(audit.endpoint === '/forecasts/supply' && audit.executionStatus === 'failed' && audit.errorCode === 'INVALID_FORECAST_REQUEST' && audit.durationMs >= 0, 'failed trace');
      const invalidCase = cases.find(item => item.id === 'INT20-08'); if (invalidCase) invalidCase.traceDurationMs = audit.durationMs;
      return { value: undefined, observed: 'Evento failed persistido.', http: invalidResponse, traceDurationMs: audit.durationMs };
      });
    } else blocked('INT20-09', 'AiQueryTrace failed con codigo publico', 'INT20-08 no produjo requestId.');
    await runCase('INT20-10', 'tiempos observados sin SLA', async () => {
      const timed = cases.filter(item => /^INT20-0[1-9]$/.test(item.id) && item.status === 'PASS' && item.durationMs !== undefined);
      assert(timed.length >= 8 && timed.every(item => item.durationMs! >= 0), 'timing evidence'); return { value: undefined, observed: `${timed.length} tiempos HTTP observados.` };
    });
    if (supply && demand && price && matching && patterns) {
      const supplyResponse = supply, demandResponse = demand, priceResponse = price, patternsResponse = patterns;
      await runCase('INT20-11', 'identidades y versiones verificadas', async () => {
      assert(supplyResponse.body.modelId === 'xm-gene-ridge' && demandResponse.body.modelId === 'xm-demandasin-ridge' && object(priceResponse.body.rule) && priceResponse.body.rule.id === 'xm-preciobolsnaci-b1' && object(patternsResponse.body.method) && patternsResponse.body.method.id === 'energy-pattern-descriptive', 'versions');
      return { value: undefined, observed: 'Cinco capacidades versionadas comprobadas.' };
      });
    } else blocked('INT20-11', 'identidades y versiones verificadas', 'Falto una respuesta valida previa.');
  } finally { if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); }
}

let mainError: unknown, cleanupError: unknown;
try { await main(); } catch (error) { mainError = error; } finally {
  try { await cleanup(); } catch (error) { cleanupError = error; }
  finalCounts = await counts(); await prisma.$disconnect();
}
assert(baseline !== undefined, 'baseline missing');
const cleanupMatches = JSON.stringify(baseline) === JSON.stringify(finalCounts);
cases.push({ id: 'INT20-12', status: cleanupError || !cleanupMatches ? 'FAIL' : 'PASS', expected: 'conteos finales iguales al baseline', observed: cleanupMatches ? 'Conteos restaurados.' : 'Conteos distintos al baseline.', ...(cleanupError ? { error: safeError(cleanupError) } : {}) });
if (mainError) cases.push({ id: 'RUNNER', status: 'FAIL', expected: 'ejecucion aislada', observed: 'Fallo fuera de un caso.', error: safeError(mainError) });
const requiredFailures = cases.filter(item => /^INT20-(0[1-9]|1[0-2])$/.test(item.id) && item.status !== 'PASS');
console.log(JSON.stringify({ runId, baseline, finalCounts, cases, tracked: { traceIds, priceExecutionIds, matchingExecutionIds, patternAnalysisIds, offerIds, demandIds, sessionIds, userIds } }, null, 2));
if (requiredFailures.length || mainError || cleanupError) process.exitCode = 1;
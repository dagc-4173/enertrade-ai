import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { acquireHourlyDemand, discoverHourlyDemand, saveHourlyDemand } from '@/integrations/xm-hourly-demand-acquisition';
import { ExternalDataError, isDate, isObject } from '@/integrations/types/external-data';
import { createMarketSeriesAdapter, marketSeries } from '@/integrations/chronos-market-series';
import metadata from '@/models/chronos-hourly/metadata.json';

export type ChronosModel = 'chronos2' | 'bolt';
type Config = { python: string; checkpoint: string };
type WorkerInput = { model: ChronosModel; checkpoint: string; context: number[]; predictionPeriods: number };
type WorkerResult = { model: ChronosModel; revision: string; quantiles: number[][] };
export class ChronosError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const error = (status: number, code: string, message: string): never => { throw new ChronosError(status, code, message); };
const offset = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
export const bogotaDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const hash = (data: string) => createHash('sha256').update(data).digest('hex');

function configuration(model: ChronosModel): Config {
  const python = process.env.CHRONOS_PYTHON_PATH?.trim(), checkpoint = process.env[model === 'chronos2' ? 'CHRONOS2_MODEL_PATH' : 'CHRONOS_BOLT_MODEL_PATH']?.trim();
  if (!python || !checkpoint || !isAbsolute(python) || !isAbsolute(checkpoint)) return error(503, 'CHRONOS_NOT_CONFIGURED', 'Este modelo experimental no está configurado en el servidor.');
  return { python, checkpoint };
}
async function checkConfiguration(model: ChronosModel) {
  const config = configuration(model);
  try {
    if (!(await stat(config.python)).isFile() || !(await stat(resolve(config.checkpoint, 'config.json'))).isFile() || !(await stat(resolve(config.checkpoint, 'model.safetensors'))).isFile()) throw Error();
  } catch { return error(503, 'CHRONOS_NOT_CONFIGURED', 'No están disponibles los archivos del modelo experimental.'); }
  return config;
}

export function runChronosWorker(input: WorkerInput, python: string): Promise<WorkerResult> {
  return new Promise((resolveResult, reject) => {
    const child = execFile(python, ['-I', '-B', resolve(import.meta.dir, '../python/chronos_worker.py')],
      { timeout: 120000, maxBuffer: 256 * 1024, windowsHide: true }, (failure, stdout) => {
        if (failure) { reject(new ChronosError(failure.killed ? 504 : 503, failure.killed ? 'CHRONOS_TIMEOUT' : 'CHRONOS_WORKER_FAILED', failure.killed ? 'El pronóstico excedió el tiempo permitido.' : 'El modelo experimental no pudo completar la inferencia.')); return; }
        try { resolveResult(JSON.parse(stdout)); } catch { reject(new ChronosError(503, 'CHRONOS_WORKER_FAILED', 'El modelo devolvió una respuesta no válida.')); }
      });
    child.stdin?.on('error', () => {});
    child.stdin?.end(JSON.stringify(input));
  });
}

export type ChronosSeries = 'demand' | 'supply' | 'price';
export type CapturedSeries = { context: number[]; rawSha256: string; normalizedSha256: string; save: (directory: string) => Promise<unknown> };
export function captureDemand(acquisition: Awaited<ReturnType<typeof acquireHourlyDemand>>): CapturedSeries {
  return { context: acquisition.normalized.records.map(r => r.demanda_real_kwh), rawSha256: acquisition.manifest.rawSha256, normalizedSha256: acquisition.manifest.normalizedSha256, save: directory => saveHourlyDemand(acquisition, directory) };
}
// All three public routes share the same CPU inference admission gate.
let running = false;
type Dependencies = {
  now: () => Date; config: typeof checkConfiguration; discover: typeof discoverHourlyDemand;
  acquire: (range: { startDate: string; endDate: string }) => Promise<CapturedSeries>;
  worker: typeof runChronosWorker; root: () => string;
};
export function createChronosHourlyService(dependencies: Partial<Dependencies> = {}, series: ChronosSeries = 'demand') {
  const adapter = series === 'demand' ? { discover: discoverHourlyDemand, acquire: async (range: { startDate: string; endDate: string }) => captureDemand(await acquireHourlyDemand(range)) } : createMarketSeriesAdapter(series);
  const profile = series === 'demand' ? { metric: 'DemaReal', target: 'demanda_real_kwh', unit: 'kWh', warning: 'Demanda agregada; excluye alumbrado público. No equivale a DemaSIN ni a consumo individual.' } : marketSeries[series];
  const historical = (model: ChronosModel) => series === 'demand' ? metadata[model].historicalMetrics : null;
  const d: Dependencies = { now: () => new Date(), config: checkConfiguration, discover: adapter.discover, acquire: adapter.acquire,
    worker: runChronosWorker,
    root: () => process.env.CHRONOS_EVIDENCE_DIR ?? resolve(import.meta.dir, '../../data/chronos-forecasts'), ...dependencies };
  return {
    async models() {
      return { models: await Promise.all((['chronos2', 'bolt'] as const).map(async model => {
        let configured = false;
        try { await d.config(model); configured = true; } catch {}
        return { key: model, ...metadata[model], historicalMetrics: historical(model), series, unit: profile.unit, configured, experimental: true, promoted: false,
          validation: series === 'demand' ? 'retrospective_only' : 'pending_series_evaluation', confidenceStatus: 'not_prospectively_calibrated' };
      })) };
    },
    async forecast(input: unknown) {
      if (!isObject(input) || Object.keys(input).length !== 2 || (input.model !== 'chronos2' && input.model !== 'bolt') || !isDate(input.targetDate)) return error(400, 'INVALID_CHRONOS_REQUEST', 'Selecciona un modelo y una fecha objetivo válidos.');
      const model = input.model, targetDate = input.targetDate;
      const today = bogotaDate(d.now());
      if (targetDate <= today || targetDate > offset(today, 7)) return error(422, 'CHRONOS_DATE_UNSUPPORTED', 'La fecha objetivo debe estar entre mañana y los próximos siete días.');
      if (running) return error(429, 'CHRONOS_BUSY', 'Hay otro pronóstico experimental en curso. Intenta nuevamente al terminar.');
      const config = await d.config(model);
      if (running) return error(429, 'CHRONOS_BUSY', 'Hay otro pronóstico experimental en curso.');
      running = true;
      let directory: string | undefined;
      const startedAt = d.now().toISOString(), executionId = randomUUID();
      try {
        const root = resolve(d.root()); await mkdir(root, { recursive: true });
        directory = resolve(root, executionId); await mkdir(directory);
        await writeFile(resolve(directory, 'request.json'), JSON.stringify({ executionId, startedAt, model, series, targetDate }), { flag: 'wx' });
        const discovery = await d.discover(today);
        await writeFile(resolve(directory, 'discovery.json'), JSON.stringify(discovery), { flag: 'wx' });
        const origin = discovery.latestCompleteDay;
        if (!origin) return error(422, 'CHRONOS_DATA_UNAVAILABLE', 'XM no publicó un día completo reciente para esta variable.');
        const horizonDays = (Date.parse(targetDate) - Date.parse(origin)) / 86400000;
        if (horizonDays < 1 || horizonDays > 7) return error(422, 'CHRONOS_DATA_TOO_OLD', `La última observación completa es ${origin}; la fecha solicitada supera el horizonte experimental de siete días desde ese dato.`);
        const acquisition = await d.acquire({ startDate: offset(origin, -27), endDate: origin });
        await acquisition.save(resolve(directory, 'inputs'));
        const context = acquisition.context;
        if (context.length !== 672 || context.some(v => typeof v !== 'number' || !Number.isFinite(v))) return error(422, 'CHRONOS_CONTEXT_INVALID', 'Se requieren 28 días completos de contexto.');
        const generatedPeriods = horizonDays * 24;
        const generated = await d.worker({ model, checkpoint: config.checkpoint, context, predictionPeriods: generatedPeriods }, config.python);
        if (generated.model !== model || generated.revision !== metadata[model].revision || !Array.isArray(generated.quantiles) || generated.quantiles.length !== generatedPeriods || generated.quantiles.some(row => !Array.isArray(row) || row.length !== 3 || row.some(v => typeof v !== 'number' || !Number.isFinite(v)) || row[0]! > row[1]! || row[1]! > row[2]!)) return error(503, 'CHRONOS_RESPONSE_INVALID', 'El modelo devolvió cuantiles no válidos.');
        const generatedAt = d.now().toISOString();
        if (targetDate <= bogotaDate(new Date(generatedAt))) return error(422, 'CHRONOS_DATE_EXPIRED', 'La fecha objetivo comenzó antes de terminar el pronóstico.');
        const result = { status: 'available' as const, model, modelId: metadata[model].modelId, modelVersion: metadata[model].revision,
          forecastType: `experimental_hourly_system_${series}`, series, source: `XM ${profile.metric}/Sistema`, target: profile.target, unit: profile.unit, targetDate,
          latestObservedDate: origin, contextFrom: offset(origin, -27), contextPeriods: 672, horizonDays, generatedPeriods,
          bridgePeriods: generatedPeriods - 24, generatedAt, experimental: true, academicValidation: 'pending', confidenceStatus: 'not_prospectively_calibrated',
          predictions: generated.quantiles.slice(-24).map((q, i) => ({ periodo: i + 1, q10: q[0]!, q50: q[1]!, q90: q[2]! })),
          historicalMetrics: historical(model),
          warnings: [profile.warning, ...(series === 'demand' ? [] : ['Evaluación histórica específica pendiente; no se trasladan métricas de demanda a esta variable.']), 'Cuantiles experimentales; no representan un intervalo prospectivamente calibrado.', ...(model === 'bolt' && generatedPeriods > 64 ? ['El horizonte supera los 64 periodos nativos de Bolt y utiliza extensión autoregresiva experimental.'] : []), 'El desempeño histórico de un día no acredita el desempeño con retraso de publicación.'],
          trace: { executionId, persistence: 'local_evidence' } };
        const generatedText = JSON.stringify(generated), resultText = JSON.stringify(result);
        await writeFile(resolve(directory, 'generated.json'), generatedText, { flag: 'wx' });
        await writeFile(resolve(directory, 'result.json'), resultText, { flag: 'wx' });
        await writeFile(resolve(directory, 'manifest.json'), JSON.stringify({ status: 'completed', executionId, startedAt, generatedAt, model, series, source: profile.metric, unit: profile.unit, revision: generated.revision,
          inputRawSha256: acquisition.rawSha256, normalizedSha256: acquisition.normalizedSha256, discoverySha256: hash(discovery.rawBody),
          generatedSha256: hash(generatedText), resultSha256: hash(resultText), targetDate, latestObservedDate: origin, horizonDays }), { flag: 'wx' });
        return result;
      } catch (failure) {
        const safe = failure instanceof ChronosError ? failure : failure instanceof ExternalDataError ? new ChronosError(failure.status, failure.code, failure.message) : new ChronosError(503, 'CHRONOS_FAILED', 'No fue posible completar o conservar el pronóstico experimental.');
        if (directory) await writeFile(resolve(directory, 'failure.json'), JSON.stringify({ status: 'failed', executionId, code: safe.code, requestAttempts: failure instanceof ExternalDataError && 'attempts' in failure ? failure.attempts : undefined, failedAt: d.now().toISOString() }), { flag: 'wx' }).catch(() => {});
        throw safe;
      } finally { running = false; }
    },
  };
}
export const chronosHourlyService = createChronosHourlyService();

export const chronosSupplyService = createChronosHourlyService({}, 'supply');
export const chronosPriceService = createChronosHourlyService({}, 'price');

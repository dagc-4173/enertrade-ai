import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { acquireHourlyDemand, discoverHourlyDemand } from '@/integrations/xm-hourly-demand-acquisition';
import { createMarketSeriesAdapter } from '@/integrations/chronos-market-series';
import { isDate, isObject, ExternalDataError } from '@/integrations/types/external-data';
import { bogotaDate, captureDemand, type CapturedSeries } from './chronos-hourly.service';
import { hourlyRidgeFeatures } from './hourly-ridge-features';
import { loadHourlyRidge, type HourlyRidgeSeries } from '@/models/hourly-ridge/model-loader';

export class HourlyRidgeError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
const fail = (code: string, message: string, status = 422): never => { throw new HourlyRidgeError(status, code, message) };
const offset = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
type Dependencies = { now: () => Date; discover: typeof discoverHourlyDemand; acquire: (r: { startDate: string; endDate: string }) => Promise<CapturedSeries>; root: () => string; load: typeof loadHourlyRidge };
export function createHourlyRidgeService(series: HourlyRidgeSeries, dependencies: Partial<Dependencies> = {}) {
  const adapter = series === 'demand' ? { discover: discoverHourlyDemand, acquire: async (r: { startDate: string; endDate: string }) => captureDemand(await acquireHourlyDemand(r)) } : createMarketSeriesAdapter('price');
  const d: Dependencies = { now: () => new Date(), ...adapter, root: () => process.env.CHRONOS_EVIDENCE_DIR ?? resolve(import.meta.dir, '../../data/chronos-forecasts'), load: loadHourlyRidge, ...dependencies };
  const horizons = series === 'demand' ? [1, 2, 3, 4, 5, 6, 7] : [4, 5, 6];
  const definition = series === 'demand' ? { source: 'XM DemaReal/Sistema', unit: 'kWh', target: 'demanda_real_kwh' } : { source: 'XM PrecBolsNaci/Sistema', unit: 'COP/kWh', target: 'precio_cop_kwh' };
  let running = false;
  async function availability() {
    const today = bogotaDate(d.now()), discovery = await d.discover(today), origin = discovery.latestCompleteDay;
    const supported = horizons.filter(h => { d.load(series, h); return true });
    const eligibleTargetDates = origin ? supported.map(h => offset(origin, h)).filter(date => date > today && date <= offset(today, 7)) : [];
    return { series, ...definition, origin, supportedHorizons: supported, eligibleTargetDates, models: supported.map(h => { const m = d.load(series, h); return { modelId: m.modelId, modelVersion: m.modelVersion, horizonDays: h, artifactSha256: m.artifactSha256, metrics: m.metrics, promoted: false } }), experimental: true, academicValidation: 'pending', discovery };
  }
  return {
    async availability() { const { discovery: _discovery, ...a } = await availability(); return a },
    async forecast(input: unknown) {
      if (!isObject(input) || Object.keys(input).length !== 1 || !isDate(input.targetDate)) return fail('INVALID_RIDGE_REQUEST', 'Selecciona una fecha objetivo válida.', 400);
      const targetDate = input.targetDate, today = bogotaDate(d.now());
      if (targetDate <= today || targetDate > offset(today, 7)) return fail('RIDGE_DATE_UNSUPPORTED', 'La fecha debe ser futura y estar dentro de los próximos siete días.');
      if (running) return fail('RIDGE_BUSY', 'Hay otro pronóstico Ridge de esta variable en curso.', 429);
      running = true;
      let directory: string | undefined;
      const executionId = randomUUID();
      try {
        const a = await availability();
        if (!a.origin || !a.eligibleTargetDates.includes(targetDate)) return fail('RIDGE_HORIZON_UNAVAILABLE', 'No hay un modelo Ridge y un origen publicado compatibles con esta fecha.');
        const horizonDays = (Date.parse(targetDate) - Date.parse(a.origin)) / 86400000, model = d.load(series, horizonDays);
        const acquisition = await d.acquire({ startDate: offset(a.origin, -27), endDate: a.origin });
        const c = acquisition.context;
        if (c.length !== 672 || c.some(v => !Number.isFinite(v) || (series === 'demand' && v < 0))) return fail('RIDGE_CONTEXT_INVALID', 'Se requieren 28 días completos de contexto.');
        const predictions = Array.from({ length: 24 }, (_, i) => {
          const x = hourlyRidgeFeatures(series, c, targetDate, i + 1);
          if (x.length !== model.coefficients.length) return fail('RIDGE_MODEL_INCOMPATIBLE', 'Las variables del modelo no coinciden.', 409);
          const value = model.intercept + x.reduce((sum, v, j) => sum + model.coefficients[j]! * ((v - model.means[j]!) / model.scales[j]!), 0);
          if (!Number.isFinite(value)) return fail('RIDGE_RESPONSE_INVALID', 'El modelo devolvió un valor no finito.', 503);
          return { periodo: i + 1, value };
        });
        const generatedAt = d.now().toISOString();
        if (targetDate <= bogotaDate(new Date(generatedAt))) return fail('RIDGE_DATE_EXPIRED', 'La fecha objetivo comenzó antes de terminar.');
        const result = { status: 'available', method: 'ridge', series, ...definition, modelId: model.modelId, modelVersion: model.modelVersion, artifactSha256: model.artifactSha256,
          targetDate, latestObservedDate: a.origin, horizonDays, generatedAt, contextPeriods: 672, experimental: true, promoted: false, academicValidation: 'pending', confidenceStatus: 'not_defined',
          predictions, referenceDay: { date: a.origin, values: c.slice(-24).map((value, i) => ({ periodo: i + 1, value })) },
          historicalMetrics: model.metrics, warnings: [series === 'demand' ? 'Demanda horaria DemaReal; excluye alumbrado público. No equivale a DemaSIN diario.' : 'Precio nacional de bolsa de referencia. No es una tarifa individual.', 'Modelo experimental; validación prospectiva y académica pendientes. Sin intervalo probabilístico.', 'La línea observada corresponde al día de origen, no al día futuro objetivo. Las métricas históricas no acreditan precisión de esta consulta.'], trace: { executionId, persistence: 'local_evidence' } };
        await mkdir(d.root(), { recursive: true }); directory = resolve(d.root(), executionId); await mkdir(directory);
        await acquisition.save(resolve(directory, 'inputs'));
        const text = JSON.stringify(result);
        await writeFile(resolve(directory, 'discovery.json'), JSON.stringify(a.discovery), { flag: 'wx' });
        await writeFile(resolve(directory, 'result.json'), text, { flag: 'wx' });
        await writeFile(resolve(directory, 'manifest.json'), JSON.stringify({ executionId, series, targetDate, generatedAt, origin: a.origin, horizonDays, modelId: model.modelId, artifactSha256: model.artifactSha256, rawSha256: acquisition.rawSha256, normalizedSha256: acquisition.normalizedSha256, resultSha256: createHash('sha256').update(text).digest('hex') }), { flag: 'wx' });
        return result;
      } catch (e) {
        if (directory) await writeFile(resolve(directory, 'failure.json'), JSON.stringify({ status: 'failed', executionId }), { flag: 'wx' }).catch(() => {});
        if (e instanceof HourlyRidgeError || e instanceof ExternalDataError) throw e;
        return fail('RIDGE_FAILED', 'No fue posible completar o conservar el pronóstico Ridge.', 503);
      } finally { running = false }
    },
  };
}

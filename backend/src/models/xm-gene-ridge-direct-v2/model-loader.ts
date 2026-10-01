import { readFileSync } from 'node:fs';
import { ForecastError, calendarDate, object } from '@/services/forecast.contract';
import { directSupplyFeatures } from './features';

export type DirectSupplyModel = {
  modelId: string; modelVersion: string; algorithm: 'ridge'; experimentVersion: 'v2'; hyperparameters: { alpha: number };
  horizonDays: number; forecastOriginDefinition: string; targetDefinition: string; orderedFeatures: string[]; coefficients: number[]; intercept: number;
  scaler: { ddof: 0; means: number[]; standardDeviations: number[] }; trainingRange: { start: string; end: string }; validationRange: { start: string; end: string };
  externalHoldoutRange: { start: string; end: string }; corpusHash: string; metrics: { validation: Metric; externalHoldout: Metric }; baselineReference: string;
};
type Metric = { evaluable: number; unavailable: number; MAE: number; RMSE: number; bias: number; WAPE: number };
type ResultEntry = { modelId: string; horizonDays: number; candidate: boolean; corpusHash: string; validation: { selectedAlpha: number }; artifact: { coefficients: number[]; intercept: number; means: number[]; standardDeviations: number[] } };

const expectedHash = 'e7ffe35f5091e7733b06d2acea3d62ef1fe79a7f7730102fbaac3b0ccf44cb8b';
const expectedRanges = { trainingRange: { start: '2024-10-01', end: '2026-03-31' }, validationRange: { start: '2026-04-01', end: '2026-05-31' }, externalHoldoutRange: { start: '2026-06-01', end: '2026-09-20' } } as const;
const alphaGrid = [0.01, 0.1, 1, 10, 100];
const finiteVector = (value: unknown) => Array.isArray(value) && value.length === directSupplyFeatures.length && value.every(item => typeof item === 'number' && Number.isFinite(item));
const same = (left: number[], right: number[]) => left.length === right.length && left.every((value, index) => value === right[index]);
const validRange = (value: unknown, expected: { start: string; end: string }) => object(value) && calendarDate(value.start) && calendarDate(value.end) && value.start === expected.start && value.end === expected.end;
function validMetric(value: unknown) { return object(value) && Number.isSafeInteger(value.evaluable) && value.evaluable > 0 && value.unavailable === 0 && ['MAE', 'RMSE', 'WAPE'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) && typeof value.bias === 'number' && Number.isFinite(value.bias); }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function validateDirectSupplyModel(value: unknown, horizonDays: number, result: ResultEntry): DirectSupplyModel {
  const bad = () => { throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); };
  if (!object(value) || horizonDays < 1 || horizonDays > 7 || result.candidate !== true || result.horizonDays !== horizonDays || result.corpusHash !== expectedHash) return bad();
  const expectedId = `xm-gene-ridge-direct-h${horizonDays}-v2`;
  if (value.modelId !== expectedId || result.modelId !== expectedId || value.modelVersion !== '1.0.0-experimental' || value.algorithm !== 'ridge' || value.experimentVersion !== 'v2' || value.horizonDays !== horizonDays || value.corpusHash !== expectedHash || !object(value.hyperparameters) || !alphaGrid.includes(value.hyperparameters.alpha as number) || value.hyperparameters.alpha !== result.validation.selectedAlpha) return bad();
  if (!Array.isArray(value.orderedFeatures) || value.orderedFeatures.length !== directSupplyFeatures.length || directSupplyFeatures.some((feature, index) => value.orderedFeatures[index] !== feature) || !finiteVector(value.coefficients) || typeof value.intercept !== 'number' || !Number.isFinite(value.intercept) || !object(value.scaler) || value.scaler.ddof !== 0 || !finiteVector(value.scaler.means) || !finiteVector(value.scaler.standardDeviations) || (value.scaler.standardDeviations as number[]).some(item => item <= 0)) return bad();
  if (!same(value.coefficients as number[], result.artifact.coefficients) || value.intercept !== result.artifact.intercept || !same(value.scaler.means as number[], result.artifact.means) || !same(value.scaler.standardDeviations as number[], result.artifact.standardDeviations)) return bad();
  if (!validRange(value.trainingRange, expectedRanges.trainingRange) || !validRange(value.validationRange, expectedRanges.validationRange) || !validRange(value.externalHoldoutRange, expectedRanges.externalHoldoutRange) || !object(value.metrics) || !validMetric(value.metrics.validation) || !validMetric(value.metrics.externalHoldout) || typeof value.baselineReference !== 'string' || !['B_ORIGIN_0', 'B_ORIGIN_6', 'B_HISTORICAL_MEAN'].includes(value.baselineReference)) return bad();
  return freeze(structuredClone(value)) as unknown as DirectSupplyModel;
}

export function createDirectSupplyModelLoader(readModel: (horizonDays: number) => string, readResults: () => string) {
  let results: { results: Record<string, ResultEntry> } | undefined; const cache = new Map<number, DirectSupplyModel>();
  return (horizonDays: number) => {
    if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 7) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
    const cached = cache.get(horizonDays); if (cached) return cached;
    try { const catalog = results ??= JSON.parse(readResults()); const entry = catalog.results[String(horizonDays)]; if (!entry) throw new Error(); const model = validateDirectSupplyModel(JSON.parse(readModel(horizonDays)), horizonDays, entry); cache.set(horizonDays, model); return model; }
    catch (error) { if (error instanceof ForecastError) throw error; throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); }
  };
}

export const loadDirectSupplyModel = createDirectSupplyModelLoader(
  horizonDays => readFileSync(new URL(`../xm-gene-ridge-direct-h${horizonDays}-v2/1.0.0/model.json`, import.meta.url), 'utf8'),
  () => readFileSync(new URL('../../../../docs/evidencias/hu-04-multihorizon-v2/results.json', import.meta.url), 'utf8'),
);
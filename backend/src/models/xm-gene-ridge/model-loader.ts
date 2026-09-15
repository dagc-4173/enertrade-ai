import { readFileSync } from 'node:fs';
import { calendarDate, features, ForecastError, object } from '@/services/forecast.contract';
import type artifact from './1.0.0/model.json';
export type ForecastModel = typeof artifact;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
export function validateModel(value: unknown): ForecastModel {
  const bad = () => { throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); };
  if (!object(value)) return bad();
  const expected = { modelId: 'xm-gene-ridge', modelVersion: '1.0.0', modelType: 'ridge', alpha: 0.01, compatibleProfile: 'xm_gene_preparacion_base@1.0.0', compatibleRuleset: 'xm_gene_base@1.0.0', target: 'energia_kwh', unit: 'kWh', forecastType: 'generation_availability_proxy', horizonPeriods: 24 };
  if (Object.entries(expected).some(([k,v]) => value[k] !== v)) return bad();
  const vector = (x: unknown): x is number[] => Array.isArray(x) && x.length === features.length && x.every(n => typeof n === 'number' && Number.isFinite(n));
  if (!Array.isArray(value.orderedFeatures) || value.orderedFeatures.length !== features.length || features.some((f,i) => value.orderedFeatures[i] !== f) ||
    !object(value.scaler) || value.scaler.ddof !== 0 || !vector(value.scaler.means) || !vector(value.scaler.standardDeviations) || value.scaler.standardDeviations.some((s: number) => s <= 0) || !vector(value.coefficients) || typeof value.intercept !== 'number' || !Number.isFinite(value.intercept)) return bad();
  for (const r of [value.trainingSourceRange, value.effectiveTrainingRange]) if (!object(r) || !calendarDate(r.start) || !calendarDate(r.end) || r.start > r.end) return bad();
  if (value.effectiveTrainingRange.start < value.trainingSourceRange.start || value.effectiveTrainingRange.end > value.trainingSourceRange.end || typeof value.trainingSnapshotSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.trainingSnapshotSha256) || !object(value.evaluationSummary)) return bad();
  return freeze(structuredClone(value)) as ForecastModel;
}
// Fixed server path, cached success or failure. HTTP cannot supply a path/model.
export function createModelLoader(read: () => string) {
  let loaded = false; let model: ForecastModel | undefined;
  return () => {
    if (!loaded) { loaded = true; try { model = validateModel(JSON.parse(read())); } catch { /* Safe cached failure. */ } }
    if (!model) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
    return model;
  };
}
export const loadModel = createModelLoader(() => readFileSync(new URL('./1.0.0/model.json', import.meta.url), 'utf8'));

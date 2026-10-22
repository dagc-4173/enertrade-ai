import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import locks from './locks.json';
export type HourlyRidgeSeries = 'demand' | 'price';
export type HourlyRidgeModel = { modelId: string; modelVersion: string; horizonDays: number; artifactSha256: string; orderedFeatures: string[]; coefficients: number[]; intercept: number; means: number[]; scales: number[];
  metrics: { MAE: number; RMSE: number; WAPE_percent: number; bias: number; n: number; range: { start: string; end: string }; evaluationType: string; horizonDays: number } };
const cache = new Map<string, HourlyRidgeModel>();
export function validateHourlyRidge(series: HourlyRidgeSeries, h: number, raw: string): HourlyRidgeModel {
  const expected = (locks[series] as Record<string, string>)[String(h)];
  const artifactSha256 = createHash('sha256').update(raw).digest('hex');
  if (!Number.isInteger(h) || !expected || artifactSha256 !== expected) throw Error('RIDGE_ARTIFACT_INCOMPATIBLE');
  const m = JSON.parse(raw), demand = series === 'demand';
  const means = demand ? m.means : m.scaler.means, scales = demand ? m.scales : m.scaler.standardDeviations;
  const id = demand ? `xm-demareal-ridge-direct-h${h}-v1` : `xm-preciobolsnaci-ridge-direct-h${h}-v1`;
  if (m.modelId !== id || m.modelVersion !== '1.0.0-experimental' || m.horizonDays !== h || !Number.isFinite(m.intercept) || [m.coefficients, means, scales].some(x => !Array.isArray(x) || x.length !== (demand ? 17 : 15) || x.some((v: number) => !Number.isFinite(v))) || scales.some((v: number) => v <= 0)) throw Error('RIDGE_ARTIFACT_INCOMPATIBLE');
  const e = demand ? m.validationMetrics : m.metrics.externalHoldout;
  const metrics = { MAE: e.MAE, RMSE: e.RMSE, WAPE_percent: demand ? e.WAPE_percent : e.WAPE, bias: e.bias, n: demand ? e.n : e.evaluable, range: demand ? m.validationRange : m.externalHoldoutRange, evaluationType: demand ? 'validation_technical' : 'external_temporal_holdout', horizonDays: h };
  if ([metrics.MAE, metrics.RMSE, metrics.WAPE_percent, metrics.bias, metrics.n].some(v => !Number.isFinite(v))) throw Error('RIDGE_METRICS_INCOMPATIBLE');
  const orderedFeatures = demand ? ['demand_origin_same_period', 'demand_origin_minus1_same_period', 'demand_origin_minus6_same_period', 'demand_origin_minus13_same_period', 'demand_origin_minus27_same_period', 'demand_origin_period24', 'demand_origin_minus1_period24', 'mean_last24', 'mean_last168', 'std_last168', 'period_sin', 'period_cos', 'target_weekday_sin', 'target_weekday_cos', 'target_month_sin', 'target_month_cos', 'target_weekend'] : [...m.orderedFeatures];
  const result = { modelId: m.modelId, modelVersion: m.modelVersion, horizonDays: h, artifactSha256, orderedFeatures, coefficients: [...m.coefficients], intercept: m.intercept, means: [...means], scales: [...scales], metrics };
  Object.freeze(orderedFeatures);
  Object.freeze(result.coefficients); Object.freeze(result.means); Object.freeze(result.scales); Object.freeze(metrics.range); Object.freeze(metrics); return Object.freeze(result);
}
export function loadHourlyRidge(series: HourlyRidgeSeries, h: number) {
  const key = `${series}/${h}`, existing = cache.get(key); if (existing) return existing;
  if (!Number.isInteger(h) || !(locks[series] as Record<string, string>)[String(h)]) throw Error('RIDGE_HORIZON_INCOMPATIBLE');
  const url = series === 'demand' ? new URL(`../xm-demareal-ridge-direct-v1/1.0.0/h${h}.json`, import.meta.url) : new URL(`../xm-preciobolsnaci-ridge-direct-h${h}-v1/1.0.0/model.json`, import.meta.url);
  const model = validateHourlyRidge(series, h, readFileSync(url, 'utf8')); cache.set(key, model); return model;
}

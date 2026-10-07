import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { v5OrderedFeatures } from '@/experiments/hu06-demand-v5-preregistration';
import { demandSemanticRule } from '@/services/demand-semantic-eligibility';
import { ForecastError, object } from '@/services/forecast.contract';

export type DirectDemandV5Model = {
  modelId: string; modelVersion: 'hu06-demand-v5-c-primary@1.0.0'; horizonDays: number;
  state: 'pendingProspectiveValidation'; academicValidation: 'pending'; modelStatus: 'experimental';
  modelFamily: 'independent_direct_ridge'; orderedFeatures: string[]; selectedAlpha: number; baselineReference: string;
  coefficients: number[]; intercept: number; scaler: { ddof: 0; means: number[]; standardDeviations: number[] };
  corpusHash: string; preregistrationTag: 'hu06-v5-preregistered'; preregistrationCommit: string; preregistrationCutoff: string;
  trainingRange: { start: string; end: string }; validationRange: { start: string; end: string };
  semanticPolicy: typeof demandSemanticRule; sourceFrozenSha256: string;
};
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function validateDirectDemandV5Model(value: unknown, horizonDays: number, source: string): DirectDemandV5Model {
  const bad = (): never => { throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); };
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6 || !object(value)) return bad();
  const frozen = JSON.parse(source);
  const { trainingSourceProvenance, validationSourceProvenance, ...parameters } = frozen;
  const expected = { ...parameters, modelStatus: 'experimental', sourceFrozenSha256: createHash('sha256').update(source).digest('hex') };
  if (!isDeepStrictEqual(value, expected) || value.modelId !== `xm-demandasin-ridge-direct-h${horizonDays}-v5` ||
      value.modelVersion !== 'hu06-demand-v5-c-primary@1.0.0' || value.horizonDays !== horizonDays || value.modelFamily !== 'independent_direct_ridge' ||
      value.state !== 'pendingProspectiveValidation' || value.academicValidation !== 'pending' || value.modelStatus !== 'experimental' ||
      !isDeepStrictEqual(value.orderedFeatures, [...v5OrderedFeatures]) || value.orderedFeatures.length !== 16 ||
      ![0.01, 0.1, 1, 10, 100].includes(value.selectedAlpha) || !['B_ORIGIN', 'B_ORIGIN_MINUS_6', 'B_TRAIN_TARGET_WEEKDAY_MEAN'].includes(value.baselineReference) ||
      value.corpusHash !== '18fd5aad3fe12eaa5290dba9ea551ccaef1a2baf4f41febf0c0354f0252c1735' ||
      value.preregistrationTag !== 'hu06-v5-preregistered' || value.preregistrationCommit !== '33ba66b508e6dca3516f94b04170f27be609f552' ||
      value.preregistrationCutoff !== '2026-10-01T19:02:43.949Z' || !object(value.scaler) || value.scaler.ddof !== 0 ||
      [value.coefficients, value.scaler.means, value.scaler.standardDeviations].some(vector => !Array.isArray(vector) || vector.length !== 16 || !vector.every((item: unknown) => typeof item === 'number' && Number.isFinite(item))) ||
      value.scaler.standardDeviations.some((item: number) => item <= 0) || typeof value.intercept !== 'number' || !Number.isFinite(value.intercept) ||
      !object(value.semanticPolicy) || Object.entries(demandSemanticRule).some(([key, expectedValue]) => value.semanticPolicy[key] !== expectedValue) ||
      !isDeepStrictEqual(value.trainingRange, { start: '2024-02-04', end: '2026-03-31' }) ||
      !isDeepStrictEqual(value.validationRange, { start: '2026-04-01', end: '2026-05-31' })) return bad();
  return freeze(structuredClone(value)) as DirectDemandV5Model;
}

export function createDirectDemandV5ModelLoader(readRuntime: (horizonDays: number) => string, readFrozen: (horizonDays: number) => string) {
  const cache = new Map<number, DirectDemandV5Model>();
  return (horizonDays: number) => {
    if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
    const cached = cache.get(horizonDays); if (cached) return cached;
    try {
      const model = validateDirectDemandV5Model(JSON.parse(readRuntime(horizonDays)), horizonDays, readFrozen(horizonDays));
      cache.set(horizonDays, model); return model;
    } catch (error) { if (error instanceof ForecastError) throw error; throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE'); }
  };
}

export const loadDirectDemandV5Model = createDirectDemandV5ModelLoader(
  horizonDays => readFileSync(new URL(`../xm-demandasin-ridge-direct-h${horizonDays}-v5/1.0.0/model.json`, import.meta.url), 'utf8'),
  horizonDays => readFileSync(new URL(`../../../../docs/evidencias/hu-06-demand-v5-frozen-models/h${horizonDays}.json`, import.meta.url), 'utf8'),
);
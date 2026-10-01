import { prisma } from '@/lib/prisma';
import { loadDirectDemandModel } from '@/models/xm-demandasin-ridge-direct-v2/model-loader';
import { addDays } from '@/experiments/hu06-multihorizon';
import { buildDemandDirectFeatures } from './demand-direct-features';
import { calendarDate, ForecastError, object } from './forecast.contract';
import { localCalendarDate, readXmCoverage, type XmCoverage } from './xm-coverage.service';

export type Prepared = { id: number; sourceDatasetId: number; profileId: string; profileVersion: string; sourceRulesetId: string; sourceRulesetVersion: string; content: unknown };
export const demandCompatibility = { profileId: 'xm_demandasin_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_demandasin_base', sourceRulesetVersion: '1.0.0' } as const;

export function mergeDemandPrepared(rows: Prepared[]) {
  const values = new Map<string, number>(), owners = new Map<string, Set<number>>(), sources = new Map<number, number>();
  const bad = (): never => { throw new ForecastError(409, 'PREPARED_DATASET_INCONSISTENT'); };
  const minimum = [{ name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' }, { name: 'demanda_kwh', type: 'number', unit: 'kWh' }];
  for (const prepared of rows) {
    if (Object.entries(demandCompatibility).some(([key, value]) => prepared[key as keyof Prepared] !== value)) return bad();
    const content = prepared.content;
    if (!object(content) || !object(content.variables) || !Array.isArray(content.variables.minimum) || content.variables.minimum.length !== 2 || !Array.isArray(content.records) || minimum.some(variable => content.variables.minimum.filter((field: unknown) => object(field) && Object.entries(variable).every(([key, value]) => field[key] === value)).length !== 1)) return bad();
    const seen = new Set<string>(); sources.set(prepared.id, prepared.sourceDatasetId);
    for (const record of content.records) {
      if (!object(record) || !calendarDate(record.fecha_xm) || typeof record.demanda_kwh !== 'number' || !Number.isFinite(record.demanda_kwh) || seen.has(record.fecha_xm)) return bad();
      seen.add(record.fecha_xm);
      const existing = values.get(record.fecha_xm);
      if (existing !== undefined && existing !== record.demanda_kwh) return bad();
      values.set(record.fecha_xm, record.demanda_kwh);
      const artifacts = owners.get(record.fecha_xm) ?? new Set<number>(); artifacts.add(prepared.id); owners.set(record.fecha_xm, artifacts);
    }
  }
  return { values, owners, sources };
}

export function latestDirectDemandOrigin(values: ReadonlyMap<string, number>, latestReceivedDate: string, targetDate: string) {
  for (const origin of [...values.keys()].filter(date => date <= latestReceivedDate && date < targetDate).sort().reverse()) {
    if (buildDemandDirectFeatures(values, origin, targetDate)) return origin;
  }
  return null;
}

const daysBetween = (origin: string, target: string) => (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${origin}T00:00:00Z`)) / 86_400_000;
export function createDirectDemandForecastService(
  readPrepared: (criteria: typeof demandCompatibility) => Promise<Prepared[]>,
  readCoverage: () => Promise<XmCoverage | null> = () => readXmCoverage('DemaSIN'),
  model = loadDirectDemandModel,
  now: () => Date = () => new Date(),
) {
  return async (input: unknown) => {
    if (!object(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'targetDate') || !calendarDate(input.targetDate)) throw new ForecastError(400, 'INVALID_FORECAST_REQUEST');
    const coverage = await readCoverage();
    if (!coverage) throw new ForecastError(422, 'FORECAST_DATA_INSUFFICIENT');
    if (input.targetDate <= localCalendarDate(now()) || input.targetDate <= coverage.latestReceivedDate) throw new ForecastError(422, 'FORECAST_DATE_NOT_SUPPORTED');
    const prepared = await readPrepared(demandCompatibility);
    const { values, owners, sources } = mergeDemandPrepared(prepared);
    const origin = latestDirectDemandOrigin(values, coverage.latestReceivedDate, input.targetDate);
    if (!origin) throw new ForecastError(422, 'FORECAST_SEMANTIC_DATA_UNAVAILABLE');
    const horizonDays = daysBetween(origin, input.targetDate);
    if (!Number.isInteger(horizonDays) || horizonDays < 1) throw new ForecastError(422, 'FORECAST_DATE_NOT_SUPPORTED');
    if (horizonDays > 6) throw new ForecastError(422, 'FORECAST_HORIZON_NOT_SUPPORTED', 'Los modelos experimentales de Demanda admiten hasta 6 días de horizonte.');
    const selected = model(horizonDays);
    if (selected.horizonDays !== horizonDays) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
    const features = buildDemandDirectFeatures(values, origin, input.targetDate);
    if (!features || features.values.length !== selected.orderedFeatures.length || features.featureDates.some(date => date > origin)) throw new ForecastError(422, 'FORECAST_SEMANTIC_DATA_UNAVAILABLE');
    const demand = selected.intercept + features.values.reduce((total, value, index) => total + selected.coefficients[index]! * ((value - selected.scaler.means[index]!) / selected.scaler.standardDeviations[index]!), 0);
    if (!Number.isFinite(demand)) throw new ForecastError(500, 'FORECAST_FAILED');
    const sourceArtifacts = [...new Set(features.featureDates.flatMap(date => [...owners.get(date) ?? []]))].sort((left, right) => left - right).map(preparedDatasetId => ({ preparedDatasetId, sourceDatasetId: sources.get(preparedDatasetId)! }));
    return { status: 'available' as const, forecastType: 'aggregate_demand_proxy' as const, target: 'demanda_kwh' as const, unit: 'kWh' as const,
      modelId: selected.modelId, modelVersion: selected.modelVersion, modelStatus: selected.status, academicValidation: selected.academicValidation,
      forecastOriginDate: origin, targetDate: input.targetDate, horizonDays, sourceArtifacts, prediction: { demanda_kwh: demand }, confidence: null, confidenceStatus: 'not_defined' as const };
  };
}

export const forecastDirectDemand = createDirectDemandForecastService(criteria => prisma.preparedDataset.findMany({
  where: criteria, select: { id: true, sourceDatasetId: true, profileId: true, profileVersion: true, sourceRulesetId: true, sourceRulesetVersion: true, content: true },
}));
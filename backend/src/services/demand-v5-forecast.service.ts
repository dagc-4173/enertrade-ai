import { prisma } from '@/lib/prisma';
import { loadDirectDemandV5Model } from '@/models/xm-demandasin-ridge-direct-v5/model-loader';
import { demandCompatibility, type Prepared } from './demand-direct-forecast.service';
import { buildResolvedDemandV5Target, resolveDemandV5Origin } from './demand-v5-origin.service';
import { demandV5CalendarDate } from './demand-v5-features';
import { calendarDate, ForecastError, object } from './forecast.contract';
import { readXmCoverage, type XmCoverage } from './xm-coverage.service';

export function createDemandV5ForecastService(
  readPrepared: (criteria: typeof demandCompatibility) => Promise<Prepared[]>,
  readCoverage: () => Promise<XmCoverage | null> = () => readXmCoverage('DemaSIN'),
  loadModel = loadDirectDemandV5Model,
  now: () => Date = () => new Date(),
) {
  return async (input: unknown) => {
    if (!object(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'targetDate') || !calendarDate(input.targetDate)) throw new ForecastError(400, 'INVALID_FORECAST_REQUEST');
    const coverage = await readCoverage();
    if (!coverage) throw new ForecastError(422, 'FORECAST_DATA_INSUFFICIENT');
    const current = now();
    if (input.targetDate <= demandV5CalendarDate(current) || input.targetDate <= coverage.latestReceivedDate) throw new ForecastError(422, 'FORECAST_DATE_NOT_SUPPORTED');
    const resolved = resolveDemandV5Origin(coverage, await readPrepared(demandCompatibility), current);
    if (!resolved) throw new ForecastError(422, 'FORECAST_SEMANTIC_DATA_UNAVAILABLE');
    const built = buildResolvedDemandV5Target(resolved, input.targetDate);
    const model = loadModel(built.horizonDays);
    if (model.horizonDays !== built.horizonDays) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
    const prediction = model.intercept + built.values.reduce((total, value, index) => total + model.coefficients[index]! * ((value - model.scaler.means[index]!) / model.scaler.standardDeviations[index]!), 0);
    if (!Number.isFinite(prediction)) throw new ForecastError(500, 'FORECAST_FAILED');
    return { status: 'available' as const, forecastType: 'aggregate_demand_proxy' as const, target: 'demanda_kwh' as const, unit: 'kWh' as const,
      modelId: model.modelId, modelVersion: model.modelVersion, modelStatus: model.modelStatus, academicValidation: model.academicValidation,
      modelState: model.state, forecastOriginDate: resolved.forecastOriginDate, targetDate: input.targetDate, horizonDays: built.horizonDays,
      sourceArtifacts: resolved.sourceArtifacts, prediction: { demanda_kwh: prediction }, confidence: null, confidenceStatus: 'not_defined' as const,
      featureSourceDates: built.featureDates, actualSourceDates: built.actualSourceDates, oldestDate: built.oldestDate, newestDate: built.newestDate, count: built.count, calendarSpanDays: built.calendarSpanDays };
  };
}

export const forecastDemandV5 = createDemandV5ForecastService(criteria => prisma.preparedDataset.findMany({ where: criteria,
  select: { id: true, sourceDatasetId: true, profileId: true, profileVersion: true, sourceRulesetId: true, sourceRulesetVersion: true, content: true } }));
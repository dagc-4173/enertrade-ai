import { prisma } from '@/lib/prisma';
import { prepareDataset } from './dataset-preparation.service';
import { validateDataset } from './dataset-validation.service';
import { ExternalDataService } from '@/integrations/external-data.service';
import { XmProvider } from '@/integrations/providers/xm.provider';
import { createXmConsolidatedDatasetService } from '@/integrations/xm-consolidated-dataset.service';
import { createXmWindowIngestionService, type XmMetric } from '@/integrations/xm-window-ingestion.service';
import { calendarNextDate, localCalendarDate, readXmCoverage, type XmCoverage } from './xm-coverage.service';
import { demandCompatibility, type Prepared } from './demand-direct-forecast.service';
import { loadDirectDemandV5Model, type DirectDemandV5Model } from '@/models/xm-demandasin-ridge-direct-v5/model-loader';
import { buildResolvedDemandV5Target, resolveDemandV5Origin } from './demand-v5-origin.service';
import { demandV5CalendarDate } from './demand-v5-features';
import { candidateFutureDates, productMaxHorizonDays, type AvailabilityReason } from './forecast-future-dates';
import { ForecastError } from './forecast.contract';
import { mergeSupplyPrepared, supplyCompatibility, type StoredPrepared } from './forecast.service';
import { buildDirectSupplyFeatures } from '@/models/xm-gene-ridge-direct-v2/features';
import { loadDirectSupplyModel, type DirectSupplyModel } from '@/models/xm-gene-ridge-direct-v2/model-loader';
import { priceCompatibility, readPriceReferenceDay, type PreparedPrice } from './price-forecast.service';
import { loadRule } from '@/models/xm-preciobolsnaci-b1/rule-loader';
import { ForecastCoverageError, readAvailabilityCoverage } from './forecast-availability-coverage';

export type XmSyncMetric = XmMetric;
export type ForecastAvailability = { series: XmSyncMetric; currentDate: string; latestObservationDate: string; latestReceivedDate: string; latestIndividuallyUsableDate: string; semanticExcludedDates: string[]; modelMaxHorizonDays: 1 | 6 | 7; productMaxHorizonDays: 7; candidateFutureTargetDates: string[]; availabilityReason: AvailabilityReason; eligiblePreparedDatasetIds?: number[]; eligibleFutureTargetDates: string[]; nextForecastDate: string; supportedHorizonDays: 1 | 6 | 7; supportedHorizonMinDays?: 1; supportedHorizonMaxDays?: 6; modelMinTargetDate: string; modelMaxTargetDate: string; effectiveFutureMinDate: string | null; effectiveFutureMaxDate: string | null; hasFutureForecastWindow: boolean; dataFreshnessDays: number };
type MissingAvailability = Omit<ForecastAvailability, 'latestObservationDate' | 'latestReceivedDate' | 'latestIndividuallyUsableDate' | 'nextForecastDate' | 'modelMinTargetDate' | 'modelMaxTargetDate' | 'dataFreshnessDays'> & {
  latestObservationDate: null; latestReceivedDate: null; latestIndividuallyUsableDate: null;
  nextForecastDate: null; modelMinTargetDate: null; modelMaxTargetDate: null; dataFreshnessDays: null;
  availabilityError: { code: string; message: string };
};
export type ForecastAvailabilityResult = ForecastAvailability | MissingAvailability;
type ExternalRecord = { date: string; hour: number | null; value: number };
type SyncWindow = { from: string; to: string; manifestId: number; energyDatasetId: number; reused: boolean };
type Materialized = { consolidatedDatasetId: number; energyDatasetId: number };
type Validation = { status: string; canProceed: boolean; semanticValidation?: { latestIndividuallyUsableDate: string | null; semanticExcludedDates: string[] } };
type Preparation = { preparedDatasetId: number; profileId: string; profileVersion: string };

export type XmDailySyncDependencies = {
  readCoverage: (metric: XmSyncMetric) => Promise<XmCoverage | null>;
  readAvailabilityCoverage?: (metric: XmSyncMetric) => Promise<XmCoverage | null>;
  query: (input: { provider: 'xm'; dataset: XmSyncMetric; startDate: string; endDate: string }) => Promise<{ records: ExternalRecord[] }>;
  ingest: (input: { metric: XmSyncMetric; from: string; to: string }) => Promise<{ manifestId: number; energyDatasetId: number; reused: boolean }>;
  materialize: (input: { metric: XmSyncMetric; from: string; to: string }) => Promise<Materialized>;
  validate: (energyDatasetId: number) => Promise<Validation>;
  prepare: (energyDatasetId: number) => Promise<Preparation>;
  now: () => Date;
  readDemandPrepared?: () => Promise<Prepared[]>;
  loadDemandModel?: (horizonDays: number) => DirectDemandV5Model;
  readSupplyPrepared?: () => Promise<StoredPrepared[]>;
  loadSupplyModel?: (horizonDays: number) => DirectSupplyModel;
  readPricePrepared?: () => Promise<PreparedPrice[]>;
};

export type XmMetricSyncResult = {
  metric: XmSyncMetric;
  status: 'up_to_date' | 'synchronized' | 'validation_rejected' | 'failed';
  previousPersistedUntil?: string;
  availableUntil?: string;
  providerAvailableUntil?: string;
  persistedUntil?: string;
  latestIndividuallyUsableDate?: string;
  semanticExcludedDates?: string[];
  synchronizedUntil?: string;
  windowsCreatedOrReused?: SyncWindow[];
  consolidatedDatasetId?: number;
  energyDatasetId?: number;
  preparedDatasetId?: number;
  validationStatus?: string;
  preparationProfile?: { id: string; version: string };
  error?: { code: string; message: string };
};

export class XmDailySyncError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

const metrics: XmSyncMetric[] = ['Gene', 'DemaSIN', 'PrecBolsNaci'];
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const date = (value: Date) => value.toISOString().slice(0, 10);
const dayDifference = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

function addDays(value: string, days: number) {
  const current = new Date(`${value}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + days);
  return date(current);
}

function windows(from: string, to: string) {
  const result: { from: string; to: string }[] = [];
  for (let start = from; start <= to; start = addDays(start, 30)) {
    const end = addDays(start, 29);
    result.push({ from: start, to: end < to ? end : to });
  }
  return result;
}

function expectedRecords(metric: XmSyncMetric) { return metric === 'DemaSIN' ? 1 : 24; }

function completeDay(metric: XmSyncMetric, day: string, records: ExternalRecord[]) {
  const periods = new Set(records.filter(record => record.date === day && Number.isFinite(record.value)).map(record => record.hour));
  return metric === 'DemaSIN' ? periods.size === 1 && periods.has(null) : periods.size === expectedRecords(metric) && Array.from({ length: 24 }, (_, index) => periods.has(index + 1)).every(Boolean);
}

const external = new ExternalDataService([new XmProvider()]);
const ingestion = createXmWindowIngestionService(external);
const consolidation = createXmConsolidatedDatasetService();

const defaultDependencies: XmDailySyncDependencies = {
  readCoverage: readXmCoverage,
  readAvailabilityCoverage,
  query: input => external.query({ provider: 'xm', dataset: input.dataset, startDate: input.startDate, endDate: input.endDate }),
  async ingest(input) { return ingestion.ingest(input); },
  async materialize(input) { return consolidation.materialize(input); },
  async validate(energyDatasetId) {
    const dataset = await prisma.energyDataset.findUnique({ where: { id: energyDatasetId }, select: { status: true, validationReport: true } });
    if (!dataset) throw new XmDailySyncError(404, 'DATASET_NOT_FOUND', 'Dataset consolidado no encontrado.');
    if (dataset.status !== 'recibido') {
      const report = object(dataset.validationReport) && object(dataset.validationReport.semanticValidation) ? dataset.validationReport.semanticValidation : undefined;
      return { status: dataset.status, canProceed: dataset.status !== 'rechazado', ...(report && (typeof report.latestIndividuallyUsableDate === 'string' || report.latestIndividuallyUsableDate === null) && Array.isArray(report.semanticExcludedDates) ? { semanticValidation: { latestIndividuallyUsableDate: report.latestIndividuallyUsableDate as string | null, semanticExcludedDates: report.semanticExcludedDates.filter((date): date is string => typeof date === 'string') } } : {}) };
    }
    return validateDataset(energyDatasetId);
  },
  async prepare(energyDatasetId) {
    const result = await prepareDataset(energyDatasetId);
    return { preparedDatasetId: result.preparedDatasetId, profileId: result.profileId, profileVersion: result.profileVersion };
  },
  now: () => new Date(),
  readDemandPrepared: () => prisma.preparedDataset.findMany({ where: demandCompatibility, select: { id: true, sourceDatasetId: true, profileId: true, profileVersion: true, sourceRulesetId: true, sourceRulesetVersion: true, content: true } }),
  readSupplyPrepared: () => prisma.preparedDataset.findMany({ where: supplyCompatibility, select: { id: true, sourceDatasetId: true, profileId: true, profileVersion: true, sourceRulesetId: true, sourceRulesetVersion: true, content: true } }),
  readPricePrepared: () => prisma.preparedDataset.findMany({ where: priceCompatibility, select: { id: true, sourceDatasetId: true, profileId: true, profileVersion: true, sourceRulesetId: true, sourceRulesetVersion: true, content: true } }),
};

function failure(metric: XmSyncMetric, error: unknown): XmMetricSyncResult {
  if (error instanceof XmDailySyncError) return { metric, status: 'failed', error: { code: error.code, message: error.message } };
  const value = error as { code?: unknown; message?: unknown };
  return { metric, status: 'failed', error: { code: typeof value?.code === 'string' ? value.code : 'XM_SYNC_FAILED', message: typeof value?.message === 'string' ? value.message : 'No fue posible sincronizar la métrica XM.' } };
}

export function createXmDailySyncService(dependencies: XmDailySyncDependencies = defaultDependencies) {
  let running = false;
  async function availability(metric: XmSyncMetric): Promise<ForecastAvailability> {
    const coverage = await (dependencies.readAvailabilityCoverage ?? dependencies.readCoverage)(metric);
    if (!coverage) throw new XmDailySyncError(404, 'XM_SYNC_COVERAGE_MISSING', 'No existe cobertura XM consolidada para la métrica.');
    const observedNow = dependencies.now();
    const currentDate = metric === 'DemaSIN' ? demandV5CalendarDate(observedNow) : localCalendarDate(observedNow); const supportedHorizonDays = metric === 'Gene' ? 7 : metric === 'DemaSIN' ? 6 : 1;
    const candidateFutureTargetDates = candidateFutureDates(currentDate, supportedHorizonDays);
    const latestObservationDate = coverage.latestIndividuallyUsableDate; const eligibleFutureTargetDates: string[] = [];
    let availabilityReason: AvailabilityReason = 'NO_BUILDABLE_ORIGIN';
    const eligiblePreparedDatasetIds: number[] = [];
    let demandOrigin: string | null = null;
    if (metric === 'DemaSIN') {
      const resolved = resolveDemandV5Origin(coverage, dependencies.readDemandPrepared ? await dependencies.readDemandPrepared() : [], observedNow);
      demandOrigin = resolved?.forecastOriginDate ?? null;
      if (resolved) for (const target of candidateFutureTargetDates) {
        if (target <= coverage.latestReceivedDate) continue;
        const horizon = dayDifference(resolved.forecastOriginDate, target);
        if (horizon < 1 || horizon > 6) { availabilityReason = 'SOURCE_DATA_STALE'; continue; }
        try {
          const model = (dependencies.loadDemandModel ?? loadDirectDemandV5Model)(horizon);
          const built = buildResolvedDemandV5Target(resolved, target);
          if (model.horizonDays !== built.horizonDays) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
        } catch (error) {
          if (!(error instanceof ForecastError)) throw error;
          if (error.code === 'FORECAST_SEMANTIC_DATA_UNAVAILABLE') { availabilityReason = 'NO_BUILDABLE_ORIGIN'; continue; }
          if (error.code === 'FORECAST_MODEL_INCOMPATIBLE') { availabilityReason = 'MODEL_HORIZON_LIMIT'; continue; }
          throw error;
        }
        eligibleFutureTargetDates.push(target);
      }
    } else if (metric === 'Gene') {
      const origin = coverage.persistedUntil;
      const { values } = mergeSupplyPrepared(dependencies.readSupplyPrepared ? await dependencies.readSupplyPrepared() : []);
      for (const target of candidateFutureTargetDates) {
        const horizon = dayDifference(origin, target);
        if (horizon < 1 || horizon > 7) { availabilityReason = 'SOURCE_DATA_STALE'; continue; }
        try {
          const model = (dependencies.loadSupplyModel ?? loadDirectSupplyModel)(horizon);
          if (model.horizonDays !== horizon) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
        } catch (error) {
          if (!(error instanceof ForecastError) || error.code !== 'FORECAST_MODEL_INCOMPATIBLE') throw error;
          availabilityReason = 'MODEL_HORIZON_LIMIT'; continue;
        }
        const buildable = Array.from({ length: 24 }, (_, index) => buildDirectSupplyFeatures(
          (date, period) => date <= origin ? values.get(`${date}|${period}`) : undefined, origin, target, index + 1,
        )).every(built => built !== null && built.sourceObservations.every(row => row.date <= origin));
        if (buildable) eligibleFutureTargetDates.push(target);
        else availabilityReason = 'NO_BUILDABLE_ORIGIN';
      }
    } else {
      const rule = loadRule();
      const prepared = dependencies.readPricePrepared ? await dependencies.readPricePrepared() : [];
      const target = candidateFutureTargetDates[0]!;
      let hasReferenceDay = false;
      for (const p of prepared) {
        if (p.profileId !== priceCompatibility.profileId || p.profileVersion !== priceCompatibility.profileVersion ||
          p.sourceRulesetId !== priceCompatibility.sourceRulesetId || p.sourceRulesetVersion !== priceCompatibility.sourceRulesetVersion) continue;
        if (object(p.content) && Array.isArray(p.content.records) && p.content.records.some((row: unknown) => object(row) && row.fecha_xm === currentDate)) hasReferenceDay = true;
        try {
          readPriceReferenceDay(p, target, rule);
          eligiblePreparedDatasetIds.push(p.id);
        } catch (error) {
          if (!(error instanceof ForecastError) || !['FORECAST_DATA_INSUFFICIENT', 'PREPARED_DATASET_INCONSISTENT'].includes(error.code)) throw error;
        }
      }
      if (eligiblePreparedDatasetIds.length > 0) eligibleFutureTargetDates.push(target);
      availabilityReason = hasReferenceDay ? 'INCOMPLETE_SOURCE_DAY' : latestObservationDate < currentDate ? 'SOURCE_DATA_STALE' : 'NO_BUILDABLE_ORIGIN';
    }
    if (eligibleFutureTargetDates.length > 0) availabilityReason = 'AVAILABLE';
    const modelMinTargetDate = calendarNextDate(demandOrigin ?? latestObservationDate); const modelMaxTargetDate = addDays(demandOrigin ?? latestObservationDate, supportedHorizonDays);
    const effectiveFutureMinDate = eligibleFutureTargetDates[0] ?? null; const effectiveFutureMaxDate = eligibleFutureTargetDates.at(-1) ?? null;
    return { series: metric, currentDate, latestObservationDate, latestReceivedDate: coverage.latestReceivedDate, latestIndividuallyUsableDate: latestObservationDate, semanticExcludedDates: [...coverage.semanticExcludedDates], modelMaxHorizonDays: supportedHorizonDays, productMaxHorizonDays, candidateFutureTargetDates, availabilityReason, ...(metric === 'PrecBolsNaci' ? { eligiblePreparedDatasetIds: eligiblePreparedDatasetIds.sort((a, b) => a - b) } : {}), eligibleFutureTargetDates, nextForecastDate: effectiveFutureMinDate ?? (metric === 'DemaSIN' && currentDate >= latestObservationDate ? calendarNextDate(currentDate) : modelMinTargetDate), supportedHorizonDays, ...(metric === 'DemaSIN' ? { supportedHorizonMinDays: 1 as const, supportedHorizonMaxDays: 6 as const } : {}), modelMinTargetDate, modelMaxTargetDate, effectiveFutureMinDate, effectiveFutureMaxDate, hasFutureForecastWindow: eligibleFutureTargetDates.length > 0, dataFreshnessDays: Math.max(0, Math.floor((Date.parse(`${currentDate}T00:00:00Z`) - Date.parse(`${latestObservationDate}T00:00:00Z`)) / 86_400_000)) };
  }

  async function availableUntil(metric: XmSyncMetric, nextDate: string, today: string) {
    for (let candidate = today; candidate >= nextDate; candidate = addDays(candidate, -1)) {
      const result = await dependencies.query({ provider: 'xm', dataset: metric, startDate: candidate, endDate: candidate });
      if (completeDay(metric, candidate, result.records)) return candidate;
    }
    return null;
  }

  async function syncMetric(metric: XmSyncMetric): Promise<XmMetricSyncResult> {
    try {
      const coverage = await dependencies.readCoverage(metric);
      if (!coverage) throw new XmDailySyncError(404, 'XM_SYNC_COVERAGE_MISSING', 'No existe cobertura XM consolidada para la métrica.');
      const today = localCalendarDate(dependencies.now());
      const nextDate = addDays(coverage.persistedUntil, 1);
      const publishedUntil = nextDate > today ? coverage.persistedUntil : await availableUntil(metric, nextDate, today);
      if (!publishedUntil || publishedUntil <= coverage.persistedUntil) {
        return { metric, status: 'up_to_date', previousPersistedUntil: coverage.persistedUntil, availableUntil: coverage.persistedUntil, providerAvailableUntil: coverage.persistedUntil, persistedUntil: coverage.persistedUntil, latestIndividuallyUsableDate: coverage.latestIndividuallyUsableDate, semanticExcludedDates: [...coverage.semanticExcludedDates], synchronizedUntil: coverage.persistedUntil, windowsCreatedOrReused: [] };
      }
      const imported: SyncWindow[] = [];
      for (const range of windows(nextDate, publishedUntil)) {
        const saved = await dependencies.ingest({ metric, ...range });
        imported.push({ ...range, ...saved });
      }
      const consolidated = await dependencies.materialize({ metric, from: coverage.historicalFrom, to: publishedUntil });
      const validation = await dependencies.validate(consolidated.energyDatasetId);
      if (!validation.canProceed) {
        return { metric, status: 'validation_rejected', previousPersistedUntil: coverage.persistedUntil, availableUntil: publishedUntil, synchronizedUntil: publishedUntil,
          providerAvailableUntil: publishedUntil, persistedUntil: publishedUntil, latestIndividuallyUsableDate: validation.semanticValidation?.latestIndividuallyUsableDate ?? coverage.latestIndividuallyUsableDate, semanticExcludedDates: validation.semanticValidation?.semanticExcludedDates ?? coverage.semanticExcludedDates,
          windowsCreatedOrReused: imported, consolidatedDatasetId: consolidated.consolidatedDatasetId, energyDatasetId: consolidated.energyDatasetId, validationStatus: validation.status };
      }
      const prepared = await dependencies.prepare(consolidated.energyDatasetId);
      return { metric, status: 'synchronized', previousPersistedUntil: coverage.persistedUntil, availableUntil: publishedUntil, synchronizedUntil: publishedUntil,
        providerAvailableUntil: publishedUntil, persistedUntil: publishedUntil, latestIndividuallyUsableDate: validation.semanticValidation?.latestIndividuallyUsableDate ?? publishedUntil, semanticExcludedDates: validation.semanticValidation?.semanticExcludedDates ?? [],
        windowsCreatedOrReused: imported, consolidatedDatasetId: consolidated.consolidatedDatasetId, energyDatasetId: consolidated.energyDatasetId,
        preparedDatasetId: prepared.preparedDatasetId, validationStatus: validation.status, preparationProfile: { id: prepared.profileId, version: prepared.profileVersion } };
    } catch (error) { return failure(metric, error); }
  }

  return {
    availability: async () => {
      const results = await Promise.allSettled(metrics.map(availability));
      return results.map((result, index): ForecastAvailabilityResult => {
        if (result.status === 'fulfilled') return result.value;
        const error: unknown = result.reason;
        const metric = metrics[index]!;
        const isMissing = error instanceof XmDailySyncError && error.code === 'XM_SYNC_COVERAGE_MISSING';
        const isMetricError = error instanceof ForecastError && [
          'PREPARED_DATASET_INCONSISTENT', 'FORECAST_DATA_INSUFFICIENT',
          'FORECAST_SEMANTIC_DATA_UNAVAILABLE', 'FORECAST_MODEL_INCOMPATIBLE',
        ].includes(error.code);
        if (!isMissing && !isMetricError && !(error instanceof ForecastCoverageError)) throw error;
        const currentDate = metric === 'DemaSIN' ? demandV5CalendarDate(dependencies.now()) : localCalendarDate(dependencies.now());
        const horizon = metric === 'Gene' ? 7 : metric === 'DemaSIN' ? 6 : 1;
        return { series: metric, currentDate, latestObservationDate: null, latestReceivedDate: null,
          latestIndividuallyUsableDate: null, semanticExcludedDates: [], modelMaxHorizonDays: horizon,
          productMaxHorizonDays, candidateFutureTargetDates: candidateFutureDates(currentDate, horizon),
          availabilityReason: error.code === 'FORECAST_MODEL_INCOMPATIBLE' ? 'MODEL_HORIZON_LIMIT' : 'NO_BUILDABLE_ORIGIN',
          availabilityError: { code: error.code, message: error.message },
          ...(metric === 'PrecBolsNaci' ? { eligiblePreparedDatasetIds: [] } : {}),
          eligibleFutureTargetDates: [], nextForecastDate: null, supportedHorizonDays: horizon,
          ...(metric === 'DemaSIN' ? { supportedHorizonMinDays: 1, supportedHorizonMaxDays: 6 } : {}),
          modelMinTargetDate: null, modelMaxTargetDate: null, effectiveFutureMinDate: null, effectiveFutureMaxDate: null,
          hasFutureForecastWindow: false, dataFreshnessDays: null };
      });
    },
    sync: async (metric?: XmSyncMetric) => {
      if (running) return { metrics: (metric ? [metric] : metrics).map(current => ({ metric: current, status: 'failed' as const, error: { code: 'XM_SYNC_IN_PROGRESS', message: 'La sincronización XM ya está en ejecución.' } })) };
      running = true;
      const results: XmMetricSyncResult[] = [];
      try { for (const current of metric ? [metric] : metrics) results.push(await syncMetric(current)); return { metrics: results }; } finally { running = false; }
    },
  };
}

export const xmDailySyncService = createXmDailySyncService();
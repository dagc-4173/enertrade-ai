import { isDeepStrictEqual } from 'node:util';
import { addDays } from '@/experiments/hu06-multihorizon';
import { mergeDemandPrepared, type Prepared } from './demand-direct-forecast.service';
import { buildRuntimeDemandV5Features, demandV5CalendarDate } from './demand-v5-features';
import { ForecastError } from './forecast.contract';
import type { XmCoverage } from './xm-coverage.service';

export function resolveDemandV5Origin(coverage: XmCoverage, prepared: Prepared[], now: Date) {
  const merged = mergeDemandPrepared(prepared);
  const consolidated = coverage.demandObservations;
  if (!consolidated?.length) return null;
  const records = [...merged.values].filter(([date]) => date <= coverage.latestReceivedDate).sort(([left], [right]) => left.localeCompare(right)).map(([fecha_xm, demanda_kwh]) => ({ fecha_xm, demanda_kwh }));
  const observations = consolidated.filter(row => row.date <= coverage.latestReceivedDate).sort((left, right) => left.date.localeCompare(right.date)).map(row => ({ fecha_xm: row.date, demanda_kwh: row.value }));
  for (const row of observations) {
    const preparedValue = merged.values.get(row.fecha_xm);
    if (preparedValue !== undefined && preparedValue !== row.demanda_kwh) throw new ForecastError(409, 'PREPARED_DATASET_INCONSISTENT');
  }
  const today = demandV5CalendarDate(now);
  for (const origin of observations.map(row => row.fecha_xm).filter(date => date < today).sort().reverse()) {
    const target = addDays(origin, 1);
    const preparedFeatures = buildRuntimeDemandV5Features(records, origin, target, 1);
    const consolidatedFeatures = buildRuntimeDemandV5Features(observations, origin, target, 1);
    if (!preparedFeatures || !consolidatedFeatures) continue;
    if (!isDeepStrictEqual(preparedFeatures, consolidatedFeatures)) throw new ForecastError(409, 'PREPARED_DATASET_INCONSISTENT');
    const sourceArtifacts = [...new Set(preparedFeatures.featureDates.flatMap(date => [...merged.owners.get(date) ?? []]))].sort((left, right) => left - right)
      .map(preparedDatasetId => ({ preparedDatasetId, sourceDatasetId: merged.sources.get(preparedDatasetId)! }));
    return { forecastOriginDate: origin, records, constructibility: preparedFeatures, sourceArtifacts };
  }
  return null;
}

export type DemandV5Origin = NonNullable<ReturnType<typeof resolveDemandV5Origin>>;

export function buildResolvedDemandV5Target(origin: DemandV5Origin, targetDate: string) {
  const horizonDays = (Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${origin.forecastOriginDate}T00:00:00Z`)) / 86_400_000;
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 6) throw new ForecastError(422, 'FORECAST_HORIZON_NOT_SUPPORTED', 'Los modelos experimentales de Demanda admiten hasta 6 días de horizonte.');
  const built = buildRuntimeDemandV5Features(origin.records, origin.forecastOriginDate, targetDate, horizonDays);
  if (!built || built.values.length !== 16 || built.featureDates.some(date => date > origin.forecastOriginDate)) throw new ForecastError(422, 'FORECAST_SEMANTIC_DATA_UNAVAILABLE');
  return built;
}
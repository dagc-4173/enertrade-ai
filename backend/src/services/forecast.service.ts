import { prisma } from '@/lib/prisma';
import { loadDirectSupplyModel, type DirectSupplyModel } from '@/models/xm-gene-ridge-direct-v2/model-loader';
import { buildDirectSupplyFeatures, offsetDate } from '@/models/xm-gene-ridge-direct-v2/features';
import { calendarDate, ForecastError, object } from './forecast.contract';
import { readXmCoverage, type XmCoverage } from './xm-coverage.service';
type StoredPrepared = { id: number; sourceDatasetId: number; profileId: string; profileVersion: string; sourceRulesetId: string; sourceRulesetVersion: string; content: unknown };
type CompatibilityCriteria = { profileId: string; profileVersion: string; sourceRulesetId: string; sourceRulesetVersion: string };
type RuntimeModel = Pick<DirectSupplyModel, 'modelId' | 'modelVersion' | 'horizonDays' | 'coefficients' | 'intercept' | 'scaler'>;
type RuntimeFeatures = { values: number[]; sourceObservations: { date: string; period: number }[] };
type FeatureBuilder = (read: (date: string, period: number) => number | undefined, origin: string, targetDate: string, period: number) => RuntimeFeatures | null;
function displayDate(value: string) { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}`; }
const dayDifference = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
export function createForecastService(readCompatible: (criteria: CompatibilityCriteria) => Promise<StoredPrepared[]>, model: (horizonDays: number) => RuntimeModel = loadDirectSupplyModel, readCoverage: () => Promise<XmCoverage | null> = () => readXmCoverage('Gene'), featureBuilder: FeatureBuilder = buildDirectSupplyFeatures) {
  return async (input: unknown) => {
    if (!object(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'targetDate') || !calendarDate(input.targetDate)) throw new ForecastError(400, 'INVALID_FORECAST_REQUEST');
    const coverage = await readCoverage();
    if (!coverage) throw new ForecastError(422, 'FORECAST_DATA_INSUFFICIENT');
    const forecastOriginDate = coverage.persistedUntil, horizonDays = dayDifference(forecastOriginDate, input.targetDate);
    if (!Number.isInteger(horizonDays) || horizonDays <= 0) throw new ForecastError(422, 'FORECAST_DATE_NOT_SUPPORTED');
    if (horizonDays > 7) {
      throw new ForecastError(422, 'FORECAST_HORIZON_NOT_SUPPORTED', `Los modelos experimentales de Oferta admiten hasta 7 días de horizonte. La última observación disponible es ${displayDate(forecastOriginDate)}. El rango pronosticable actual es ${displayDate(offsetDate(forecastOriginDate, 1))} a ${displayDate(offsetDate(forecastOriginDate, 7))}.`);
    }
    const m = model(horizonDays);
    if (m.horizonDays !== horizonDays) throw new ForecastError(409, 'FORECAST_MODEL_INCOMPATIBLE');
    const compatibility = { profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0' };
    const rows = await readCompatible(compatibility);
    const bad = (): never => { throw new ForecastError(409, 'PREPARED_DATASET_INCONSISTENT'); };
    const expected = [{name:'fecha_xm',type:'string',representation:'YYYY-MM-DD'}, {name:'hora_xm',type:'number',representation:'integer 1..24'}, {name:'energia_kwh',type:'number',unit:'kWh'}];
    // Global merge across every compatible artifact; equal duplicates collapse, conflicting duplicates abort deterministically.
    const values = new Map<string, number>();
    const owners = new Map<string, Set<number>>();
    const sourceDatasetById = new Map<number, number>();
    for (const p of rows) {
      if (p.profileId !== compatibility.profileId || p.profileVersion !== compatibility.profileVersion || p.sourceRulesetId !== compatibility.sourceRulesetId || p.sourceRulesetVersion !== compatibility.sourceRulesetVersion) continue;
      const c = p.content;
      if (!object(c) || !object(c.variables) || !Array.isArray(c.variables.minimum) || !Array.isArray(c.records)) return bad();
      if (c.variables.minimum.length !== 3 || expected.some(v => c.variables.minimum.filter((x: unknown) => object(x) && Object.entries(v).every(([k,value]) => x[k] === value)).length !== 1)) return bad();
      sourceDatasetById.set(p.id, p.sourceDatasetId);
      const seenInArtifact = new Set<string>();
      for (const r of c.records) {
        if (!object(r) || !calendarDate(r.fecha_xm) || !Number.isInteger(r.hora_xm) || r.hora_xm < 1 || r.hora_xm > 24 || typeof r.energia_kwh !== 'number' || !Number.isFinite(r.energia_kwh)) return bad();
        const key = `${r.fecha_xm}|${r.hora_xm}`;
        if (seenInArtifact.has(key)) return bad();
        seenInArtifact.add(key);
        const existing = values.get(key);
        if (existing !== undefined && existing !== r.energia_kwh) return bad();
        values.set(key, r.energia_kwh);
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key)!.add(p.id);
      }
    }
    const usedArtifactIds = new Set<number>();
    const predictions = Array.from({length:24}, (_,i) => {
      const period = i + 1;
      const built = featureBuilder((date, requestedPeriod) => date <= forecastOriginDate ? values.get(`${date}|${requestedPeriod}`) : undefined, forecastOriginDate, input.targetDate, period);
      if (!built) throw new ForecastError(422, 'FORECAST_DATA_INSUFFICIENT');
      if (built.sourceObservations.some(observation => observation.date > forecastOriginDate)) throw new ForecastError(409, 'PREPARED_DATASET_INCONSISTENT');
      for (const observation of built.sourceObservations) for (const id of owners.get(`${observation.date}|${observation.period}`) ?? []) usedArtifactIds.add(id);
      const energy = m.intercept + built.values.reduce((sum,v,j) => sum + m.coefficients[j]! * ((v-m.scaler.means[j]!)/m.scaler.standardDeviations[j]!), 0);
      if (!Number.isFinite(energy)) throw new ForecastError(500, 'FORECAST_FAILED');
      return {hora_xm:period, energia_kwh:energy};
    });
    const sourceArtifacts = [...usedArtifactIds].sort((a,b) => a - b).map(preparedDatasetId => ({preparedDatasetId, sourceDatasetId: sourceDatasetById.get(preparedDatasetId)!}));
    return {status:'available' as const, sourceArtifacts, forecastType:'generation_availability_proxy' as const, target:'energia_kwh' as const, unit:'kWh' as const, horizonPeriods:24 as const,
      forecastOriginDate, targetDate:input.targetDate, horizonDays, modelId:m.modelId, modelVersion:m.modelVersion, modelStatus:'experimental' as const, academicValidation:'pending' as const, predictions};
  };
}
export const forecastSupply = createForecastService(criteria => prisma.preparedDataset.findMany({
  where: {profileId: criteria.profileId, profileVersion: criteria.profileVersion, sourceRulesetId: criteria.sourceRulesetId, sourceRulesetVersion: criteria.sourceRulesetVersion},
  select: {id: true, sourceDatasetId: true, profileId: true, profileVersion: true, sourceRulesetId: true, sourceRulesetVersion: true, content: true},
}));

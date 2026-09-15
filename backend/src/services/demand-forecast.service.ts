import { prisma } from '@/lib/prisma';
import { loadModel, type ForecastModel } from '@/models/xm-demandasin-ridge/model-loader';
import { calendarDate, ForecastError, object, previousDate } from './forecast.contract';
type StoredPrepared = { id: number; sourceDatasetId: number; profileId: string; profileVersion: string; sourceRulesetId: string; sourceRulesetVersion: string; content: unknown };
export function createDemandForecastService(read: (id: number) => Promise<StoredPrepared | null>, model: () => ForecastModel = loadModel) {
  return async (input: unknown) => {
    if (!object(input) || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'preparedDatasetId') || !Object.hasOwn(input, 'targetDate') || !Number.isSafeInteger(input.preparedDatasetId) || input.preparedDatasetId <= 0 || input.preparedDatasetId > 2147483647 || !calendarDate(input.targetDate)) throw new ForecastError(400, 'INVALID_FORECAST_REQUEST');
    const m = model();
    if (input.targetDate <= m.trainingSourceRange.end) throw new ForecastError(422, 'FORECAST_DATE_NOT_SUPPORTED');
    const p = await read(input.preparedDatasetId);
    if (!p) throw new ForecastError(404, 'PREPARED_DATASET_NOT_FOUND');
    if (`${p.profileId}@${p.profileVersion}` !== m.compatibleProfile || `${p.sourceRulesetId}@${p.sourceRulesetVersion}` !== m.compatibleRuleset) throw new ForecastError(422, 'FORECAST_PROFILE_NOT_APPLICABLE');
    const bad = () => { throw new ForecastError(409, 'PREPARED_DATASET_INCONSISTENT'); };
    const c = p.content;
    if (!object(c) || !object(c.variables) || !Array.isArray(c.variables.minimum) || !Array.isArray(c.records)) return bad();
    const expected = [{name:'fecha_xm',type:'string',representation:'YYYY-MM-DD'}, {name:'demanda_kwh',type:'number',unit:'kWh'}];
    if (c.variables.minimum.length !== 2 || expected.some(v => c.variables.minimum.filter((x: unknown) => object(x) && Object.entries(v).every(([k,value]) => x[k] === value)).length !== 1)) return bad();
    const values = new Map<string, number>();
    for (const r of c.records) {
      if (!object(r) || !calendarDate(r.fecha_xm) || typeof r.demanda_kwh !== 'number' || !Number.isFinite(r.demanda_kwh)) return bad();
      if (values.has(r.fecha_xm)) return bad(); values.set(r.fecha_xm, r.demanda_kwh);
    }
    const history = [1,7,14,28].map(lag => values.get(previousDate(input.targetDate,lag)));
    if (history.some(v => v === undefined)) throw new ForecastError(422,'FORECAST_DATA_INSUFFICIENT');
    // Calendar weekday only, not an observation timestamp. Monday=0.
    const weekday = (new Date(input.targetDate+'T00:00:00Z').getUTCDay()+6)%7;
    const x = [...history as number[],Math.sin(2*Math.PI*weekday/7),Math.cos(2*Math.PI*weekday/7)];
    const demand = m.intercept + x.reduce((sum,v,j)=>sum+m.coefficients[j]!*((v-m.scaler.means[j]!)/m.scaler.standardDeviations[j]!),0);
    if (!Number.isFinite(demand)) throw new ForecastError(500,'FORECAST_FAILED');
    return {status:'available' as const, preparedDatasetId:p.id, sourceDatasetId:p.sourceDatasetId, forecastType:m.forecastType, target:m.target, unit:m.unit, horizonDays:m.horizonDays, modelId:m.modelId, modelVersion:m.modelVersion, targetDate:input.targetDate, prediction:{demanda_kwh:demand}, confidence:null, confidenceStatus:m.confidence.status};
  };
}
export const forecastDemand = createDemandForecastService(id => prisma.preparedDataset.findUnique({where:{id}}));

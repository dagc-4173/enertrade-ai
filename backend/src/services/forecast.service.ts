import { prisma } from '@/lib/prisma';
import { loadModel, type ForecastModel } from '@/models/xm-gene-ridge/model-loader';
import { calendarDate, ForecastError, object, previousDate } from './forecast.contract';
type StoredPrepared = { id: number; sourceDatasetId: number; profileId: string; profileVersion: string; sourceRulesetId: string; sourceRulesetVersion: string; content: unknown };
export function createForecastService(read: (id: number) => Promise<StoredPrepared | null>, model: () => ForecastModel = loadModel) {
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
    const expected = [{name:'fecha_xm',type:'string',representation:'YYYY-MM-DD'}, {name:'hora_xm',type:'number',representation:'integer 1..24'}, {name:'energia_kwh',type:'number',unit:'kWh'}];
    if (c.variables.minimum.length !== 3 || expected.some(v => c.variables.minimum.filter((x: unknown) => object(x) && Object.entries(v).every(([k,value]) => x[k] === value)).length !== 1)) return bad();
    const values = new Map<string, number>();
    for (const r of c.records) {
      if (!object(r) || !calendarDate(r.fecha_xm) || !Number.isInteger(r.hora_xm) || r.hora_xm < 1 || r.hora_xm > 24 || typeof r.energia_kwh !== 'number' || !Number.isFinite(r.energia_kwh)) return bad();
      const key = `${r.fecha_xm}|${r.hora_xm}`;
      if (values.has(key)) return bad(); values.set(key, r.energia_kwh);
    }
    const d1 = previousDate(input.targetDate, 1), d7 = previousDate(input.targetDate, 7);
    const predictions = Array.from({length:24}, (_,i) => {
      const h = i + 1;
      const history = [values.get(`${d1}|${h}`), values.get(`${d7}|${h}`), values.get(`${d1}|24`)];
      if (history.some(v => v === undefined)) throw new ForecastError(422, 'FORECAST_DATA_INSUFFICIENT');
      const x = [...history as number[], Math.sin(2*Math.PI*i/24), Math.cos(2*Math.PI*i/24)];
      const energy = m.intercept + x.reduce((sum,v,j) => sum + m.coefficients[j]! * ((v-m.scaler.means[j]!)/m.scaler.standardDeviations[j]!), 0);
      if (!Number.isFinite(energy)) throw new ForecastError(500, 'FORECAST_FAILED');
      return {hora_xm:h, energia_kwh:energy};
    });
    return {status:'available' as const, preparedDatasetId:p.id, sourceDatasetId:p.sourceDatasetId, forecastType:m.forecastType, target:m.target, unit:m.unit, horizonPeriods:m.horizonPeriods, modelId:m.modelId, modelVersion:m.modelVersion, targetDate:input.targetDate, predictions};
  };
}
export const forecastSupply = createForecastService(id => prisma.preparedDataset.findUnique({where:{id}}));

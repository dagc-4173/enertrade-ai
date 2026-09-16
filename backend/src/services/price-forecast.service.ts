import { prisma } from '@/lib/prisma';
import { loadRule, type PriceRule } from '@/models/xm-preciobolsnaci-b1/rule-loader';
import { calendarDate, ForecastError, object, previousDate } from './forecast.contract';

type PreparedPrice = {
  id: number; sourceDatasetId: number; profileId: string; profileVersion: string;
  sourceRulesetId: string; sourceRulesetVersion: string; content: unknown;
};

export type PriceForecastContext = {
  targetDate?: string;
  preparedDatasetId?: number;
  rule?: { id: string; version: string; type: string };
  inputSnapshot?: {
    sourceDatasetId: number; preparedDatasetId: number; referenceDate: string;
    values: { sourceRecordIndex: number; periodo: number; precio_cop_kwh: number }[];
  };
};

export function createPriceForecastService(
  read: (id: number) => Promise<PreparedPrice | null>, rule: () => PriceRule = loadRule,
) {
  return async (input: unknown, context?: PriceForecastContext) => {
    if (!object(input) || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'preparedDatasetId') ||
      !Object.hasOwn(input, 'targetDate') || !Number.isSafeInteger(input.preparedDatasetId) ||
      input.preparedDatasetId <= 0 || input.preparedDatasetId > 2147483647) throw new ForecastError(400, 'INVALID_FORECAST_REQUEST');
    if (!calendarDate(input.targetDate)) throw new ForecastError(422, 'INVALID_FORECAST_DATE');
    if (context) context.targetDate = input.targetDate;
    const r = rule();
    if (context) context.rule = { id: r.ruleId, version: r.ruleVersion, type: r.type };
    const p = await read(input.preparedDatasetId);
    if (!p) throw new ForecastError(404, 'PREPARED_DATASET_NOT_FOUND');
    if (context) context.preparedDatasetId = p.id;
    if (p.profileId !== r.sourceProfileId || p.profileVersion !== r.sourceProfileVersion ||
      p.sourceRulesetId !== r.sourceRulesetId || p.sourceRulesetVersion !== r.sourceRulesetVersion) throw new ForecastError(422, 'FORECAST_PROFILE_NOT_APPLICABLE');
    const bad = (): never => { throw new ForecastError(409, 'PREPARED_DATASET_INCONSISTENT'); };
    const c = p.content;
    if (!object(c) || !object(c.variables) || !Array.isArray(c.variables.minimum) || !Array.isArray(c.records)) return bad();
    const expected = [
      { name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' },
      { name: 'periodo', type: 'number', representation: 'integer 1..24' },
      { name: 'precio_cop_kwh', type: 'number', unit: 'COP/kWh' },
    ];
    if (c.variables.minimum.length !== 3 || expected.some(v => c.variables.minimum.filter((x: unknown) =>
      object(x) && Object.entries(v).every(([k, value]) => x[k] === value)).length !== 1)) return bad();
    const previous = previousDate(input.targetDate, 1);
    const prices = new Map<number, number>();
    const values: NonNullable<PriceForecastContext['inputSnapshot']>['values'] = [];
    for (const row of c.records) {
      if (!object(row) || !calendarDate(row.fecha_xm)) return bad();
      // Only D-1 prices are inspected or projected. Other dates cannot supply a fallback.
      if (row.fecha_xm !== previous) continue;
      if (!Number.isInteger(row.periodo) || row.periodo < 1 || row.periodo > 24 ||
        typeof row.precio_cop_kwh !== 'number' || !Number.isFinite(row.precio_cop_kwh) ||
        !Number.isSafeInteger(row.sourceRecordIndex) || row.sourceRecordIndex < 0 || prices.has(row.periodo)) return bad();
      prices.set(row.periodo, row.precio_cop_kwh);
      values.push({ sourceRecordIndex: row.sourceRecordIndex, periodo: row.periodo, precio_cop_kwh: row.precio_cop_kwh });
    }
    if (prices.size !== 24) throw new ForecastError(422, 'FORECAST_DATA_INSUFFICIENT');
    if (context) context.inputSnapshot = {
      sourceDatasetId: p.sourceDatasetId, preparedDatasetId: p.id, referenceDate: previous,
      values: values.sort((a, b) => a.periodo - b.periodo),
    };
    return {
      status: 'available' as const, preparedDatasetId: p.id, sourceDatasetId: p.sourceDatasetId,
      forecastType: r.forecastType, target: r.target, unit: r.unit, granularity: r.granularity,
      horizonDays: r.horizonDays,
      rule: { id: r.ruleId, version: r.ruleVersion, type: r.type, description: r.description },
      targetDate: input.targetDate,
      predictions: Array.from({ length: 24 }, (_, i) => ({ periodo: i + 1, precio_cop_kwh: prices.get(i + 1)! })),
      factors: r.factors, scope: r.scope,
    };
  };
}

export const forecastPrice = createPriceForecastService(id => prisma.preparedDataset.findUnique({ where: { id } }));

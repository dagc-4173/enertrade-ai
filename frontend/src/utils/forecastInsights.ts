export type ForecastRow = { period: number; value: number; low?: number; high?: number };
export function summarizeForecast(rows: ForecastRow[], unit: string) {
  if (!rows.length || rows.some(r => !Number.isFinite(r.value))) return null;
  const sum = rows.reduce((s, r) => s + r.value, 0);
  return { primary: unit === 'COP/kWh' ? sum / rows.length : sum, primaryLabel: unit === 'COP/kWh' ? 'Precio promedio del día' : 'Energía total estimada del día', minimum: Math.min(...rows.map(r => r.value)), maximum: Math.max(...rows.map(r => r.value)), count: rows.length };
}
export function compareForecast(rows: ForecastRow[], actual: { period: number; value: number }[]) {
  const observed = new Map(actual.map(r => [r.period, r.value]));
  if (!rows.length || observed.size !== actual.length || rows.length !== actual.length || rows.some(r => !observed.has(r.period))) return null;
  const pairs = rows.map(r => { const real = observed.get(r.period)!; return { ...r, actual: real, error: r.value - real, absoluteError: Math.abs(r.value - real) }; });
  if (pairs.some(r => !Number.isFinite(r.error))) return null;
  const mae = pairs.reduce((s, r) => s + r.absoluteError, 0) / pairs.length;
  const denominator = pairs.reduce((s, r) => s + Math.abs(r.actual), 0);
  return { pairs, MAE: mae, RMSE: Math.sqrt(pairs.reduce((s, r) => s + r.error ** 2, 0) / pairs.length), bias: pairs.reduce((s, r) => s + r.error, 0) / pairs.length, WAPE: denominator === 0 ? null : pairs.reduce((s, r) => s + r.absoluteError, 0) / denominator * 100 };
}
export function xmPeriodLabel(period: number) {
  return `${String(period - 1).padStart(2, '0')}:00–${period === 24 ? '00:00 (+1 día)' : `${String(period).padStart(2, '0')}:00`}`;
}

export const patternMethod = { id: 'energy-pattern-descriptive', version: '1.0.0', type: 'deterministic-statistical' } as const;

export type PatternStatus = 'completed' | 'partial' | 'no_results';
export type PatternType = 'trend' | 'recurrence' | 'distribution';
export type Pattern = { type: PatternType; metrics: Record<string, unknown>; description: string };
export type PatternAnalysisTechnicalResult = {
  status: PatternStatus;
  dataType: 'generacion' | 'demanda' | 'precios';
  variable: 'energia_kwh' | 'demanda_kwh' | 'precio_cop_kwh';
  period: { from: string | null; to: string | null };
  sampleSize: number;
  method: typeof patternMethod;
  patterns: Pattern[];
  warnings: string[];
};

export class PatternAnalysisError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

type Profile = {
  profileId: string;
  profileVersion: string;
  sourceRulesetId: string;
  sourceRulesetVersion: string;
  dataType: PatternAnalysisTechnicalResult['dataType'];
  variable: PatternAnalysisTechnicalResult['variable'];
  periodField?: 'hora_xm' | 'periodo';
};

type RecordValue = { fecha_xm: string; value: number; period?: number };
type PreparedDatasetLike = { profileId: string; profileVersion: string; sourceRulesetId: string; sourceRulesetVersion: string; content: unknown };

const profiles: Profile[] = [
  { profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', dataType: 'generacion', variable: 'energia_kwh', periodField: 'hora_xm' },
  { profileId: 'xm_demandasin_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_demandasin_base', sourceRulesetVersion: '1.0.0', dataType: 'demanda', variable: 'demanda_kwh' },
  { profileId: 'xm_preciobolsnaci_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_preciobolsnaci_base', sourceRulesetVersion: '1.0.0', dataType: 'precios', variable: 'precio_cop_kwh', periodField: 'periodo' },
];

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function profileFor(dataset: PreparedDatasetLike): Profile {
  const profile = profiles.find(candidate => candidate.profileId === dataset.profileId && candidate.profileVersion === dataset.profileVersion &&
    candidate.sourceRulesetId === dataset.sourceRulesetId && candidate.sourceRulesetVersion === dataset.sourceRulesetVersion);
  if (!profile) throw new PatternAnalysisError(422, 'PATTERN_PROFILE_NOT_APPLICABLE', 'El perfil del dataset preparado no es compatible con el análisis de patrones.');
  return profile;
}

function recordsFor(content: unknown, profile: Profile): RecordValue[] {
  if (!object(content) || !Array.isArray(content.records)) {
    throw new PatternAnalysisError(409, 'PREPARED_DATASET_INCONSISTENT', 'El contenido del dataset preparado es inconsistente.');
  }
  return content.records.map((record, index) => {
    if (!object(record) || typeof record.fecha_xm !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.fecha_xm) ||
      typeof record[profile.variable] !== 'number' || !Number.isFinite(record[profile.variable])) {
      throw new PatternAnalysisError(409, 'PREPARED_DATASET_INCONSISTENT', 'El contenido del dataset preparado es inconsistente.');
    }
    const rawPeriod = profile.periodField === undefined ? undefined : record[profile.periodField];
    if (profile.periodField !== undefined && (typeof rawPeriod !== 'number' || !Number.isInteger(rawPeriod) || rawPeriod < 1 || rawPeriod > 24)) {
      throw new PatternAnalysisError(409, 'PREPARED_DATASET_INCONSISTENT', 'El contenido del dataset preparado es inconsistente.');
    }
    const period = rawPeriod as number | undefined;
    return { fecha_xm: record.fecha_xm, value: record[profile.variable] as number, ...(period === undefined ? {} : { period }) };
  }).sort((left, right) => left.fecha_xm.localeCompare(right.fecha_xm) || (left.period ?? 0) - (right.period ?? 0));
}

function sum(values: number[]): number {
  let total = 0;
  let compensation = 0;
  for (const value of values) {
    const adjusted = value - compensation;
    const next = total + adjusted;
    compensation = (next - total) - adjusted;
    total = next;
  }
  return total;
}

function distribution(values: number[]): Pattern {
  const ordered = [...values].sort((left, right) => left - right);
  const count = values.length;
  const mean = sum(values) / count;
  const middle = Math.floor(count / 2);
  const median = count % 2 === 0 ? (ordered[middle - 1]! + ordered[middle]!) / 2 : ordered[middle]!;
  const standardDeviation = count < 2 ? 0 : Math.sqrt(sum(values.map(value => (value - mean) ** 2)) / (count - 1));
  return {
    type: 'distribution',
    metrics: { count, min: ordered[0]!, max: ordered[count - 1]!, mean, median, standardDeviation },
    description: `Distribución de ${count} observaciones: mínimo ${ordered[0]}, máximo ${ordered[count - 1]} y media ${mean}.`,
  };
}

function trend(values: number[]): Pattern {
  const count = values.length;
  const meanIndex = (count - 1) / 2;
  const meanValue = sum(values) / count;
  const numerator = sum(values.map((value, index) => (index - meanIndex) * (value - meanValue)));
  const denominator = sum(Array.from({ length: count }, (_, index) => (index - meanIndex) ** 2));
  const slope = numerator / denominator;
  const scale = Math.max(...values.map(value => Math.abs(value)), 1);
  const direction = Math.abs(slope) <= scale * 1e-12 ? 'stable' : slope > 0 ? 'increasing' : 'decreasing';
  return { type: 'trend', metrics: { slope, direction, stableThreshold: scale * 1e-12 }, description: `Tendencia ${direction} con pendiente ${slope} por observación ordenada.` };
}

function weekday(date: string): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

function recurrence(records: RecordValue[], profile: Profile): Pattern | null {
  const groups = new Map<string, number[]>();
  for (const record of records) {
    const key = profile.periodField === undefined ? weekday(record.fecha_xm) : String(record.period);
    groups.set(key, [...(groups.get(key) ?? []), record.value]);
  }
  const orderedKeys = profile.periodField === undefined
    ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    : Array.from({ length: 24 }, (_, index) => String(index + 1));
  const periods = orderedKeys.flatMap(key => {
    const values = groups.get(key) ?? [];
    return values.length >= 2 ? [{ key, count: values.length, mean: sum(values) / values.length, min: Math.min(...values), max: Math.max(...values) }] : [];
  });
  if (periods.length === 0) return null;
  const label = profile.periodField === undefined ? 'día de semana' : 'período horario';
  return { type: 'recurrence', metrics: { grouping: profile.periodField === undefined ? 'Monday-Sunday' : '1-24', periods }, description: `Recurrencia descriptiva por ${label} en ${periods.length} grupos con al menos dos observaciones.` };
}

export function analyzePreparedDataset(dataset: PreparedDatasetLike): PatternAnalysisTechnicalResult {
  const profile = profileFor(dataset);
  const records = recordsFor(dataset.content, profile);
  const period = records.length === 0 ? { from: null, to: null } : { from: records[0]!.fecha_xm, to: records[records.length - 1]!.fecha_xm };
  if (records.length === 0) return { status: 'no_results', dataType: profile.dataType, variable: profile.variable, period, sampleSize: 0, method: patternMethod, patterns: [], warnings: ['El dataset preparado no contiene observaciones para analizar.'] };
  const values = records.map(record => record.value);
  const patterns: Pattern[] = [distribution(values)];
  const warnings: string[] = [];
  if (records.length >= 2) patterns.push(trend(values));
  else warnings.push('La tendencia requiere al menos dos observaciones.');
  const recurring = recurrence(records, profile);
  if (recurring) patterns.push(recurring);
  else warnings.push('No hay grupos de recurrencia con al menos dos observaciones.');
  return { status: warnings.length === 0 ? 'completed' : 'partial', dataType: profile.dataType, variable: profile.variable, period, sampleSize: records.length, method: patternMethod, patterns, warnings };
}
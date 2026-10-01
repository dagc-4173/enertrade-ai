import type { Issue } from './dataset-validation.rules';
import { demandSemanticRule, evaluateDemandObservationEligibility } from './demand-semantic-eligibility';

export type XmDemaSinIssue = Omit<Issue, 'code' | 'severity'> & {
  code: 'CRITICAL_VALUE_MISSING' | 'CRITICAL_TYPE_MISMATCH' |
    'INVALID_XM_DATE' | 'DUPLICATE_XM_DATE' | 'WARNING_SEMANTIC_ANOMALY';
  severity: 'error' | 'warning';
  date?: string;
  value?: number;
  historicalMedian?: number;
  ratio?: number;
  rule?: string;
  historicalWindowDays?: number;
  minimumRatio?: number;
};

export { demandSemanticRule } from './demand-semantic-eligibility';

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  // Solo comprueba el calendario; no atribuye un instante al periodo XM.
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function evaluateXmDemaSin(records: Record<string, unknown>[]) {
  const issues: XmDemaSinIssue[] = [];
  const firstByPeriod = new Map<string, number>();
  records.forEach((record, recordIndex) => {
    const add = (code: Exclude<XmDemaSinIssue['code'], 'WARNING_SEMANTIC_ANOMALY'>, field: string, message: string, relatedRecordIndex?: number) => {
      issues.push({ code, field, message, severity: 'error', recordIndex,
        ...(relatedRecordIndex === undefined ? {} : { relatedRecordIndex }) });
    };
    for (const field of ['fecha_xm', 'demanda_kwh'] as const) {
      const value = record[field];
      if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
        add('CRITICAL_VALUE_MISSING', field, 'Falta un valor crítico.');
      } else if (field === 'fecha_xm' ? typeof value !== 'string' : typeof value !== 'number' || !Number.isFinite(value)) {
        add('CRITICAL_TYPE_MISMATCH', field, 'El valor crítico tiene un tipo incompatible.');
      } else if (field === 'fecha_xm' && !validDate(value as string)) {
        add('INVALID_XM_DATE', field, 'La fecha XM debe ser una fecha calendario válida en formato YYYY-MM-DD.');

      }
    }
    if (typeof record.fecha_xm === 'string' && validDate(record.fecha_xm)) {
      const first = firstByPeriod.get(record.fecha_xm);
      if (first !== undefined) add('DUPLICATE_XM_DATE', 'fecha_xm', 'La fecha XM está repetida.', first);
      else firstByPeriod.set(record.fecha_xm, recordIndex);
    }
  });

  const valid = records.map((record, recordIndex) => ({ record, recordIndex }))
    .filter(({ record }) => typeof record.fecha_xm === 'string' && validDate(record.fecha_xm) && typeof record.demanda_kwh === 'number' && Number.isFinite(record.demanda_kwh) && firstByPeriod.get(record.fecha_xm) !== undefined)
    .filter(({ record, recordIndex }) => firstByPeriod.get(record.fecha_xm as string) === recordIndex)
    .sort((left, right) => String(left.record.fecha_xm).localeCompare(String(right.record.fecha_xm)));
  const eligibility = evaluateDemandObservationEligibility(valid.map(item => ({ date: item.record.fecha_xm as string, value: item.record.demanda_kwh as number })));
  for (let index = 0; index < eligibility.length; index++) {
    const item = eligibility[index]!;
    if (item.semanticStatus !== 'SEMANTIC_REVIEW_REQUIRED') continue;
    issues.push({
      code: 'WARNING_SEMANTIC_ANOMALY', severity: 'warning', recordIndex: valid[index]!.recordIndex, field: 'demanda_kwh',
      message: 'La demanda es extremadamente baja frente a la mediana histórica reciente y requiere revisión antes de uso operativo.',
      date: item.date, value: item.value, historicalMedian: item.reference!, ratio: item.ratio!, rule: demandSemanticRule.id,
      historicalWindowDays: Math.min(index, demandSemanticRule.historicalWindowDays), minimumRatio: demandSemanticRule.minimumRatio,
    });
  }
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const status = errorCount ? 'rechazado' : warningCount ? 'advertencia' : 'aprobado';
  const semanticExcludedDates = eligibility.filter(item => item.semanticStatus === 'SEMANTIC_REVIEW_REQUIRED').map(item => item.date);
  const latestIndividuallyUsableDate = eligibility.filter(item => item.semanticStatus === 'USABLE').at(-1)?.date ?? null;
  return { status, report: {
    rulesetId: 'xm_demandasin_base', rulesetVersion: '1.0.0', recordCount: records.length,
    errorCount, warningCount, issues,
    semanticValidation: { status: warningCount ? 'review_required' : 'usable', latestIndividuallyUsableDate, semanticExcludedDates, severeAnomalyCount: warningCount, rule: demandSemanticRule },
  } } as const;
}

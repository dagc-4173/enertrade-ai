import type { Issue } from './dataset-validation.rules';

export type XmDemaSinIssue = Omit<Issue, 'code' | 'severity'> & {
  code: 'CRITICAL_VALUE_MISSING' | 'CRITICAL_TYPE_MISMATCH' |
    'INVALID_XM_DATE' | 'DUPLICATE_XM_DATE';
  severity: 'error';
};

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
    const add = (code: XmDemaSinIssue['code'], field: string, message: string, relatedRecordIndex?: number) => {
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
  return { status: issues.length ? 'rechazado' : 'aprobado', report: {
    rulesetId: 'xm_demandasin_base', rulesetVersion: '1.0.0', recordCount: records.length,
    errorCount: issues.length, warningCount: 0, issues,
  } } as const;
}

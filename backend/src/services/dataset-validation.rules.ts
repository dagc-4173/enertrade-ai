export type Issue = {
  code: 'CRITICAL_VALUE_MISSING' | 'CRITICAL_TYPE_MISMATCH' | 'INVALID_TIMESTAMP' |
    'DUPLICATE_TEMPORAL_IDENTITY' | 'OPTIONAL_VALUE_MISSING' | 'OPTIONAL_TYPE_MISMATCH';
  severity: 'error' | 'warning';
  recordIndex: number;
  field: string;
  message: string;
  relatedRecordIndex?: number;
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// Comprueba el contrato almacenado, sin registrar de nuevo ni transformar datos.
export function hasDatasetStructure(content: unknown): content is {
  columns: { name: string; optional: boolean }[];
  records: Record<string, string | number | boolean | null>[];
} {
  if (!isPlainObject(content) || !Array.isArray(content.columns) || !content.columns.length ||
      !Array.isArray(content.records) || !content.records.length) return false;
  const names = new Set<string>();
  const requiredNames: string[] = [];
  for (const column of content.columns) {
    if (!isPlainObject(column) || typeof column.name !== 'string' || !column.name.trim() ||
        typeof column.optional !== 'boolean' || names.has(column.name)) return false;
    names.add(column.name);
    if (!column.optional) requiredNames.push(column.name);
  }
  return content.records.every(record => isPlainObject(record) &&
    requiredNames.every(name => Object.hasOwn(record, name)) &&
    Object.entries(record).every(([name, value]) => names.has(name) &&
      (value === null || typeof value === 'string' || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)))));
}

export function timestampInstant(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const offsetHour = Number(match[10] ?? 0), offsetMinute = Number(match[11] ?? 0);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 ||
      offsetHour > 23 || offsetMinute > 59) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month - 1]!) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, Number((match[7] ?? '').padEnd(3, '0')));
  const offset = (offsetHour * 60 + offsetMinute) * 60000 * (match[9] === '-' ? -1 : 1);
  return date.getTime() - offset;
}

const missing = (value: unknown) => value === null || (typeof value === 'string' && !value.trim());

export function evaluateGeneration(records: Record<string, unknown>[]) {
  const issues: Issue[] = [];
  const firstByInstant = new Map<number, number>();
  records.forEach((record, recordIndex) => {
    const add = (code: Issue['code'], field: string, severity: Issue['severity'], message: string, relatedRecordIndex?: number) => {
      issues.push({ code, severity, recordIndex, field, message,
        ...(relatedRecordIndex === undefined ? {} : { relatedRecordIndex }) });
    };
    for (const field of ['fecha', 'energia_kwh']) {
      const value = record[field];
      if (missing(value)) {
        add('CRITICAL_VALUE_MISSING', field, 'error', 'Falta un valor crítico.');
      } else if (field === 'energia_kwh' ? typeof value !== 'number' || !Number.isFinite(value) : typeof value !== 'string') {
        add('CRITICAL_TYPE_MISMATCH', field, 'error', 'El valor crítico tiene un tipo incompatible.');
      } else if (field === 'fecha') {
        const instant = timestampInstant(value as string);
        if (instant === null) add('INVALID_TIMESTAMP', field, 'error', 'Fecha u hora inválida para el formato aprobado.');
        else if (firstByInstant.has(instant)) add('DUPLICATE_TEMPORAL_IDENTITY', field, 'error', 'El instante de cierre está repetido.', firstByInstant.get(instant));
        else firstByInstant.set(instant, recordIndex);
      }
    }
    if (!Object.hasOwn(record, 'zona') || missing(record.zona)) {
      add('OPTIONAL_VALUE_MISSING', 'zona', 'warning', 'Falta el valor opcional de zona.');
    } else if (typeof record.zona !== 'string') {
      add('OPTIONAL_TYPE_MISMATCH', 'zona', 'warning', 'La zona debe ser texto cuando tiene valor.');
    }
  });
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const status = errorCount ? 'rechazado' : warningCount ? 'advertencia' : 'aprobado';
  return { status, report: { rulesetId: 'generacion_simulada_base', rulesetVersion: '1.0.0',
    recordCount: records.length, errorCount, warningCount, issues } } as const;
}

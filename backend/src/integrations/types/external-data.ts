export interface ExternalDataset {
  id: string;
  name: string;
  unit: string;
  granularity: 'hourly' | 'daily';
  maxInclusiveDays: number;
  supportsFilters: boolean;
}

export interface ExternalQuery {
  provider: string;
  dataset: string;
  startDate: string;
  endDate: string;
}

export interface ExternalDataResult extends ExternalQuery {
  unit: string;
  granularity: 'hourly' | 'daily';
  // Hora de periodo XM (1..24), sin inventar un timestamp UTC.
  records: { date: string; hour: number | null; value: number }[];
}

export interface ExternalDataProvider {
  readonly id: string;
  readonly name: string;
  listDatasets(): readonly ExternalDataset[];
  query(query: ExternalQuery): Promise<ExternalDataResult>;
}

export class ExternalDataError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ExternalDataError';
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

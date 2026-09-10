import { prisma } from '@/lib/prisma';
import { EnergyDatasetType } from '@/generated/prisma/enums';

type Cell = string | number | boolean | null;
type Column = { name: string; optional: boolean };
type PendingField = { recordIndex: number; field: string; reason: 'empty_optional_field' };

export class DatasetInputError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function invalid(message: string): never {
  throw new DatasetInputError('INVALID_DATASET_FORMAT', message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export async function registerDataset(input: unknown) {
  if (!isObject(input)) invalid('La solicitud debe ser un objeto JSON.');
  for (const field of ['source', 'dataType', 'columns', 'records']) {
    if (!Object.hasOwn(input, field)) {
      throw new DatasetInputError('MISSING_REQUIRED_FIELD', `Falta el campo ${field}.`);
    }
  }
  if (typeof input.source !== 'string' || !input.source.trim()) {
    invalid('source debe ser un texto no vacío.');
  }
  if (typeof input.dataType !== 'string' ||
      !Object.values(EnergyDatasetType).includes(input.dataType as EnergyDatasetType)) {
    throw new DatasetInputError('UNSUPPORTED_DATA_TYPE', 'dataType no pertenece al catálogo admitido.');
  }
  if (!Array.isArray(input.columns) || !input.columns.length) invalid('columns debe ser un array no vacío.');
  const names = new Set<string>();
  const columns: Column[] = input.columns.map((column: unknown) => {
    if (!isObject(column) || typeof column.name !== 'string' || !column.name.trim() ||
        typeof column.optional !== 'boolean') invalid('Cada columna debe tener name no vacío y optional booleano.');
    if (names.has(column.name)) invalid('Los nombres de columnas no pueden repetirse.');
    names.add(column.name);
    return { name: column.name, optional: column.optional };
  });
  if (!Array.isArray(input.records) || !input.records.length) invalid('records debe ser un array no vacío.');
  const pendingOptionalFields: PendingField[] = [];
  const records: Record<string, Cell>[] = input.records.map((record: unknown, recordIndex: number) => {
    if (!isObject(record)) invalid('Cada registro debe ser un objeto plano.');
    for (const [field, value] of Object.entries(record)) {
      if (!names.has(field)) invalid('Un registro contiene una columna no declarada.');
      if (!(value === null || typeof value === 'string' || typeof value === 'boolean' ||
            (typeof value === 'number' && Number.isFinite(value)))) {
        invalid('Las celdas solo admiten string, number, boolean o null.');
      }
    }
    for (const column of columns) {
      const present = Object.hasOwn(record, column.name);
      if (!column.optional && !present) {
        throw new DatasetInputError('MISSING_REQUIRED_FIELD', `Falta una columna obligatoria en el registro ${recordIndex}.`);
      }
      const value = record[column.name];
      if (column.optional && (!present || value === null || (typeof value === 'string' && !value.trim()))) {
        pendingOptionalFields.push({ recordIndex, field: column.name, reason: 'empty_optional_field' });
      }
    }
    return record as Record<string, Cell>;
  });
  const dataset = await prisma.energyDataset.create({
    data: {
      source: input.source,
      dataType: input.dataType as EnergyDatasetType,
      content: { columns, records },
      pendingOptionalFields,
    },
    select: { id: true, source: true, dataType: true, uploadedAt: true, status: true, pendingOptionalFields: true },
  });
  return { ...dataset, recordCount: records.length };
}

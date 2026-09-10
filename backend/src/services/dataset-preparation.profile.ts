import { isPlainObject, hasDatasetStructure, timestampInstant } from './dataset-validation.rules';

export class DatasetPreparationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export const profileId = 'generacion_simulada_preparacion_base';
export const profileVersion = '1.0.0';
export const sourceRulesetId = 'generacion_simulada_base';
export const sourceRulesetVersion = '1.0.0';
export function checkContent(content: unknown) {
  if (!isPlainObject(content) || !Array.isArray(content.columns)) throw new DatasetPreparationError(409, 'DATASET_CONTENT_INCONSISTENT', 'El contenido almacenado es inconsistente con la validación.');
  const expected = [['fecha', false], ['energia_kwh', false], ['zona', true]] as const;
  const columns = content.columns;
  if (!expected.every(([name, optional]) => columns.some((c: unknown) => isPlainObject(c) && c.name === name && c.optional === optional))) {
    throw new DatasetPreparationError(422, 'PREPARATION_PROFILE_NOT_APPLICABLE', 'El perfil no aplica a las columnas declaradas.');
  }
  if (!hasDatasetStructure(content)) throw new DatasetPreparationError(409, 'DATASET_CONTENT_INCONSISTENT', 'El contenido almacenado es inconsistente con la validación.');
  return content;
}
export function prepareContent(content: ReturnType<typeof checkContent>) {
  const excludedOptionalContext: { sourceRecordIndex: number; field: string; reason: string }[] = [];
  const records = content.records.map((record, sourceRecordIndex) => {
    const instant = typeof record.fecha === 'string' ? timestampInstant(record.fecha) : null;
    if (instant === null || typeof record.energia_kwh !== 'number' || !Number.isFinite(record.energia_kwh)) {
      throw new DatasetPreparationError(409, 'DATASET_CONTENT_INCONSISTENT', 'El contenido almacenado es inconsistente con la validación.');
    }
    const prepared: {sourceRecordIndex: number; fecha: string; energia_kwh: number; zona?: string} = {
      sourceRecordIndex, fecha: new Date(instant).toISOString(), energia_kwh: record.energia_kwh,
    };
    const zona = record.zona;
    const reason = !Object.hasOwn(record, 'zona') ? 'missing' : zona === null ? 'null' : typeof zona !== 'string' ? 'type_mismatch' : zona === '' ? 'empty' : !zona.trim() ? 'blank' : null;
    if (reason) excludedOptionalContext.push({ sourceRecordIndex, field: 'zona', reason });
    else prepared.zona = zona as string;
    return prepared;
  });
  return {
    content: { variables: {
      minimum: [{name: 'fecha', type: 'string', representation: 'ISO 8601 UTC canonical milliseconds'}, {name: 'energia_kwh', type: 'number', unit: 'kWh'}],
      context: [{name: 'zona', type: 'string', optional: true}],
    }, records },
    transformations: {
      temporalNormalization: {field: 'fecha', target: 'UTC canonical milliseconds', appliedToRecords: records.length},
      variableSelection: {minimum: ['fecha', 'energia_kwh'], optionalContext: ['zona'], unusedColumns: content.columns.map(c => c.name).filter(name => !['fecha', 'energia_kwh', 'zona'].includes(name))},
      excludedOptionalContext, generatedFeatures: [],
    },
  };
}

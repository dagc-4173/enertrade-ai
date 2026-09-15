import { isPlainObject, hasDatasetStructure } from './dataset-validation.rules';
import { evaluateXmDemaSin } from './dataset-validation-xm-demandasin.rules';
import { DatasetPreparationError } from './dataset-preparation.profile';

export const profileId = 'xm_demandasin_preparacion_base';
export const profileVersion = '1.0.0';
export const sourceRulesetId = 'xm_demandasin_base';
export const sourceRulesetVersion = '1.0.0';
const minimum = ['fecha_xm', 'demanda_kwh'];

export function consistentReport(report: unknown, status: string): boolean {
  return status === 'aprobado' && isPlainObject(report) && report.rulesetId === sourceRulesetId &&
    report.rulesetVersion === sourceRulesetVersion && Number.isInteger(report.recordCount) &&
    typeof report.recordCount === 'number' && report.recordCount > 0 && report.errorCount === 0 &&
    report.warningCount === 0 && Array.isArray(report.issues) && report.issues.length === 0;
}

export function checkContent(content: unknown) {
  if (!isPlainObject(content) || !Array.isArray(content.columns)) {
    throw new DatasetPreparationError(409, 'DATASET_CONTENT_INCONSISTENT', 'El contenido almacenado es inconsistente con la validación.');
  }
  const columns = content.columns;
  if (!minimum.every(name => columns.some((column: unknown) => isPlainObject(column) && column.name === name && column.optional === false))) {
    throw new DatasetPreparationError(422, 'PREPARATION_PROFILE_NOT_APPLICABLE', 'El perfil no aplica a las columnas declaradas.');
  }
  if (!hasDatasetStructure(content) || evaluateXmDemaSin(content.records).status !== 'aprobado') {
    throw new DatasetPreparationError(409, 'DATASET_CONTENT_INCONSISTENT', 'El contenido almacenado es inconsistente con la validación.');
  }
  return content;
}

export function prepareContent(content: ReturnType<typeof checkContent>) {
  return {
    content: {
      variables: {
        minimum: [
          { name: 'fecha_xm', type: 'string', representation: 'YYYY-MM-DD' },
          { name: 'demanda_kwh', type: 'number', unit: 'kWh' },
        ],
        context: [],
      },
      records: content.records.map((record, sourceRecordIndex) => ({
        sourceRecordIndex, fecha_xm: record.fecha_xm, demanda_kwh: record.demanda_kwh,
      })),
    },
    transformations: {
      temporalIdentity: { fields: ['fecha_xm'], representation: 'calendar-date', preserved: true },
      variableSelection: { minimum, optionalContext: [], unusedColumns: content.columns.map(column => column.name).filter(name => !minimum.includes(name)) },
      excludedOptionalContext: [], generatedFeatures: [],
    },
  };
}

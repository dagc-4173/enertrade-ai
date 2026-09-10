import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import type { PreparedDataset } from '@/generated/prisma/client';
import { isPlainObject } from './dataset-validation.rules';
import { DatasetPreparationError, checkContent, prepareContent, profileId, profileVersion, sourceRulesetId, sourceRulesetVersion } from './dataset-preparation.profile';
export { DatasetPreparationError } from './dataset-preparation.profile';

function consistentReport(report: unknown, status: string): boolean {
  if (!isPlainObject(report) || report.rulesetId !== sourceRulesetId || report.rulesetVersion !== sourceRulesetVersion ||
      typeof report.recordCount !== 'number' || !Number.isInteger(report.recordCount) || report.recordCount < 1 || report.errorCount !== 0 ||
      typeof report.warningCount !== 'number' || !Number.isInteger(report.warningCount) || report.warningCount < 0 || !Array.isArray(report.issues)) return false;
  if (report.warningCount !== report.issues.length || (status === 'aprobado' ? report.warningCount !== 0 : report.warningCount === 0)) return false;
  const recordCount = report.recordCount;
  return report.issues.every((i: unknown) => isPlainObject(i) && i.severity === 'warning' && typeof i.code === 'string' &&
    ['OPTIONAL_VALUE_MISSING', 'OPTIONAL_TYPE_MISMATCH'].includes(i.code) && i.field === 'zona' &&
    typeof i.recordIndex === 'number' && Number.isInteger(i.recordIndex) && i.recordIndex >= 0 && i.recordIndex < recordCount && typeof i.message === 'string');
}
function expectedCollision(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const meta = error.meta;
  if (meta?.modelName !== undefined && meta.modelName !== 'PreparedDataset') return false;
  // Prisma 7 con driver adapter puede conservar la restricción en la causa.
  const adapter = meta?.driverAdapterError as {cause?: {kind?: string; constraint?: {fields?: unknown; index?: unknown}}} | undefined;
  const cause = adapter?.cause;
  const target = meta?.target ?? (cause?.kind === 'UniqueConstraintViolation' ? cause.constraint?.fields ?? cause.constraint?.index : undefined);
  const fields = ['sourceDatasetId', 'profileId', 'profileVersion'];
  return Array.isArray(target) ? target.length === 3 && fields.every((field, i) => target[i] === field)
    : target === 'PreparedDataset_sourceDatasetId_profileId_profileVersion_key';
}
function response(artifact: PreparedDataset, reused: boolean) {
  if (!isPlainObject(artifact.content) || !Array.isArray(artifact.content.records)) throw new Error('Invalid stored artifact');
  return { datasetId: artifact.sourceDatasetId, preparedDatasetId: artifact.id, profileId: artifact.profileId,
    profileVersion: artifact.profileVersion, preparedAt: artifact.preparedAt, sourceRulesetId: artifact.sourceRulesetId,
    sourceRulesetVersion: artifact.sourceRulesetVersion, recordCount: artifact.content.records.length, reused,
    content: artifact.content, transformations: artifact.transformations };
}
export async function prepareDataset(id: number) {
  const dataset = await prisma.energyDataset.findUnique({where: {id}});
  if (!dataset) throw new DatasetPreparationError(404, 'DATASET_NOT_FOUND', 'Dataset no encontrado.');
  if (dataset.status === 'recibido') throw new DatasetPreparationError(409, 'DATASET_NOT_VALIDATED', 'El dataset debe completar validación antes de prepararse.');
  if (dataset.status === 'rechazado') throw new DatasetPreparationError(422, 'DATASET_REJECTED', 'El dataset contiene errores críticos y no puede prepararse mediante este perfil.');
  if (dataset.dataType !== 'generacion') throw new DatasetPreparationError(422, 'PREPARATION_PROFILE_NOT_APPLICABLE', 'El perfil no aplica al tipo de dataset.');
  if (!dataset.validatedAt || !consistentReport(dataset.validationReport, dataset.status)) throw new DatasetPreparationError(409, 'DATASET_VALIDATION_INCONSISTENT', 'El informe de validación es inconsistente con el perfil.');
  const where = {sourceDatasetId_profileId_profileVersion: {sourceDatasetId: id, profileId, profileVersion}};
  const existing = await prisma.preparedDataset.findUnique({where});
  if (existing) return response(existing, true);
  const content = checkContent(dataset.content);
  if ((dataset.validationReport as {recordCount: number}).recordCount !== content.records.length) throw new DatasetPreparationError(409, 'DATASET_CONTENT_INCONSISTENT', 'El contenido almacenado es inconsistente con la validación.');
  const prepared = prepareContent(content);
  let artifact: PreparedDataset;
  try {
    artifact = await prisma.preparedDataset.create({data: {sourceDatasetId: id, profileId, profileVersion, sourceRulesetId, sourceRulesetVersion, ...prepared}});
  } catch (error) {
    if (!expectedCollision(error)) throw error;
    const winner = await prisma.preparedDataset.findUnique({where});
    if (!winner) throw new Error('Missing concurrent artifact');
    return response(winner, true);
  }
  return response(artifact, false);
}

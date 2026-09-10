import { prisma } from '@/lib/prisma';
import { evaluateGeneration, hasDatasetStructure } from './dataset-validation.rules';

export class DatasetValidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
const notFound = () => new DatasetValidationError(404, 'DATASET_NOT_FOUND', 'Dataset no encontrado.');
const alreadyValidated = () => new DatasetValidationError(409, 'DATASET_ALREADY_VALIDATED', 'El dataset ya tiene una validación completada.');

export async function validateDataset(id: number) {
  const dataset = await prisma.energyDataset.findUnique({ where: { id } });
  if (!dataset) throw notFound();
  if (dataset.status !== 'recibido') throw alreadyValidated();
  if (dataset.dataType !== 'generacion') throw new DatasetValidationError(422, 'RULESET_NOT_APPLICABLE', 'El ruleset no aplica al tipo de dataset.');
  const content = dataset.content;
  if (!hasDatasetStructure(content)) throw new DatasetValidationError(409, 'DATASET_CONTENT_INCOMPATIBLE', 'El contenido almacenado no cumple el contrato de registro.');
  const expected = [['fecha', false], ['energia_kwh', false], ['zona', true]] as const;
  if (!expected.every(([name, optional]) => content.columns.some(column => column.name === name && column.optional === optional))) {
    throw new DatasetValidationError(422, 'RULESET_NOT_APPLICABLE', 'Las columnas no corresponden a la referencia del ruleset.');
  }
  const { status, report } = evaluateGeneration(content.records);
  const validatedAt = new Date();
  const result = await prisma.energyDataset.updateMany({
    where: { id, status: 'recibido' },
    data: { status, validatedAt, validationReport: report },
  });
  if (result.count === 0) {
    const current = await prisma.energyDataset.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw notFound();
    if (current.status !== 'recibido') throw alreadyValidated();
    throw new Error('Validation write did not complete');
  }
  if (result.count !== 1) throw new Error('Unexpected validation write count');
  return { datasetId: id, status, validatedAt, ...report, canProceed: status !== 'rechazado' };
}

import { ApiError, postJson } from './apiClient'
import type { DatasetValidationResult, RegisteredDataset } from '../types/dataset'

// Input remains unknown deliberately: structural/business validation belongs to Express.
export async function registerDataset(input: unknown): Promise<RegisteredDataset> {
  const { status, data } = await postJson<RegisteredDataset>('/datasets', input)
  if (status !== 201 || !data || typeof data.id !== 'number' ||
      typeof data.source !== 'string' || typeof data.dataType !== 'string' ||
      typeof data.uploadedAt !== 'string' || data.status !== 'recibido' ||
      typeof data.recordCount !== 'number' || !Array.isArray(data.pendingOptionalFields) ||
      !data.pendingOptionalFields.every(field => field && typeof field.recordIndex === 'number' &&
        typeof field.field === 'string' && typeof field.reason === 'string')) {
    throw new ApiError('response', 'No se pudo interpretar la confirmación del registro.', status)
  }
  return data
}

export async function validateDataset(datasetId: number): Promise<DatasetValidationResult> {
  // No body or Content-Type: this is the exact Express validation contract.
  const { status, data } = await postJson<DatasetValidationResult>(`/datasets/${datasetId}/validate`)
  // Check the response shape only; never calculate quality or infer canProceed.
  if (status !== 200 || !data || data.datasetId !== datasetId ||
      !['aprobado', 'advertencia', 'rechazado'].includes(data.status) ||
      typeof data.validatedAt !== 'string' || typeof data.canProceed !== 'boolean' ||
      typeof data.recordCount !== 'number' || typeof data.errorCount !== 'number' ||
      typeof data.warningCount !== 'number' || typeof data.rulesetId !== 'string' ||
      typeof data.rulesetVersion !== 'string' || !Array.isArray(data.issues) ||
      !data.issues.every(issue => issue && typeof issue.code === 'string' &&
        ['error', 'warning'].includes(issue.severity) && typeof issue.recordIndex === 'number' &&
        typeof issue.field === 'string' && typeof issue.message === 'string' &&
        (issue.relatedRecordIndex === undefined || typeof issue.relatedRecordIndex === 'number'))) {
    throw new ApiError('response', 'No se pudo interpretar el informe de calidad.', status)
  }
  return data
}

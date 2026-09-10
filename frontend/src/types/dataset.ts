export type DatasetType = 'generacion' | 'consumo' | 'oferta' | 'demanda' | 'precios' | 'transacciones_simuladas'

export interface DatasetRegistrationInput {
  source: string
  dataType: DatasetType
  columns: { name: string; optional: boolean }[]
  records: Record<string, string | number | boolean | null>[]
}

export interface PendingOptionalField {
  recordIndex: number
  field: string
  reason: 'empty_optional_field'
}

export interface RegisteredDataset {
  id: number
  source: string
  dataType: DatasetType
  uploadedAt: string
  status: 'recibido'
  recordCount: number
  pendingOptionalFields: PendingOptionalField[]
}

export type DatasetQualityStatus = 'aprobado' | 'advertencia' | 'rechazado'

export interface DatasetValidationIssue {
  code: 'CRITICAL_VALUE_MISSING' | 'CRITICAL_TYPE_MISMATCH' | 'INVALID_TIMESTAMP' |
    'DUPLICATE_TEMPORAL_IDENTITY' | 'OPTIONAL_VALUE_MISSING' | 'OPTIONAL_TYPE_MISMATCH'
  severity: 'error' | 'warning'
  recordIndex: number
  field: string
  message: string
  relatedRecordIndex?: number
}

export interface DatasetValidationResult {
  datasetId: number
  status: DatasetQualityStatus
  validatedAt: string
  canProceed: boolean
  recordCount: number
  errorCount: number
  warningCount: number
  rulesetId: string
  rulesetVersion: string
  issues: DatasetValidationIssue[]
}

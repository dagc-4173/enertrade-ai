import type { DatasetRegistrationInput } from '../types/dataset'

// Controlled request examples, never used as server results.
export const datasetExample: DatasetRegistrationInput = {
  source: 'Simulación académica HU-01',
  dataType: 'generacion',
  columns: [
    { name: 'fecha', optional: false },
    { name: 'energia_kwh', optional: false },
    { name: 'zona', optional: true },
  ],
  records: [{ fecha: '2026-09-10T12:00:00Z', energia_kwh: 12.5, zona: 'norte' }],
}

export const pendingDatasetExample: DatasetRegistrationInput = {
  ...datasetExample,
  records: [{ ...datasetExample.records[0], zona: null }],
}

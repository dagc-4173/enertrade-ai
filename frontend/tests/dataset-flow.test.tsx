import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import { DatasetRegistration, DatasetRegistrationResult } from '../src/components/datasets/DatasetRegistration'
import { DatasetFlowSummary, DatasetValidation, DatasetValidationContent, type PreparationState, type ValidationState } from '../src/components/datasets/DatasetValidation'
import { registerDataset, validateDataset } from '../src/services/datasetService'
import type { DatasetValidationResult, PreparedDatasetResult, RegisteredDataset } from '../src/types/dataset'

// INICIO-01C: HU-01 registration -> HU-02 validation -> HU-03 preparation.
// Fixtures represent API responses, not evidence of real persisted datasets.
process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const noop = () => {}
const registered: RegisteredDataset = {
  id: 12, source: 'generacion_simulada', dataType: 'generacion', recordCount: 48,
  uploadedAt: '2026-09-18T09:00:00.000Z', status: 'recibido', pendingOptionalFields: [],
}
const report: DatasetValidationResult = {
  datasetId: 12, status: 'aprobado', validatedAt: '2026-09-18T09:30:00.000Z', canProceed: true,
  recordCount: 48, errorCount: 0, warningCount: 0, rulesetId: 'generacion_simulada_base', rulesetVersion: '1.0.0', issues: [],
}
const prepared: PreparedDatasetResult = {
  datasetId: 12, preparedDatasetId: 71, profileId: 'generacion_simulada_preparacion_base', profileVersion: '1.0.0',
  sourceRulesetId: report.rulesetId, sourceRulesetVersion: report.rulesetVersion,
  preparedAt: '2026-09-18T10:00:00.000Z', recordCount: 48, reused: false,
}
function validationHtml(state: ValidationState, preparation: PreparationState = { kind: 'idle' }) {
  return renderToStaticMarkup(<DatasetValidationContent datasetId={12} state={state} preparation={preparation}
    onValidate={noop} onPrepare={noop} />)
}
function expectField(html: string, label: string, value: string | number) {
  expect(html).toContain(`<dt>${label}</dt><dd>${value}</dd>`)
}

test('INICIO-01C-01 / HU-01: initial registration keeps editor and examples without future results', () => {
  const html = renderToStaticMarkup(<DatasetRegistration />)
  for (const text of ['Listo para registrar.', 'Dataset en JSON', 'Ejemplo válido', 'Ejemplo con opcional pendiente', '<textarea', 'for="dataset-json"', 'aria-describedby="dataset-json-help"']) expect(html).toContain(text)
  expect(html).toContain('open=""')
  for (const text of ['Registro completado', 'Progreso del flujo de datos', 'Validar calidad', 'Preparación completada']) expect(html).not.toContain(text)
})

test('INICIO-01C-02 / HU-01: confirmed registration keeps all metadata and HTTP evidence', () => {
  const html = renderToStaticMarkup(<DatasetRegistrationResult state={{ kind: 'success', dataset: registered }} />)
  expect(html).toContain('role="status"')
  expect(html).toContain('Registro completado')
  expect(html).toContain('HTTP 201')
  expectField(html, 'ID del dataset', 12)
  expectField(html, 'Fuente', registered.source)
  expectField(html, 'Tipo de dato', registered.dataType)
  expectField(html, 'Registros', 48)
  expectField(html, 'Fecha de carga (UTC)', registered.uploadedAt)
  expect(html).toContain('recibido')
  expect(html).toContain('Sin campos opcionales pendientes.')
})

test('INICIO-01C-03 / HU-01: optional pending fields retain index, field and reason', () => {
  const html = renderToStaticMarkup(<DatasetRegistrationResult state={{ kind: 'success', dataset: {
    ...registered, pendingOptionalFields: [{ recordIndex: 3, field: 'zona', reason: 'empty_optional_field' }],
  } }} />)
  for (const text of ['Campos opcionales pendientes', 'Índice de registro (desde 0)', '<td>3</td>', '<td>zona</td>', 'empty_optional_field']) expect(html).toContain(text)
})

test('INICIO-01C-04 / HU-02: mounted validation starts pending without offering preparation', () => {
  const html = renderToStaticMarkup(<DatasetValidation datasetId={12} onBusyChange={noop} />)
  expect(html).toContain('<ol class="dataset-flow-summary" aria-label="Progreso del flujo de datos">')
  expect(html).toContain('Completado')
  expect(html.match(/>Pendiente</g)).toHaveLength(2)
  expect(html).toContain('Validar calidad')
  expect(html).not.toContain('Preparar dataset')
  expect(html).not.toContain('ID de dataset preparado')
})

test('INICIO-01C-05 / HU-02: approved validation preserves report metadata and permits preparation', () => {
  const html = validationHtml({ kind: 'success', report })
  expect(html).toContain('Aprobado')
  expect(html).toContain('>aprobado</span>')
  expectField(html, 'Puede continuar', 'Sí')
  expectField(html, 'Registros', report.recordCount)
  expectField(html, 'Errores', 0)
  expectField(html, 'Advertencias', 0)
  expectField(html, 'Dataset ID', 12)
  expectField(html, 'Regla de validación', report.rulesetId)
  expectField(html, 'Versión de regla', report.rulesetVersion)
  expectField(html, 'Fecha de validación (UTC)', report.validatedAt)
  expect(html).toContain('>Preparar dataset</button>')
  expect(html).toContain('Sin hallazgos.')
  expect(html).not.toContain('Preparación completada')
  expect(html).not.toContain('>Preparado</span>')
})

test('INICIO-01C-06 / HU-02: warning allows continuation according to API and preserves findings', () => {
  const html = validationHtml({ kind: 'success', report: { ...report, status: 'advertencia', warningCount: 1,
    issues: [{ severity: 'warning', message: 'Falta una zona opcional.', field: 'zona', recordIndex: 3, code: 'OPTIONAL_VALUE_MISSING' }],
  } })
  for (const text of ['Con advertencias', '>advertencia</span>', '>warning</span>', 'Falta una zona opcional.', 'Campo: zona', 'Índice de registro (desde 0): 3', 'OPTIONAL_VALUE_MISSING']) expect(html).toContain(text)
  expectField(html, 'Puede continuar', 'Sí')
  expectField(html, 'Advertencias', 1)
  expect(html).toContain('>Preparar dataset</button>')
})

test('INICIO-01C-07 / HU-02: rejected report blocks preparation and retains critical finding context', () => {
  const html = validationHtml({ kind: 'success', report: { ...report, status: 'rechazado', canProceed: false, errorCount: 1,
    issues: [{ severity: 'error', message: 'Identidad temporal duplicada.', field: 'timestamp', recordIndex: 5, relatedRecordIndex: 2, code: 'DUPLICATE_TEMPORAL_IDENTITY' }],
  } })
  expectField(html, 'Puede continuar', 'No')
  expectField(html, 'Errores', 1)
  for (const text of ['Rechazado', '>rechazado</span>', '>error</span>', 'Identidad temporal duplicada.', 'Campo: timestamp', 'Índice de registro (desde 0): 5', 'Índice relacionado: 2', 'DUPLICATE_TEMPORAL_IDENTITY', 'El dataset no puede avanzar a preparación debido al resultado de validación.']) expect(html).toContain(text)
  expect(html).not.toContain('>Preparar dataset</button>')
  expect(html).not.toContain('Preparación completada')
  expect(html).toContain('>Pendiente</span>')
})

test.each([false, true])('INICIO-01C-08 / HU-03: preparation reused=%s keeps success and all technical values', reused => {
  const html = validationHtml({ kind: 'success', report }, { kind: 'success', prepared: { ...prepared, reused } })
  expect(html).toContain('>Preparado</span>')
  expect(html).toContain('Preparación completada')
  expectField(html, 'ID de dataset preparado', prepared.preparedDatasetId)
  expectField(html, 'Filas', prepared.recordCount)
  expectField(html, 'Origen', reused ? 'Reutilizado' : 'Creado')
  expectField(html, 'Perfil de preparación', prepared.profileId)
  expectField(html, 'Versión', prepared.profileVersion)
  expectField(html, 'Regla fuente', prepared.sourceRulesetId)
  expectField(html, 'Versión de regla', prepared.sourceRulesetVersion)
  expectField(html, 'Fecha de preparación (UTC)', prepared.preparedAt)
  const summary = html.slice(0, html.indexOf('</ol>'))
  expect(summary).not.toContain('Reutilizado')
  expect(html).not.toContain('PreparedDataset ID')
})

test.each(['idle', 'loading', 'error'] as const)('INICIO-01C-09 / HU-02: validation %s reflects real state with preparation pending', kind => {
  const state: ValidationState = kind === 'error'
    ? { kind, status: 409, code: 'DATASET_ALREADY_VALIDATED', message: 'El dataset ya fue validado.' } : { kind }
  const html = validationHtml(state)
  expect(html).toContain(`>${{ idle: 'Pendiente', loading: 'En curso', error: 'Error' }[kind]}</span>`)
  expect(html).toContain('>Pendiente</span>')
  expect(html).not.toContain('>Preparar dataset</button>')
  expect(html).not.toContain('>Preparado</span>')
  if (kind === 'loading') expect(html).toContain('aria-busy="true"')
  if (kind === 'error') {
    for (const value of ['role="alert"', 'HTTP 409:', 'DATASET_ALREADY_VALIDATED', 'El dataset ya fue validado.']) expect(html).toContain(value)
  }
})

test.each(['idle', 'loading', 'error'] as const)('INICIO-01C-10 / HU-03: preparation %s never claims success', kind => {
  const state: PreparationState = kind === 'error'
    ? { kind, status: 409, code: 'DATASET_NOT_VALIDATED', message: 'El dataset debe completar validación antes de prepararse.' } : { kind }
  const html = validationHtml({ kind: 'success', report }, state)
  const summary = renderToStaticMarkup(<DatasetFlowSummary validation={{ kind: 'success', report }} preparation={state} />)
  expect(summary).toContain(`>${{ idle: 'Pendiente', loading: 'En curso', error: 'Error' }[kind]}</span>`)
  expect(html).not.toContain('Preparación completada')
  expect(html).not.toContain('ID de dataset preparado')
  if (kind === 'loading') expect(html).toContain('aria-busy="true"')
  if (kind === 'error') {
    for (const value of ['role="alert"', 'HTTP 409:', 'DATASET_NOT_VALIDATED', 'El dataset debe completar validación antes de prepararse.']) expect(html).toContain(value)
  }
})

test('INICIO-01C-11 / HU-01: registration loading and backend errors remain explicit', () => {
  const loading = renderToStaticMarkup(<DatasetRegistrationResult state={{ kind: 'loading' }} />)
  expect(loading).toContain('role="status"')
  expect(loading).not.toContain('Registro completado')
  const error = renderToStaticMarkup(<DatasetRegistrationResult state={{ kind: 'error', status: 400, message: 'Formato de dataset inválido.' }} />)
  for (const value of ['role="alert"', 'HTTP 400:', 'Formato de dataset inválido.']) expect(error).toContain(value)
  expect(error).not.toContain('Registro completado')
})

test('INICIO-01C-12 / HU-01: registration contract retains server metadata and optional pending fields', async () => {
  const response = { ...registered, pendingOptionalFields: [{ recordIndex: 3, field: 'zona', reason: 'empty_optional_field' }] }
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(response, { status: 201 }))
  const input = { source: registered.source, dataType: 'generacion', columns: [], records: [] }
  expect(await registerDataset(input)).toEqual(response)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/datasets')
  expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST')
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual(input)
})

test.each(['aprobado', 'advertencia', 'rechazado'] as const)('INICIO-01C-13 / HU-02: service preserves %s report and sends no body', async status => {
  const response = { ...report, status, canProceed: status !== 'rechazado' }
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(response))
  expect(await validateDataset(12)).toEqual(response)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/datasets/12/validate')
  expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST')
  expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined()
})

test('INICIO-01C-14 / HU-01+02: service errors preserve server messages and codes', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: 'INVALID_DATASET', message: 'Formato de dataset inválido.' }, { status: 400 }))
  await expect(registerDataset({})).rejects.toMatchObject({ status: 400, serverMessage: 'Formato de dataset inválido.' })
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: 'DATASET_ALREADY_VALIDATED', message: 'El dataset ya fue validado.' }, { status: 409 }))
  await expect(validateDataset(12)).rejects.toMatchObject({ status: 409, code: 'DATASET_ALREADY_VALIDATED', serverMessage: 'El dataset ya fue validado.' })
})

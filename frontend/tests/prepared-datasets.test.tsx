import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { PreparedDatasetSelectContent } from '../src/components/datasets/PreparedDatasetSelect'
import { DatasetPreparationContent } from '../src/components/datasets/DatasetValidation'
import { prepareDataset } from '../src/services/datasetService'
import { getPreparedDatasets } from '../src/services/preparedDatasetsService'
import type { PreparedDatasetSummary } from '../src/types/preparedDatasets'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const dataset: PreparedDatasetSummary = {
  id: 71, sourceDatasetId: 12, dataType: 'generacion', profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0',
  sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', preparedAt: '2026-09-18T10:00:00.000Z', recordCount: 48,
}

test('prepared datasets service gets the catalog and validates the summary DTO', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ preparedDatasets: [dataset] }))
  expect(await getPreparedDatasets()).toEqual([dataset])
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/prepared-datasets')
  expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined()
})

test('selector renders loading, compatible option, empty and safe error states', () => {
  const common = { value: '', onChange: () => {}, requirements: [{ profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0' }] }
  expect(renderToStaticMarkup(<PreparedDatasetSelectContent {...common} state={{ kind: 'loading' }} />)).toContain('Cargando datasets preparados…')
  const success = renderToStaticMarkup(<PreparedDatasetSelectContent {...common} state={{ kind: 'success', datasets: [dataset] }} />)
  expect(success).toContain('#71')
  expect(success).toContain('48 filas')
  expect(renderToStaticMarkup(<PreparedDatasetSelectContent {...common} state={{ kind: 'success', datasets: [] }} />)).toContain('Primero prepare un dataset compatible.')
  expect(renderToStaticMarkup(<PreparedDatasetSelectContent {...common} state={{ kind: 'error', message: 'No fue posible cargar los datasets preparados.' }} />)).toContain('role="alert"')
})

test('rejects unexpected catalog and keeps no prepared dataset IDs hardcoded at runtime', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ preparedDatasets: [{ ...dataset, id: '71' }] }))
  await expect(getPreparedDatasets()).rejects.toMatchObject({ kind: 'response' })
  for (const file of ['../src/pages/Patterns.tsx', '../src/components/forecasts/ForecastPanel.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    expect(source).toContain('PreparedDatasetSelect')
    expect(source).not.toMatch(/preparedDatasetId:\s*(17|33|49)|String\(config\.id\)|id:\s*(17|33|49)/)
  }
})

test('prepares a validated dataset with no body and retains only its real summary', async () => {
  const prepared = { datasetId: 12, preparedDatasetId: 71, profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', preparedAt: '2026-09-18T10:00:00.000Z', recordCount: 48, reused: false, content: { records: [] } }
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(prepared))
  expect(await prepareDataset(12)).toEqual({ datasetId: 12, preparedDatasetId: 71, profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', preparedAt: '2026-09-18T10:00:00.000Z', recordCount: 48, reused: false })
  expect(fetch.mock.calls[0]?.[0]).toBe('http://enertrade.test/datasets/12/prepare')
  expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined()
})

test('preparation rejects malformed confirmation and retains safe backend errors', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ datasetId: 12, preparedDatasetId: '71' }))
  await expect(prepareDataset(12)).rejects.toMatchObject({ kind: 'response' })
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: 'DATASET_NOT_VALIDATED', message: 'El dataset debe completar validación antes de prepararse.' }, { status: 409 }))
  await expect(prepareDataset(12)).rejects.toMatchObject({ status: 409, code: 'DATASET_NOT_VALIDATED' })
})

test('preparation UI renders loading, result metadata and safe errors', () => {
  const common = { datasetId: 12, onPrepare: () => {} }
  expect(renderToStaticMarkup(<DatasetPreparationContent {...common} state={{ kind: 'loading' }} />)).toContain('Preparando dataset en el servidor…')
  const success = renderToStaticMarkup(<DatasetPreparationContent {...common} state={{ kind: 'success', prepared: { datasetId: 12, preparedDatasetId: 71, profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', preparedAt: '2026-09-18T10:00:00.000Z', recordCount: 48, reused: false } }} />)
  expect(success).toContain('PreparedDataset ID')
  expect(success).toContain('xm_gene_preparacion_base')
  expect(success).toContain('sus selectores consultan nuevamente el catálogo del backend')
  expect(renderToStaticMarkup(<DatasetPreparationContent {...common} state={{ kind: 'error', status: 409, code: 'DATASET_NOT_VALIDATED', message: 'El dataset debe completar validación antes de prepararse.' }} />)).toContain('role="alert"')
})

test('a later selector catalog read obtains prepared datasets from the backend', async () => {
  const prepared = { datasetId: 12, preparedDatasetId: 71, profileId: 'xm_gene_preparacion_base', profileVersion: '1.0.0', sourceRulesetId: 'xm_gene_base', sourceRulesetVersion: '1.0.0', preparedAt: '2026-09-18T10:00:00.000Z', recordCount: 48, reused: false }
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(prepared)).mockResolvedValueOnce(Response.json({ preparedDatasets: [dataset] }))
  await prepareDataset(12)
  expect(await getPreparedDatasets()).toEqual([dataset])
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['http://enertrade.test/datasets/12/prepare', 'http://enertrade.test/prepared-datasets'])
})
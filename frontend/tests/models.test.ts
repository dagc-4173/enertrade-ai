import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { getModel, getModels, parseModel, parseModels } from '../src/services/modelsService'
import { artifacts, metadata } from './fixtures/capabilityModels'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test.each(metadata)('INICIO-01B parser accepts real detail shape without root runtime: $id', detail => {
  expect(Object.hasOwn(detail, 'activeInRuntime')).toBe(false)
  expect(parseModel(detail)).toEqual(detail)
})

test.each([undefined, null, {}, { activeInRuntime: 'true', promoted: true, academicValidation: 'pending' },
  { activeInRuntime: true, promoted: 'false', academicValidation: 'pending' },
  { activeInRuntime: true, promoted: false, academicValidation: 'approved' },
])('INICIO-01B malformed lifecycle is rejected: %j', lifecycle => {
  expect(() => parseModel({ ...metadata[0], lifecycle })).toThrow('formato inesperado')
})

test('INICIO-01B preserves explicit false, pending and validated without root fallback', () => {
  const value = { ...metadata[0], activeInRuntime: true,
    lifecycle: { activeInRuntime: false, promoted: false, academicValidation: 'validated' }, quality: { metricsAvailable: false } }
  expect(parseModel(value).lifecycle).toEqual(value.lifecycle)
  expect(parseModel(value).quality.metricsAvailable).toBe(false)
})

test.each([null, {}, { artifacts: [{}] }, { artifacts: [{ ...artifacts[0], activeInRuntime: 'true' }] },
  { artifacts: [{ ...artifacts[0], activeInRuntime: undefined }] }, { artifacts: [{ ...artifacts[0], kind: 'method' }] },
])('INICIO-01B rejects malformed catalog: %j', value => {
  expect(() => parseModels(value)).toThrow('formato inesperado')
})

test.each([{ ...metadata[0], quality: { metricsAvailable: 'true' } },
  { ...metadata[0], data: { source: 'XM', trainingRange: { start: 1 } } },
  { ...metadata[0], method: { equation: 'x', features: [4], parameters: {} } },
  { ...metadata[0], limitations: [null] },
])('INICIO-01B detail validation remains strict: %j', value => {
  expect(() => parseModel(value)).toThrow('formato inesperado')
})

test('INICIO-01B services preserve GET, abort signal, catalog and detail contracts', async () => {
  const signal = new AbortController().signal
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ artifacts })).mockResolvedValueOnce(Response.json(metadata[0]))
  expect(await getModels(signal)).toEqual(artifacts)
  expect(await getModel(artifacts[0]!.id, signal)).toEqual(metadata[0])
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['http://enertrade.test/models', 'http://enertrade.test/models/xm-gene-ridge'])
  for (const [, options] of fetch.mock.calls) {
    expect(options?.signal).toBe(signal)
    expect(options?.body).toBeUndefined()
    expect(options?.method ?? 'GET').toBe('GET')
  }
})

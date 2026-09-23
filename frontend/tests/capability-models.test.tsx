import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActiveArtifactsContent } from '../src/components/capabilities/ActiveArtifacts'
import { combineCapabilityModels } from '../src/utils/capabilityModels'
import { loadCapabilityModels, type CapabilityModelsState } from '../src/services/capabilityModelsService'
import { artifacts, capabilities, metadata } from './fixtures/capabilityModels'

process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const complete: CapabilityModelsState = { kind: 'success', artifacts,
  details: Object.fromEntries(metadata.map(value => [value.id, { kind: 'success', metadata: value }])) }
const render = (state: CapabilityModelsState) => renderToStaticMarkup(<ActiveArtifactsContent capabilities={capabilities} state={state} onRetry={() => {}} />)
const rowHtml = (html: string, id: string) => html.split('<tr role="row">').find(row => row.includes(id))!

// HU-18, INICIO-01B: API fixtures -> pure join / presentation / load -> exact assertions below.
test('joins ID+version and retains all five capabilities without assigning metadata to methods', () => {
  const rows = combineCapabilityModels(capabilities, artifacts, metadata)
  expect(rows).toHaveLength(5)
  expect(rows.map(row => row.capability)).toEqual(capabilities)
  expect(rows.slice(0, 3).map(row => row.metadata)).toEqual(metadata)
  for (const row of rows.slice(3)) {
    expect(row.predictive).toBe(false)
    expect(row.metadata).toBeUndefined()
  }
})

test('same ID with different summary or detail version is never merged', () => {
  const summaryMismatch = combineCapabilityModels(capabilities, [{ ...artifacts[0]!, version: '2.0.0' }], metadata)
  const detailMismatch = combineCapabilityModels(capabilities, artifacts, [{ ...metadata[0]!, version: '2.0.0' }])
  for (const rows of [summaryMismatch, detailMismatch]) {
    expect(rows).toHaveLength(5)
    expect(rows[0]!.summary).toBeUndefined()
    expect(rows[0]!.metadata).toBeUndefined()
    expect(rows[0]!.notice).toContain('versión')
  }
})

test('duplicate summary or detail IDs are not resolved by array order', () => {
  for (const rows of [combineCapabilityModels(capabilities, [...artifacts, artifacts[0]!], metadata),
    combineCapabilityModels(capabilities, artifacts, [...metadata, metadata[0]!]),
    combineCapabilityModels(capabilities, [...artifacts, { ...artifacts[0]!, version: '2.0.0' }], metadata)]) {
    expect(rows[0]!.notice).toContain('duplicado')
    expect(rows[0]!.metadata).toBeUndefined()
    expect(rows[0]!.summary).toBeUndefined()
  }
})

test('runtime discrepancies are neutral and never override capability runtime', () => {
  const rows = combineCapabilityModels(capabilities, [{ ...artifacts[0]!, activeInRuntime: false }],
    [{ ...metadata[0]!, lifecycle: { ...metadata[0]!.lifecycle, activeInRuntime: false } }])
  expect(rows[0]!.capability.active).toBe(true)
  expect(rows[0]!.metadata?.lifecycle.activeInRuntime).toBe(false)
  expect(rows[0]!.notice).toContain('runtime')
})

test('ML and price show independent runtime, technical promotion, metrics and academic pending', () => {
  const html = render(complete)
  for (const id of artifacts.map(item => item.id)) {
    const row = rowHtml(html, id)
    for (const text of ['Activo', 'Promovido técnicamente', 'Métricas disponibles', 'Validación académica:', 'Pendiente']) expect(row).toContain(text)
    expect(row).not.toContain('>Validada<')
  }
  expect(rowHtml(html, 'xm-gene-ridge')).toContain('Modelo de ML')
  expect(rowHtml(html, 'xm-preciobolsnaci-b1')).toContain('Regla determinista')
  expect(rowHtml(html, 'xm-preciobolsnaci-b1')).toContain('deterministic_baseline')
  for (const forbidden of ['trainingRange', 'coefficients', 'scaler', 'y_hat', 'P_hat', 'energy_same_period_previous_day']) expect(html).not.toContain(forbidden)
})

test.each(['matching-v1', 'energy-pattern-descriptive'])('method %s stays neutral and does not invent lifecycle', id => {
  const row = rowHtml(render(complete), id)
  for (const text of ['Método determinista', 'No aplica al catálogo predictivo', 'Métricas predictivas', 'No aplica', 'No disponible en este contrato', 'Activo']) expect(row).toContain(text)
  for (const forbidden of ['Pendiente', 'Promovido técnicamente', 'Métricas disponibles', 'status-badge--danger']) expect(row).not.toContain(forbidden)
})

test.each([{ kind: 'loading' } as const, { kind: 'error', message: 'La API respondió con HTTP 500.' } as const])('catalog $kind retains all capabilities without inventing values', state => {
  const html = render(state)
  for (const capability of capabilities) expect(html).toContain(capability.id)
  expect(html.match(/scope="row"/g)).toHaveLength(5)
  for (const forbidden of ['No promovido técnicamente', 'Métricas no disponibles', 'Pendiente']) expect(html).not.toContain(forbidden)
  if (state.kind === 'loading') expect(html).toContain('Cargando…')
  else {
    expect(html).toContain('Información técnica no disponible')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Reintentar información de modelos')
  }
})

test('one failed detail degrades only its row; real false values remain distinct from errors', () => {
  const state: CapabilityModelsState = { ...complete, details: { ...complete.details,
    'xm-gene-ridge': { kind: 'error', message: 'Fallo de detalle.' },
    'xm-demandasin-ridge': { kind: 'success', metadata: { ...metadata[1]!, lifecycle: { ...metadata[1]!.lifecycle, promoted: false }, quality: { metricsAvailable: false } } },
  } }
  const html = render(state)
  const failed = rowHtml(html, 'xm-gene-ridge')
  expect(failed).toContain('Información técnica no disponible')
  expect(failed).toContain('Fallo de detalle.')
  for (const forbidden of ['No promovido técnicamente', 'Métricas no disponibles', 'Pendiente']) expect(failed).not.toContain(forbidden)
  const realFalse = rowHtml(html, 'xm-demandasin-ridge')
  expect(realFalse).toContain('No promovido técnicamente')
  expect(realFalse).toContain('Métricas no disponibles')
  expect(realFalse).toContain('Pendiente')
  expect(rowHtml(html, 'xm-preciobolsnaci-b1')).toContain('Promovido técnicamente')
})

test('only explicit validated metadata displays Validada', () => {
  const state: CapabilityModelsState = { ...complete, details: { ...complete.details,
    'xm-gene-ridge': { kind: 'success', metadata: { ...metadata[0]!, lifecycle: { ...metadata[0]!.lifecycle, academicValidation: 'validated' } } },
  } }
  expect(rowHtml(render(state), 'xm-gene-ridge')).toContain('>Validada<')
  expect(render(complete)).not.toContain('>Validada<')
})

test('block has a named table, four grouped columns, row headers and accessible limitation controls', () => {
  const html = render(complete)
  expect(html).toContain('aria-label="Artefactos activos"')
  expect(html).toContain('aria-label="Capacidades, runtime y evidencia"')
  expect(html.match(/scope="col"/g)).toHaveLength(4)
  expect(html.match(/scope="row"/g)).toHaveLength(5)
  expect(html).toContain('<h2>Artefactos activos</h2>')
  expect(html).toContain('role="status"')
  expect(html.match(/aria-expanded="false"/g)).toHaveLength(3)
  for (const match of html.matchAll(/aria-controls="([^"]+)"/g)) expect(html).toContain(`id="${match[1]}" hidden=""`)
  for (const detail of metadata) expect(html).toContain(detail.limitations[0]!)
})

test('loader fetches catalog then matching details in parallel, never metrics or methods', async () => {
  const resolvers: Array<(value: Response) => void> = []
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).endsWith('/models')) return Response.json({ artifacts })
    return new Promise<Response>(resolve => resolvers.push(resolve))
  })
  const states: CapabilityModelsState[] = []
  const pending = loadCapabilityModels(capabilities, new AbortController().signal, state => states.push(state))
  for (let i = 0; i < 30 && resolvers.length < 3; i++) await Bun.sleep(1)
  expect(resolvers).toHaveLength(3)
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['http://enertrade.test/models', ...artifacts.map(item => `http://enertrade.test/models/${item.id}`)])
  resolvers[1]!(Response.json(metadata[1]))
  for (let i = 0; i < 30 && states.length < 2; i++) await Bun.sleep(1)
  const partial = states.at(-1)!
  expect(partial.kind === 'success' && partial.details['xm-demandasin-ridge']?.kind).toBe('success')
  expect(partial.kind === 'success' && partial.details['xm-gene-ridge']?.kind).toBe('loading')
  resolvers[0]!(Response.json(metadata[0]))
  resolvers[2]!(Response.json(metadata[2]))
  await pending
  expect(states.at(-1)).toEqual(complete)
  expect(fetch.mock.calls).toHaveLength(4)
})

test('loader skips duplicated IDs, mismatched versions and methods even if present in the catalog', async () => {
  const catalog = [artifacts[0]!, artifacts[0]!, { ...artifacts[1]!, version: 'other' }, artifacts[2]!,
    { ...artifacts[0]!, id: 'matching-v1', version: 'v1' }, { ...artifacts[0]!, id: 'energy-pattern-descriptive' }]
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ artifacts: catalog })).mockResolvedValueOnce(Response.json(metadata[2]))
  await loadCapabilityModels(capabilities, new AbortController().signal, () => {})
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['http://enertrade.test/models', 'http://enertrade.test/models/xm-preciobolsnaci-b1'])
})

test('failed detail is isolated and retry requests only that detail', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).endsWith('/models')) return Response.json({ artifacts })
    if (String(url).endsWith('/xm-gene-ridge')) return Response.json({ error: 'MODEL_CATALOG_FAILED', message: 'Detalle no disponible.' }, { status: 500 })
    return Response.json(metadata.find(item => String(url).endsWith('/' + item.id)))
  })
  let final: CapabilityModelsState = { kind: 'loading' }
  await loadCapabilityModels(capabilities, new AbortController().signal, value => { final = value })
  expect(final.kind === 'success' && final.details['xm-gene-ridge']?.kind).toBe('error')
  expect(final.kind === 'success' && final.details['xm-demandasin-ridge']?.kind).toBe('success')
  fetch.mockClear().mockResolvedValue(Response.json(metadata[0]))
  await loadCapabilityModels(capabilities, new AbortController().signal, value => { final = value }, final)
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['http://enertrade.test/models/xm-gene-ridge'])
  expect(final).toEqual(complete)
})

test('catalog failure does not start detail requests; retry can recover', async () => {
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: 'MODEL_CATALOG_FAILED', message: 'Catálogo no disponible.' }, { status: 500 }))
  let final: CapabilityModelsState = { kind: 'loading' }
  await loadCapabilityModels(capabilities, new AbortController().signal, value => { final = value })
  expect(final).toEqual({ kind: 'error', message: 'Catálogo no disponible.' })
  expect(fetch.mock.calls).toHaveLength(1)
  fetch.mockImplementation(async url => Response.json(String(url).endsWith('/models') ? { artifacts: [] } : {}))
  await loadCapabilityModels(capabilities, new AbortController().signal, value => { final = value }, final)
  expect(final).toEqual({ kind: 'success', artifacts: [], details: {} })
})

test('wrong detail identity is rejected without replacing the active artifact', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ artifacts: [artifacts[0]] })).mockResolvedValueOnce(Response.json(metadata[1]))
  let final: CapabilityModelsState = { kind: 'loading' }
  await loadCapabilityModels(capabilities, new AbortController().signal, value => { final = value })
  expect(final.kind === 'success' && final.details['xm-gene-ridge']?.kind).toBe('error')
})

test('abort prevents late publications and subsequent detail requests', async () => {
  let resolve!: (response: Response) => void
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(done => { resolve = done }))
  const controller = new AbortController()
  const states: CapabilityModelsState[] = []
  const pending = loadCapabilityModels(capabilities, controller.signal, value => states.push(value))
  controller.abort()
  resolve(Response.json({ artifacts }))
  await pending
  expect(states).toEqual([])
  expect(fetch.mock.calls).toHaveLength(1)
  expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  await loadCapabilityModels(capabilities, controller.signal, value => states.push(value))
  expect(fetch.mock.calls).toHaveLength(1)
})

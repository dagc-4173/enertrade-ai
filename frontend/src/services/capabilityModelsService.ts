import type { CapabilityVersion } from '../types/capabilities'
import type { PredictiveArtifactMetadata, PredictiveArtifactSummary } from '../types/models'
import { combineCapabilityModels } from '../utils/capabilityModels'
import { ApiError } from './apiClient'
import { getModel, getModels } from './modelsService'

export type ModelDetailState =
  | { kind: 'loading' }
  | { kind: 'success'; metadata: PredictiveArtifactMetadata }
  | { kind: 'error'; message: string }

export type CapabilityModelsState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; artifacts: PredictiveArtifactSummary[]; details: Record<string, ModelDetailState> }

function message(error: unknown) {
  return error instanceof ApiError ? error.serverMessage ?? error.message : 'No fue posible consultar el catálogo predictivo.'
}

/** Starts after capabilities succeeds. Each detail settles independently; no metrics requests. */
export async function loadCapabilityModels(
  capabilities: CapabilityVersion[], signal: AbortSignal, publish: (state: CapabilityModelsState) => void,
  previous?: CapabilityModelsState,
) {
  if (signal.aborted) return
  let artifacts: PredictiveArtifactSummary[]
  try {
    artifacts = previous?.kind === 'success' ? previous.artifacts : await getModels(signal)
  } catch (error) {
    if (!signal.aborted) publish({ kind: 'error', message: message(error) })
    return
  }
  if (signal.aborted) return
  const candidates = new Map(combineCapabilityModels(capabilities, artifacts)
    .flatMap(row => row.summary ? [[row.summary.id, row.summary] as const] : []))
  const details: Record<string, ModelDetailState> = Object.fromEntries([...candidates.keys()].map(id => [id, { kind: 'loading' }]))
  for (const [id, summary] of candidates) {
    const cached = previous?.kind === 'success' ? previous.details[id] : undefined
    if (cached?.kind === 'success' && cached.metadata.id === id && cached.metadata.version === summary.version) details[id] = cached
  }
  const update = () => { if (!signal.aborted) publish({ kind: 'success', artifacts, details: { ...details } }) }
  update()
  await Promise.all([...candidates.values()].map(async summary => {
    if (details[summary.id]?.kind === 'success') return
    try {
      const metadata = await getModel(summary.id, signal)
      if (signal.aborted) return
      if (metadata.id !== summary.id || metadata.version !== summary.version) {
        throw new ApiError('response', 'El detalle recibido no corresponde al artefacto y versión solicitados.')
      }
      details[summary.id] = { kind: 'success', metadata }
    } catch (error) {
      if (signal.aborted) return
      details[summary.id] = { kind: 'error', message: message(error) }
    }
    update()
  }))
}

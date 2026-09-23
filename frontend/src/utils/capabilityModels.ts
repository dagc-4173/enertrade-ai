import type { CapabilityVersion } from '../types/capabilities'
import type { PredictiveArtifactMetadata, PredictiveArtifactSummary } from '../types/models'

export interface CapabilityArtifact {
  capability: CapabilityVersion
  predictive: boolean
  summary?: PredictiveArtifactSummary
  metadata?: PredictiveArtifactMetadata
  notice?: string
}

/** Keep capability identity and runtime authoritative; never choose an ambiguous catalog entry. */
export function combineCapabilityModels(
  capabilities: CapabilityVersion[],
  summaries: PredictiveArtifactSummary[] = [],
  metadata: PredictiveArtifactMetadata[] = [],
): CapabilityArtifact[] {
  return capabilities.map(capability => {
    const predictive = capability.capability !== 'matching' && capability.capability !== 'pattern_recognition' &&
      capability.artifactType !== 'deterministic_method'
    const base = { capability, predictive }
    if (!predictive) return base
    const summariesById = summaries.filter(item => item.id === capability.id)
    const detailsById = metadata.filter(item => item.id === capability.id)
    if (summariesById.length > 1 || detailsById.length > 1) {
      return { ...base, notice: 'Información técnica ambigua: el catálogo contiene un identificador duplicado.' }
    }
    const summary = summariesById[0]
    const detail = detailsById[0]
    if ((summary && summary.version !== capability.version) || (detail && detail.version !== capability.version)) {
      return { ...base, notice: 'La versión del catálogo no coincide con la versión activa.' }
    }
    if (!summary) return base
    const expectedKind = capability.artifactType === 'ml_model' ? 'model' : 'rule'
    if (summary.kind !== expectedKind || (detail && (detail.kind !== summary.kind || detail.type !== summary.type))) {
      return { ...base, notice: 'El tipo del catálogo no coincide con el artefacto activo.' }
    }
    const runtimeDiffers = summary.activeInRuntime !== capability.active ||
      (detail !== undefined && detail.lifecycle.activeInRuntime !== capability.active)
    return { ...base, summary, metadata: detail,
      ...(runtimeDiffers ? { notice: 'El catálogo difiere del runtime reportado por capacidades; se conserva este último.' } : {}) }
  })
}

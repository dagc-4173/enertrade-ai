import type { CapabilityVersion } from '../../src/types/capabilities'
import type { PredictiveArtifactMetadata, PredictiveArtifactSummary } from '../../src/types/models'

// HU-18: published identities and response shapes, not evidence of live API calls.
export const capabilities: CapabilityVersion[] = [
  { capability: 'supply_forecast', artifactType: 'ml_model', id: 'xm-gene-ridge', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'demand_forecast', artifactType: 'ml_model', id: 'xm-demandasin-ridge', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'price_estimation', artifactType: 'deterministic_rule', id: 'xm-preciobolsnaci-b1', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'matching', artifactType: 'deterministic_method', id: 'matching-v1', version: 'v1', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
  { capability: 'pattern_recognition', artifactType: 'deterministic_method', id: 'energy-pattern-descriptive', version: '1.0.0', status: 'active', active: true, date: null, dateStatus: 'not_recorded' },
]
export const artifacts: PredictiveArtifactSummary[] = [
  { id: 'xm-gene-ridge', version: '1.0.0', kind: 'model', type: 'ridge', target: 'energia_kwh', unit: 'kWh', forecastType: 'generation_availability_proxy', activeInRuntime: true },
  { id: 'xm-demandasin-ridge', version: '1.0.0', kind: 'model', type: 'ridge', target: 'demanda_kwh', unit: 'kWh', forecastType: 'aggregate_demand_proxy', activeInRuntime: true },
  { id: 'xm-preciobolsnaci-b1', version: '1.0.0', kind: 'rule', type: 'deterministic_baseline', target: 'precio_cop_kwh', unit: 'COP/kWh', forecastType: 'market_reference_price', activeInRuntime: true },
]
export const metadata: PredictiveArtifactMetadata[] = artifacts.map((item, index) => ({
  id: item.id, version: item.version, kind: item.kind, type: item.type, target: item.target, unit: item.unit, forecastType: item.forecastType,
  horizon: { value: index === 0 ? 24 : 1, unit: index === 0 ? 'periods' : 'days' },
  data: { source: 'XM', ...(index === 0 ? {
    profile: 'xm_gene_preparacion_base@1.0.0', ruleset: 'xm_gene_base@1.0.0',
    trainingRange: { start: '2024-01-01', end: '2024-03-30' },
    effectiveTrainingRange: { start: '2024-01-08', end: '2024-03-30' },
    externalHoldoutRange: { start: '2024-03-31', end: '2024-04-29' },
  } : {}) },
  method: { equation: index === 2 ? 'P_hat(D,p) = P(D-1,p)' : 'y_hat = beta0 + sum(beta_j * ((x_j - mu_j) / sigma_j))',
    features: [], parameters: {} },
  quality: { metricsAvailable: true, ...(index === 1 ? { confidenceStatus: 'not_defined' } : {}) },
  limitations: [index === 0 ? 'Generación agregada XM; no diferenciada por tecnología.' : index === 1 ? 'Demanda agregada del SIN.' : 'Deterministic baseline, not a trained ML model.'],
  lifecycle: { activeInRuntime: true, promoted: true, academicValidation: 'pending' },
}))

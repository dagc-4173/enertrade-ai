export type CapabilityName = 'supply_forecast' | 'demand_forecast' | 'price_estimation' | 'matching' | 'pattern_recognition'
export type CapabilityArtifactType = 'ml_model' | 'deterministic_rule' | 'deterministic_method'

export interface CapabilityVersion {
  capability: CapabilityName
  artifactType: CapabilityArtifactType
  id: string
  version: string
  status: 'active'
  active: true
  date: null
  dateStatus: 'not_recorded'
}
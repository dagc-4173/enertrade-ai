export type PredictiveArtifactKind = 'model' | 'rule'

export interface PredictiveArtifactSummary {
  id: string
  version: string
  kind: PredictiveArtifactKind
  type: string
  target: string
  unit: string
  forecastType: string
  activeInRuntime: boolean
}

export interface PredictiveArtifactMetadata extends Omit<PredictiveArtifactSummary, 'activeInRuntime'> {
  horizon: { value: number; unit: 'periods' | 'days' }
  data: {
    source: string
    profile?: string
    ruleset?: string
    trainingRange?: { start: string; end: string }
    effectiveTrainingRange?: { start: string; end: string }
    externalHoldoutRange?: { start: string; end: string }
  }
  method: { equation: string; features: string[]; parameters: Record<string, unknown> }
  quality: { metricsAvailable: boolean; confidenceStatus?: string }
  limitations: string[]
  lifecycle: { activeInRuntime: boolean; promoted: boolean; academicValidation: 'pending' | 'validated' }
}

export interface PredictiveArtifactMetrics {
  id: string
  version: string
  evaluationType?: string
  range: { start: string; end: string }
  evaluable: number
  unavailable: number
  metrics: {
    MAE: { value: number; unit: string }
    RMSE: { value: number; unit: string }
    bias: { value: number; unit: string }
    WAPE?: { value: number; unit: string }
  }
}

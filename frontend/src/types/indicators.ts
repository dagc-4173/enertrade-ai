export interface EngineIndicators {
  forecasts: { supply: number; demand: number; total: number }
  priceEstimates: number
  matchingSuggestions: number
  patternsIdentified: number
  errors: { total: number }
  averageResponseTimeMs: number | null
  capabilities: {
    active: number
    total: number
    byArtifactType: { mlModel: number; deterministicRule: number; deterministicMethod: number }
  }
}

export interface IndicatorsResponse {
  indicators: EngineIndicators
  sample: { traceCount: number }
  warnings: string[]
}
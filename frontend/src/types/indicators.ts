export interface EngineIndicators {
  forecasts: { supply: number; demand: number; total: number }
  priceEstimates: number
  matchingSuggestions: number
  patternsIdentified: number
  errors: { total: number }
  executions: { total: number; succeeded: number; empty: number; failed: number; successRate: number | null }
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
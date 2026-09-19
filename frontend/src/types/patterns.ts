export type PatternDataType = 'generacion' | 'demanda' | 'precios'
export type PatternVariable = 'energia_kwh' | 'demanda_kwh' | 'precio_cop_kwh'
export type PatternStatus = 'completed' | 'partial' | 'no_results'
export type PatternDirection = 'stable' | 'increasing' | 'decreasing'

export interface DistributionPattern {
  type: 'distribution'
  metrics: { count: number; min: number; max: number; mean: number; median: number; standardDeviation: number }
  description: string
}
export interface TrendPattern {
  type: 'trend'
  metrics: { slope: number; direction: PatternDirection; stableThreshold: number }
  description: string
}
export interface RecurrencePattern {
  type: 'recurrence'
  metrics: { grouping: 'Monday-Sunday' | '1-24'; periods: Array<{ key: string; count: number; mean: number; min: number; max: number }> }
  description: string
}
export type PatternResult = DistributionPattern | TrendPattern | RecurrencePattern

export interface PatternAnalysis {
  analysisId: string
  status: PatternStatus
  dataType: PatternDataType
  variable: PatternVariable
  period: { from: string | null; to: string | null }
  sampleSize: number
  method: { id: string; version: string; type: 'deterministic-statistical' }
  patterns: PatternResult[]
  warnings: string[]
  createdAt?: string
}
export interface PatternAnalysisResponse extends PatternAnalysis {
  persistence: { analysisId: string; persistence: 'persisted' | 'failed' }
}
export interface PatternFilters { from?: string; to?: string; dataType?: PatternDataType; variable?: PatternVariable }
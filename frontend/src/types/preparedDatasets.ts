export type PreparedDatasetDataType = 'generacion' | 'consumo' | 'oferta' | 'demanda' | 'precios' | 'transacciones_simuladas'

export interface PreparedDatasetSummary {
  id: number
  sourceDatasetId: number
  dataType: PreparedDatasetDataType
  profileId: string
  profileVersion: string
  sourceRulesetId: string
  sourceRulesetVersion: string
  preparedAt: string
  recordCount: number
}

export interface PreparedDatasetCompatibility {
  profileId: string
  profileVersion: string
  sourceRulesetId: string
  sourceRulesetVersion: string
}
export type PageKey =
  | 'dashboard'
  | 'marketplace'
  | 'predictions'
  | 'transactions'
  | 'anomalies'
  | 'profile'

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export type OperationType = 'Venta' | 'Compra'

export type RiskLevel = 'Bajo' | 'Medio' | 'Alto'

export interface NavigationItem {
  key: PageKey
  label: string
  description: string
}

export interface MetricCardData {
  title: string
  value: string
  helper: string
  delta?: string
  tone?: StatusTone
}

export interface EnergyOffer {
  id: string
  actor: string
  type: OperationType
  energy: string
  price: string
  time: string
  zone: string
  status: string
  tone: StatusTone
}

export interface AiRecommendation {
  title: string
  text: string
  tone: StatusTone
}

export interface WorkflowStep {
  title: string
  description: string
}

export interface SmartMatch {
  buyer: string
  price: string
  fit: string
  state: string
  tone: StatusTone
}

export interface Transaction {
  id: string
  type: OperationType
  amount: string
  total: string
  status: string
  note: string
  tone: StatusTone
}

export interface ValidationCase {
  id: string
  actor: string
  type: string
  risk: RiskLevel
  action: string
}

export interface AnomalyEvent {
  id: string
  title: string
  detail: string
  level: RiskLevel
  source: string
  score: string
}

export interface ForecastPoint {
  label: string
  generation: number
  consumption: number
  price: number
}

export interface ServiceStatus {
  name: string
  status: string
  note: string
  tone: StatusTone
}

export interface TraceItem {
  item: string
  value: string
  status: string
}

export interface ExecutiveRisk {
  risk: string
  impact: RiskLevel
  action: string
}

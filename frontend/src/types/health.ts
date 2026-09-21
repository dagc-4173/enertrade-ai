export type DatabaseStatus = 'ok' | 'unavailable'

export interface HealthResponse {
  status: 'ok' | 'degraded'
  service: 'enertrade-backend'
  dependencies: { database: DatabaseStatus }
}

/** TEMPORARY Phase 2 — replace with @vaccin-delivery/types in Phase 3 */
export type HealthStatus = {
  status: string
  service: string
  timestamp: string
  environment: string
}

export type HealthQueryResult = {
  health: HealthStatus
}

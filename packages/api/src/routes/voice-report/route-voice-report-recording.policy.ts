import { RouteStatus } from '../route-status.enum'
import type { DeliveryStop } from '../delivery-stop.embed'
import type { DeliveryRoute } from '../delivery-route.entity'

/**
 * Phase 36E — when a courier may record a stop-scoped voice report.
 *
 * Allowed while the route is IN_PROGRESS for any stop on that route,
 * before or after arrival and after QR confirmation.
 * Not allowed after COMPLETED / CANCELLED.
 * Arrival is not required.
 */
export type StopVoiceReportRecordingDecision =
  | { allowed: true; stop: DeliveryStop }
  | {
      allowed: false
      reason:
        | 'route_not_in_progress'
        | 'stop_id_required'
        | 'stop_not_found'
        | 'stop_missing_profile'
    }

export function resolveStopForVoiceReport(
  route: Pick<DeliveryRoute, 'status' | 'stops'>,
  stopId: string | null | undefined,
): StopVoiceReportRecordingDecision {
  if (route.status !== RouteStatus.IN_PROGRESS) {
    return { allowed: false, reason: 'route_not_in_progress' }
  }

  const trimmed =
    typeof stopId === 'string' ? stopId.trim() : ''
  if (!trimmed) {
    return { allowed: false, reason: 'stop_id_required' }
  }

  const stop = (route.stops ?? []).find(
    candidate => candidate.stopId === trimmed,
  )
  if (!stop?.stopId) {
    return { allowed: false, reason: 'stop_not_found' }
  }

  const apothekerProfileId = String(stop.apothekerProfileId ?? '').trim()
  if (!apothekerProfileId) {
    return { allowed: false, reason: 'stop_missing_profile' }
  }

  return { allowed: true, stop }
}

export function isLegacyRouteVoiceReport(report: {
  stopId?: string | null
}): boolean {
  return (
    report.stopId == null ||
    (typeof report.stopId === 'string' && report.stopId.trim().length === 0)
  )
}

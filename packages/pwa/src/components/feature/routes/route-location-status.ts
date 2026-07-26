import { RouteStatus, type RouteLocationStatus } from '@vaccin-delivery/types'

import { formatDateTime } from '@/i18n'

export type RouteLocationViewerRole = 'ADMIN' | 'BEZORGER' | 'APOTHEKER'

export type RouteLocationSourceValue = string | null | undefined

export type RouteLocationStatusCardInput = {
  hasLocation: boolean
  city: string | null
  recordedAt: string | Date | null
  source: RouteLocationSourceValue
  stopSequence: number | null
  hasNextStop: boolean
  nextStopName: string | null
  nextStopSequence: number | null
  nextStopCity: string | null
  routeStatus: RouteStatus | string
  viewerRole: RouteLocationViewerRole
  isHistorical?: boolean
  isOfflineSnapshot?: boolean
  locationUnavailable?: boolean
}

function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Locale-aware timestamp for coarse location UI.
 * Same calendar day → time only; otherwise short date + time.
 */
export function formatLocationRecordedAt(
  value: string | number | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (value == null || value === '') {
    return ''
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  if (isSameLocalCalendarDay(date, now)) {
    return formatDateTime(date, { timeStyle: 'short' })
  }
  return formatDateTime(date, { dateStyle: 'short', timeStyle: 'short' })
}

export function normalizeLocationSource(
  source: RouteLocationSourceValue,
): 'ARRIVAL' | 'DELIVERY' | null {
  const value = source == null ? '' : String(source)
  if (value === 'ARRIVAL') {
    return 'ARRIVAL'
  }
  if (value === 'DELIVERY') {
    return 'DELIVERY'
  }
  return null
}

export function isHistoricalRouteStatus(
  routeStatus: RouteStatus | string,
): boolean {
  const status = String(routeStatus)
  return status === 'COMPLETED' || status === 'CANCELLED'
}

export function isActiveInProgressStatus(
  routeStatus: RouteStatus | string,
): boolean {
  return String(routeStatus) === 'IN_PROGRESS'
}

/**
 * Map safe GraphQL locationStatus (+ route context) to presentational props.
 * Does not accept raw route entities beyond the safe status object.
 */
export function toRouteLocationStatusCardProps(options: {
  locationStatus: RouteLocationStatus | null | undefined
  routeStatus: RouteStatus | string
  viewerRole: RouteLocationViewerRole
  isOfflineSnapshot?: boolean
  locationUnavailable?: boolean
}): RouteLocationStatusCardInput {
  const status = options.locationStatus
  const next = status?.nextStop ?? null

  return {
    hasLocation: Boolean(status?.hasLocation && status.city),
    city: status?.city ?? null,
    recordedAt: status?.recordedAt ?? null,
    source: status?.source ?? null,
    stopSequence: status?.stopSequence ?? null,
    hasNextStop: Boolean(status?.hasNextStop && next),
    nextStopName: next?.pharmacyName ?? null,
    nextStopSequence: next?.sequence ?? null,
    nextStopCity: next?.city ?? null,
    routeStatus: options.routeStatus,
    viewerRole: options.viewerRole,
    isHistorical: isHistoricalRouteStatus(options.routeStatus),
    isOfflineSnapshot: options.isOfflineSnapshot ?? false,
    locationUnavailable: options.locationUnavailable ?? false,
  }
}

/**
 * Map pharmacist planned-delivery location fields to presentational props.
 * Caller should only mount when isNextStop is true for an in-progress stop.
 */
export function toPharmacistNextStopLocationProps(options: {
  routeStatus: RouteStatus | string
  city: string | null | undefined
  recordedAt: string | Date | null | undefined
  source?: RouteLocationSourceValue
}): RouteLocationStatusCardInput {
  return {
    hasLocation: Boolean(options.city),
    city: options.city ?? null,
    recordedAt: options.recordedAt ?? null,
    source: options.source ?? null,
    stopSequence: null,
    hasNextStop: false,
    nextStopName: null,
    nextStopSequence: null,
    nextStopCity: null,
    routeStatus: options.routeStatus,
    viewerRole: 'APOTHEKER',
    isHistorical: false,
    isOfflineSnapshot: false,
    locationUnavailable: false,
  }
}

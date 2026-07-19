import { RouteStatus } from './route-status.enum'

const ALLOWED_TRANSITIONS: ReadonlyMap<
  RouteStatus,
  ReadonlySet<RouteStatus>
> = new Map([
  [
    RouteStatus.ASSIGNED,
    new Set([RouteStatus.IN_PROGRESS, RouteStatus.CANCELLED]),
  ],
  [
    RouteStatus.IN_PROGRESS,
    new Set([RouteStatus.COMPLETED, RouteStatus.CANCELLED]),
  ],
  [RouteStatus.COMPLETED, new Set()],
  [RouteStatus.CANCELLED, new Set()],
])

const BEZORGER_TRANSITIONS: ReadonlyMap<
  RouteStatus,
  ReadonlySet<RouteStatus>
> = new Map([
  [RouteStatus.ASSIGNED, new Set([RouteStatus.IN_PROGRESS])],
  [RouteStatus.IN_PROGRESS, new Set([RouteStatus.COMPLETED])],
  [RouteStatus.COMPLETED, new Set()],
  [RouteStatus.CANCELLED, new Set()],
])

export function canTransitionRouteStatus(
  fromStatus: RouteStatus,
  toStatus: RouteStatus,
): boolean {
  if (fromStatus === toStatus) {
    return true
  }

  return ALLOWED_TRANSITIONS.get(fromStatus)?.has(toStatus) ?? false
}

export function isTerminalRouteStatus(status: RouteStatus): boolean {
  return (
    status === RouteStatus.COMPLETED || status === RouteStatus.CANCELLED
  )
}

export function canCancelRoute(status: RouteStatus): boolean {
  return !isTerminalRouteStatus(status)
}

export function canBezorgerTransitionRouteStatus(
  fromStatus: RouteStatus,
  toStatus: RouteStatus,
): boolean {
  if (fromStatus === toStatus) {
    return true
  }

  return BEZORGER_TRANSITIONS.get(fromStatus)?.has(toStatus) ?? false
}

import { RouteLastKnownLocation } from './route-last-known-location.embed'
import { RouteLocationSource } from './route-location-source.enum'

/**
 * Event ordering / precedence for route lastKnownLocation (Phase 30A).
 *
 * Documented rule (deterministic):
 * 1. Exact duplicate `eventId` → no-op (idempotent replay)
 * 2. Newer `recordedAt` wins
 * 3. Equal `recordedAt` on the same stop: DELIVERY outranks ARRIVAL
 * 4. Older events never replace current state
 * 5. Equal time + same source (or different stops): keep current (stale)
 *
 * Do not rely solely on HTTP request arrival order — compare timestamps + source.
 */
export type LocationPrecedenceDecision =
  | 'accept'
  | 'noop_duplicate'
  | 'stale'

export function decideLocationUpdatePrecedence(
  current: RouteLastKnownLocation | null | undefined,
  candidate: Pick<
    RouteLastKnownLocation,
    'eventId' | 'recordedAt' | 'source' | 'stopId'
  >,
): LocationPrecedenceDecision {
  if (!current) {
    return 'accept'
  }

  if (current.eventId === candidate.eventId) {
    return 'noop_duplicate'
  }

  const currentMs = toEpochMs(current.recordedAt)
  const candidateMs = toEpochMs(candidate.recordedAt)

  if (candidateMs > currentMs) {
    return 'accept'
  }

  if (candidateMs < currentMs) {
    return 'stale'
  }

  // Equal recordedAt
  if (
    current.stopId === candidate.stopId &&
    current.source === RouteLocationSource.ARRIVAL &&
    candidate.source === RouteLocationSource.DELIVERY
  ) {
    return 'accept'
  }

  return 'stale'
}

function toEpochMs(value: Date | string): number {
  if (value instanceof Date) {
    return value.getTime()
  }
  return new Date(value).getTime()
}

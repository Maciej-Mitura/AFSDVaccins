import {
  CACHE_TTL_MS,
  PENDING_ACTION_DEFAULT_TTL_MS,
} from '@/offline/constants'

/** UTC ISO timestamp helpers for cache expiry and persistence metadata. */

export function nowUtcIso(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString()
}

export function expiresAtFromNow(
  ttlMs: number = CACHE_TTL_MS,
  nowMs: number = Date.now(),
): string {
  return new Date(nowMs + ttlMs).toISOString()
}

export function pendingActionExpiresAt(nowMs: number = Date.now()): string {
  return expiresAtFromNow(PENDING_ACTION_DEFAULT_TTL_MS, nowMs)
}

export function isExpired(
  expiresAt: string,
  nowMs: number = Date.now(),
): boolean {
  const expiresMs = Date.parse(expiresAt)
  if (Number.isNaN(expiresMs)) {
    return true
  }
  return expiresMs <= nowMs
}

export function buildRouteCacheKey(
  ownerUserId: string,
  routeDate: string,
): string {
  return `${ownerUserId}:${routeDate}`
}

export function buildSyncKey(ownerUserId: string, resourceKey: string): string {
  return `${ownerUserId}::${resourceKey}`
}

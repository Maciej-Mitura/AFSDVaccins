import {
  getOfflineCacheRepository,
  type OfflineCacheRepository,
} from '@/offline/offline-cache-repository'
import { serializeCourierRouteSnapshot } from '@/offline/route-snapshot'
import {
  isOfflineSessionUnlocked,
  getOfflineStorageStatus,
} from '@/offline/storage-status'
import type {
  CacheOwnerIdentity,
  CourierRouteCacheRecord,
  RouteCacheDiagnostics,
} from '@/offline/types'
import { buildRouteCacheKey, expiresAtFromNow, nowUtcIso } from '@/offline/time'

export type WriteCourierRouteInput = {
  owner: CacheOwnerIdentity
  /** Raw GraphQL myTodayRoute (or compatible) object — will be whitelisted. */
  route: unknown
  /** When true, refuse write if route.bezorgerProfileId !== owner.bezorgerProfileId */
  enforceAssignedCourier?: boolean
}

/**
 * Courier current-day route offline cache service.
 * Write after successful online fetch; read is for Phase 28B UI consumption.
 */
export class CourierRouteOfflineCacheService {
  constructor(
    private readonly repository: OfflineCacheRepository = getOfflineCacheRepository(),
  ) {}

  async writeFromOnlineRoute(
    input: WriteCourierRouteInput,
  ): Promise<CourierRouteCacheRecord | null> {
    const snapshot = serializeCourierRouteSnapshot(input.route)
    if (!snapshot) {
      return null
    }

    if (
      input.enforceAssignedCourier !== false &&
      snapshot.assignedCourierProfileId !== input.owner.bezorgerProfileId
    ) {
      return null
    }

    const fetchedAt = nowUtcIso()
    const expiresAt = expiresAtFromNow()
    const cacheKey = buildRouteCacheKey(input.owner.userId, snapshot.routeDate)

    let serverUpdatedAt: string | null = null
    if (
      typeof input.route === 'object' &&
      input.route !== null &&
      'updatedAt' in input.route
    ) {
      const rawUpdatedAt = (input.route as { updatedAt?: unknown }).updatedAt
      if (typeof rawUpdatedAt === 'string' && rawUpdatedAt.length > 0) {
        serverUpdatedAt = rawUpdatedAt
      } else if (
        typeof rawUpdatedAt === 'number' &&
        Number.isFinite(rawUpdatedAt)
      ) {
        serverUpdatedAt = new Date(rawUpdatedAt).toISOString()
      }
    }

    const record: CourierRouteCacheRecord = {
      cacheKey,
      ownerUserId: input.owner.userId,
      ownerBezorgerProfileId: input.owner.bezorgerProfileId,
      routeId: snapshot.routeId,
      routeDate: snapshot.routeDate,
      routeStatus: snapshot.routeStatus,
      assignedCourierProfileId: snapshot.assignedCourierProfileId,
      fetchedAt,
      expiresAt,
      serverUpdatedAt,
      routeSnapshot: snapshot,
    }

    const ok = await this.repository.putCourierRoute(record)
    if (!ok) {
      return null
    }

    await this.repository.deleteStaleCourierRoutesExceptDate(
      input.owner.userId,
      snapshot.routeDate,
    )
    await this.repository.markLastSuccessfulSync()
    await this.repository.removeExpiredRecords()

    return record
  }

  async readCurrentRoute(
    owner: CacheOwnerIdentity,
    routeDate: string,
  ): Promise<CourierRouteCacheRecord | null> {
    if (!isOfflineSessionUnlocked()) {
      return null
    }
    const cacheKey = buildRouteCacheKey(owner.userId, routeDate)
    const record = await this.repository.getCourierRoute(cacheKey)
    if (!record) {
      return null
    }
    if (
      record.ownerUserId !== owner.userId ||
      record.ownerBezorgerProfileId !== owner.bezorgerProfileId
    ) {
      return null
    }
    return record
  }

  async deleteRoute(
    owner: CacheOwnerIdentity,
    routeDate: string,
  ): Promise<void> {
    await this.repository.deleteCourierRoute(
      buildRouteCacheKey(owner.userId, routeDate),
    )
  }

  async getDiagnostics(
    owner: CacheOwnerIdentity,
    routeDate: string,
  ): Promise<RouteCacheDiagnostics> {
    const empty: RouteCacheDiagnostics = {
      hasCachedRoute: false,
      cachedAt: null,
      expiresAt: null,
      routeId: null,
      routeDate: null,
    }

    if (!isOfflineSessionUnlocked()) {
      return empty
    }

    const record = await this.readCurrentRoute(owner, routeDate)
    if (!record) {
      return empty
    }

    return {
      hasCachedRoute: true,
      cachedAt: record.fetchedAt,
      expiresAt: record.expiresAt,
      routeId: record.routeId,
      routeDate: record.routeDate,
    }
  }

  getStorageStatus() {
    return getOfflineStorageStatus()
  }
}

let sharedService: CourierRouteOfflineCacheService | null = null

export function getCourierRouteOfflineCacheService(): CourierRouteOfflineCacheService {
  if (!sharedService) {
    sharedService = new CourierRouteOfflineCacheService()
  }
  return sharedService
}

export function __resetCourierRouteOfflineCacheServiceForTests(): void {
  sharedService = null
}

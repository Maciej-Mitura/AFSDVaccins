import { NOTIFICATION_CACHE_LIMIT } from '@/offline/constants'
import {
  getOfflineCacheRepository,
  type OfflineCacheRepository,
} from '@/offline/offline-cache-repository'
import { isOfflineSessionUnlocked } from '@/offline/storage-status'
import type {
  NotificationCacheRecord,
  NotificationInterpolationSnapshot,
} from '@/offline/types'
import { expiresAtFromNow, isExpired, nowUtcIso } from '@/offline/time'

export type NotificationCacheSource = {
  id: string
  type: string
  titleKey?: string | null
  bodyKey?: string | null
  interpolationData?: NotificationInterpolationSnapshot | null
  actionPath?: string | null
  createdAt: string
  readAt?: string | null
  read?: boolean | null
}

/**
 * Read-only offline notification cache.
 * Does not mark-read offline and must never trigger toasts.
 */
export class NotificationOfflineCacheService {
  constructor(
    private readonly repository: OfflineCacheRepository = getOfflineCacheRepository(),
  ) {}

  async cacheFromOnlineList(
    ownerUserId: string,
    notifications: NotificationCacheSource[],
  ): Promise<number> {
    const cachedAt = nowUtcIso()
    const expiresAt = expiresAtFromNow()
    let written = 0

    const newest = [...notifications]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, NOTIFICATION_CACHE_LIMIT)

    for (const item of newest) {
      const record: NotificationCacheRecord = {
        notificationId: item.id,
        ownerUserId,
        type: item.type,
        titleKey: item.titleKey ?? null,
        bodyKey: item.bodyKey ?? null,
        interpolationData: item.interpolationData
          ? {
              routeDate: item.interpolationData.routeDate ?? null,
              pharmacyName: item.interpolationData.pharmacyName ?? null,
              city: item.interpolationData.city ?? null,
              orderReference: item.interpolationData.orderReference ?? null,
              orderCount: item.interpolationData.orderCount ?? null,
            }
          : null,
        actionPath: item.actionPath ?? null,
        createdAt: item.createdAt,
        readAt: item.readAt ?? null,
        cachedAt,
        expiresAt,
      }

      const ok = await this.repository.putNotification(record)
      if (ok) {
        written += 1
      }
    }

    await this.repository.trimNotificationsForOwner(ownerUserId)
    await this.repository.removeExpiredRecords()
    return written
  }

  /**
   * Server-wins replace: drop prior owner rows, then write the online list.
   * Prevents duplicates across reconnect refreshes.
   */
  async replaceCacheFromOnlineList(
    ownerUserId: string,
    notifications: NotificationCacheSource[],
  ): Promise<number> {
    await this.repository.deleteNotificationsForOwner(ownerUserId)
    return this.cacheFromOnlineList(ownerUserId, notifications)
  }

  /**
   * Read valid cached notifications, distinguishing expiry vs empty.
   */
  async readValidNotificationsForOwner(ownerUserId: string): Promise<{
    records: NotificationCacheRecord[]
    expiredFound: boolean
    cachedAt: string | null
  }> {
    if (!isOfflineSessionUnlocked()) {
      return { records: [], expiredFound: false, cachedAt: null }
    }

    const owned =
      await this.repository.listNotificationsForOwnerIncludingExpired(
        ownerUserId,
      )
    const valid = owned.filter(record => !isExpired(record.expiresAt))
    const expiredFound = owned.some(record => isExpired(record.expiresAt))

    if (expiredFound) {
      await this.repository.removeExpiredRecords()
    }

    const records = [...valid].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    const cachedAt =
      records.length > 0
        ? records.reduce(
            (latest, record) =>
              record.cachedAt > latest ? record.cachedAt : latest,
            records[0].cachedAt,
          )
        : null

    return { records, expiredFound, cachedAt }
  }

  /**
   * Returns cached notifications for the owner.
   * Callers must not toast from this result (Phase 28B+ UI only).
   */
  async readCachedNotifications(
    ownerUserId: string,
  ): Promise<NotificationCacheRecord[]> {
    if (!isOfflineSessionUnlocked()) {
      return []
    }
    return this.repository.getNotificationsForOwner(ownerUserId)
  }
}

let sharedService: NotificationOfflineCacheService | null = null

export function getNotificationOfflineCacheService(): NotificationOfflineCacheService {
  if (!sharedService) {
    sharedService = new NotificationOfflineCacheService()
  }
  return sharedService
}

export function __resetNotificationOfflineCacheServiceForTests(): void {
  sharedService = null
}

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
import { expiresAtFromNow, nowUtcIso } from '@/offline/time'

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

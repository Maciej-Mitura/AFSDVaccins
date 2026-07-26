import { METADATA_KEYS, NOTIFICATION_CACHE_LIMIT } from '@/offline/constants'
import {
  closeOfflineDatabase,
  isBrowserIndexedDbAvailable,
  openOfflineDatabase,
  type OfflineDatabase,
} from '@/offline/database'
import {
  classifyIndexedDbError,
  isOfflineSessionUnlocked,
  logOfflineDiagnostic,
  setOfflineStorageOnlineOnly,
  setOfflineStorageReady,
} from '@/offline/storage-status'
import type {
  CacheOwnerIdentity,
  CourierRouteCacheRecord,
  MetadataRecord,
  NotificationCacheRecord,
  PendingActionRecord,
  SyncStateRecord,
} from '@/offline/types'
import { isExpired, nowUtcIso } from '@/offline/time'

/**
 * Low-level IndexedDB repository. Components must not import this directly
 * for UI reads — use CourierRouteOfflineCacheService /
 * NotificationOfflineCacheService instead.
 */
export class OfflineCacheRepository {
  private db: OfflineDatabase | null = null

  async initialise(): Promise<boolean> {
    if (!isBrowserIndexedDbAvailable()) {
      setOfflineStorageOnlineOnly('unavailable')
      logOfflineDiagnostic('unavailable', 'initialise')
      return false
    }

    try {
      this.db = await openOfflineDatabase()
      setOfflineStorageReady()
      await this.removeExpiredRecords()
      return true
    } catch (error) {
      const category = classifyIndexedDbError(error)
      setOfflineStorageOnlineOnly(category)
      logOfflineDiagnostic(category, 'initialise')
      this.db = null
      return false
    }
  }

  private async ensureDb(): Promise<OfflineDatabase | null> {
    if (this.db) {
      return this.db
    }
    const ok = await this.initialise()
    return ok ? this.db : null
  }

  private async withDb<T>(
    operation: (db: OfflineDatabase) => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      const db = await this.ensureDb()
      if (!db) {
        return fallback
      }
      return await operation(db)
    } catch (error) {
      const category = classifyIndexedDbError(error)
      setOfflineStorageOnlineOnly(category)
      logOfflineDiagnostic(category, 'repository')
      return fallback
    }
  }

  async getMetadata(key: string): Promise<string | null> {
    return this.withDb(async db => {
      const record = await db.get('metadata', key)
      return record?.value ?? null
    }, null)
  }

  async setMetadata(key: string, value: string): Promise<void> {
    await this.withDb(async db => {
      const record: MetadataRecord = {
        key,
        value,
        updatedAt: nowUtcIso(),
      }
      await db.put('metadata', record)
    }, undefined)
  }

  async getCacheOwner(): Promise<CacheOwnerIdentity | null> {
    const userId = await this.getMetadata(
      METADATA_KEYS.CURRENT_CACHE_OWNER_USER_ID,
    )
    const bezorgerProfileId = await this.getMetadata(
      METADATA_KEYS.CURRENT_CACHE_OWNER_BEZORGER_PROFILE_ID,
    )
    if (!userId || !bezorgerProfileId) {
      return null
    }
    return { userId, bezorgerProfileId }
  }

  async setCacheOwner(owner: CacheOwnerIdentity): Promise<void> {
    await this.setMetadata(
      METADATA_KEYS.CURRENT_CACHE_OWNER_USER_ID,
      owner.userId,
    )
    await this.setMetadata(
      METADATA_KEYS.CURRENT_CACHE_OWNER_BEZORGER_PROFILE_ID,
      owner.bezorgerProfileId,
    )
  }

  async clearCacheOwner(): Promise<void> {
    await this.withDb(async db => {
      await db.delete('metadata', METADATA_KEYS.CURRENT_CACHE_OWNER_USER_ID)
      await db.delete(
        'metadata',
        METADATA_KEYS.CURRENT_CACHE_OWNER_BEZORGER_PROFILE_ID,
      )
    }, undefined)
  }

  async putCourierRoute(record: CourierRouteCacheRecord): Promise<boolean> {
    return this.withDb(async db => {
      await db.put('courierRoutes', record)
      return true
    }, false)
  }

  async getCourierRoute(
    cacheKey: string,
  ): Promise<CourierRouteCacheRecord | null> {
    if (!isOfflineSessionUnlocked()) {
      return null
    }
    return this.withDb(async db => {
      await this.removeExpiredRecords()
      const record = await db.get('courierRoutes', cacheKey)
      if (!record || isExpired(record.expiresAt)) {
        if (record) {
          await db.delete('courierRoutes', cacheKey)
        }
        return null
      }
      return record
    }, null)
  }

  async deleteCourierRoute(cacheKey: string): Promise<void> {
    await this.withDb(async db => {
      await db.delete('courierRoutes', cacheKey)
    }, undefined)
  }

  async listCourierRoutesByOwner(
    ownerUserId: string,
  ): Promise<CourierRouteCacheRecord[]> {
    if (!isOfflineSessionUnlocked()) {
      return []
    }
    return this.withDb(async db => {
      return db.getAllFromIndex('courierRoutes', 'by-owner', ownerUserId)
    }, [])
  }

  async deleteCourierRoutesForOwner(ownerUserId: string): Promise<void> {
    await this.withDb(async db => {
      const keys = await db.getAllKeysFromIndex(
        'courierRoutes',
        'by-owner',
        ownerUserId,
      )
      for (const key of keys) {
        await db.delete('courierRoutes', key)
      }
    }, undefined)
  }

  async deleteStaleCourierRoutesExceptDate(
    ownerUserId: string,
    keepRouteDate: string,
  ): Promise<void> {
    await this.withDb(async db => {
      const records = await db.getAllFromIndex(
        'courierRoutes',
        'by-owner',
        ownerUserId,
      )
      for (const record of records) {
        if (record.routeDate !== keepRouteDate) {
          await db.delete('courierRoutes', record.cacheKey)
        }
      }
    }, undefined)
  }

  async putNotification(record: NotificationCacheRecord): Promise<boolean> {
    return this.withDb(async db => {
      await db.put('notifications', record)
      return true
    }, false)
  }

  async getNotificationsForOwner(
    ownerUserId: string,
  ): Promise<NotificationCacheRecord[]> {
    if (!isOfflineSessionUnlocked()) {
      return []
    }
    return this.withDb(async db => {
      await this.removeExpiredRecords()
      const records = await db.getAllFromIndex(
        'notifications',
        'by-owner',
        ownerUserId,
      )
      return records
        .filter(record => !isExpired(record.expiresAt))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }, [])
  }

  /**
   * Lists owner notifications without removing expired rows first.
   * Used to distinguish empty vs expired cache for offline UI.
   */
  async listNotificationsForOwnerIncludingExpired(
    ownerUserId: string,
  ): Promise<NotificationCacheRecord[]> {
    if (!isOfflineSessionUnlocked()) {
      return []
    }
    return this.withDb(async db => {
      return db.getAllFromIndex('notifications', 'by-owner', ownerUserId)
    }, [])
  }

  async trimNotificationsForOwner(ownerUserId: string): Promise<void> {
    await this.withDb(async db => {
      const records = await db.getAllFromIndex(
        'notifications',
        'by-owner',
        ownerUserId,
      )
      const sorted = [...records].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )
      const excess = sorted.slice(NOTIFICATION_CACHE_LIMIT)
      for (const record of excess) {
        await db.delete('notifications', record.notificationId)
      }
    }, undefined)
  }

  async deleteNotificationsForOwner(ownerUserId: string): Promise<void> {
    await this.withDb(async db => {
      const keys = await db.getAllKeysFromIndex(
        'notifications',
        'by-owner',
        ownerUserId,
      )
      for (const key of keys) {
        await db.delete('notifications', key)
      }
    }, undefined)
  }

  async putPendingAction(record: PendingActionRecord): Promise<boolean> {
    return this.withDb(async db => {
      await db.put('pendingActions', record)
      return true
    }, false)
  }

  async getPendingAction(
    actionId: string,
  ): Promise<PendingActionRecord | null> {
    if (!isOfflineSessionUnlocked()) {
      return null
    }
    return this.withDb(async db => {
      return (await db.get('pendingActions', actionId)) ?? null
    }, null)
  }

  async deletePendingAction(actionId: string): Promise<boolean> {
    return this.withDb(async db => {
      await db.delete('pendingActions', actionId)
      return true
    }, false)
  }

  async listPendingActionsForOwner(
    ownerUserId: string,
  ): Promise<PendingActionRecord[]> {
    if (!isOfflineSessionUnlocked()) {
      return []
    }
    return this.withDb(async db => {
      return db.getAllFromIndex('pendingActions', 'by-owner', ownerUserId)
    }, [])
  }

  async deletePendingActionsForOwner(ownerUserId: string): Promise<void> {
    await this.withDb(async db => {
      const keys = await db.getAllKeysFromIndex(
        'pendingActions',
        'by-owner',
        ownerUserId,
      )
      for (const key of keys) {
        await db.delete('pendingActions', key)
      }
    }, undefined)
  }

  async putSyncState(record: SyncStateRecord): Promise<boolean> {
    return this.withDb(async db => {
      await db.put('syncState', record)
      return true
    }, false)
  }

  async deleteSyncStateForOwner(ownerUserId: string): Promise<void> {
    await this.withDb(async db => {
      const keys = await db.getAllKeysFromIndex(
        'syncState',
        'by-owner',
        ownerUserId,
      )
      for (const key of keys) {
        await db.delete('syncState', key)
      }
    }, undefined)
  }

  /**
   * Clears courier-private stores. Optionally scoped to one owner;
   * when omitted, clears all private rows (account switch / non-courier).
   */
  async clearAllPrivateData(ownerUserId?: string): Promise<void> {
    await this.withDb(async db => {
      if (ownerUserId) {
        await this.deleteCourierRoutesForOwner(ownerUserId)
        await this.deleteNotificationsForOwner(ownerUserId)
        await this.deletePendingActionsForOwner(ownerUserId)
        await this.deleteSyncStateForOwner(ownerUserId)
      } else {
        await db.clear('courierRoutes')
        await db.clear('notifications')
        await db.clear('pendingActions')
        await db.clear('syncState')
      }
      await this.clearCacheOwner()
    }, undefined)
  }

  async removeExpiredRecords(nowMs: number = Date.now()): Promise<number> {
    return this.withDb(async db => {
      let removed = 0

      const routeKeys = await db.getAllKeys('courierRoutes')
      for (const key of routeKeys) {
        const record = await db.get('courierRoutes', key)
        if (record && isExpired(record.expiresAt, nowMs)) {
          await db.delete('courierRoutes', key)
          removed += 1
        }
      }

      const notificationKeys = await db.getAllKeys('notifications')
      for (const key of notificationKeys) {
        const record = await db.get('notifications', key)
        if (record && isExpired(record.expiresAt, nowMs)) {
          await db.delete('notifications', key)
          removed += 1
        }
      }

      const pendingKeys = await db.getAllKeys('pendingActions')
      for (const key of pendingKeys) {
        const record = await db.get('pendingActions', key)
        if (record && isExpired(record.expiresAt, nowMs)) {
          await db.delete('pendingActions', key)
          removed += 1
        }
      }

      await db.put('metadata', {
        key: METADATA_KEYS.LAST_CLEANUP_AT,
        value: nowUtcIso(nowMs),
        updatedAt: nowUtcIso(nowMs),
      })

      return removed
    }, 0)
  }

  async markLastSuccessfulSync(atMs: number = Date.now()): Promise<void> {
    await this.setMetadata(
      METADATA_KEYS.LAST_SUCCESSFUL_SYNC_AT,
      nowUtcIso(atMs),
    )
  }
}

let sharedRepository: OfflineCacheRepository | null = null

export function getOfflineCacheRepository(): OfflineCacheRepository {
  if (!sharedRepository) {
    sharedRepository = new OfflineCacheRepository()
  }
  return sharedRepository
}

export async function __resetOfflineCacheRepositoryForTests(): Promise<void> {
  if (sharedRepository) {
    await sharedRepository.clearAllPrivateData()
  }
  sharedRepository = null
  await closeOfflineDatabase()
}

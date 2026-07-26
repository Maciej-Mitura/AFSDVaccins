/**
 * Phase 28A offline IndexedDB foundation — public surface.
 * Phase 28B consumes valid snapshots for courier route/notification UI.
 */

export {
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  CACHE_TTL_MS,
  NOTIFICATION_CACHE_LIMIT,
  INDEXED_DB_LIBRARY_RATIONALE,
} from '@/offline/constants'

export {
  PendingActionType,
  ForbiddenPendingActionType,
  PendingActionState,
  type CacheOwnerIdentity,
  type CachedRouteSnapshot,
  type CourierRouteCacheRecord,
  type NotificationCacheRecord,
  type PendingActionRecord,
  type RouteCacheDiagnostics,
  type OfflineStorageStatus,
} from '@/offline/types'

export {
  serializeCourierRouteSnapshot,
  assertNoForbiddenRouteCacheFields,
  containsForbiddenRouteCacheField,
  FORBIDDEN_ROUTE_CACHE_FIELD_NAMES,
} from '@/offline/route-snapshot'

export {
  hydrateDeliveryRouteFromCache,
  hydrateNotificationsFromCache,
} from '@/offline/hydrate-from-cache'

export {
  classifyRequestFailure,
  isNetworkUnavailableFailure,
  isAuthBarrierFailure,
  offlineUiErrorMessageKey,
  type OfflineUiErrorCategory,
  type RouteDataSource,
  type NotificationDataSource,
} from '@/offline/ui-error-category'

export { brusselsCalendarDate } from '@/offline/brussels-date'

export {
  isBrowserIndexedDbAvailable,
  openOfflineDatabase,
  closeOfflineDatabase,
  __resetOfflineDatabaseSingletonForTests,
} from '@/offline/database'

export {
  getOfflineStorageStatus,
  isOfflineSessionUnlocked,
  __resetOfflineStorageStatusForTests,
} from '@/offline/storage-status'

export {
  OfflineCacheRepository,
  getOfflineCacheRepository,
  __resetOfflineCacheRepositoryForTests,
} from '@/offline/offline-cache-repository'

export {
  CourierRouteOfflineCacheService,
  getCourierRouteOfflineCacheService,
  __resetCourierRouteOfflineCacheServiceForTests,
} from '@/offline/courier-route-offline-cache.service'

export {
  NotificationOfflineCacheService,
  getNotificationOfflineCacheService,
  __resetNotificationOfflineCacheServiceForTests,
} from '@/offline/notification-offline-cache.service'

export {
  PendingActionOfflineService,
  getPendingActionOfflineService,
  __resetPendingActionOfflineServiceForTests,
} from '@/offline/pending-action-offline.service'

export {
  OfflineActionSyncService,
  getOfflineActionSyncService,
  __resetOfflineActionSyncServiceForTests,
} from '@/offline/offline-action-sync.service'

export {
  OfflineCacheOwnerService,
  getOfflineCacheOwnerService,
  resolveOfflineCacheOwnerSafe,
  lockOfflineCacheForLogout,
  __resetOfflineCacheOwnerServiceForTests,
} from '@/offline/offline-cache-owner.service'

export {
  assertPendingActionTypeAllowed,
  parsePendingActionPayload,
  isForbiddenPendingActionType,
} from '@/offline/pending-action-schema'

export async function __resetAllOfflineCacheForTests(): Promise<void> {
  const { __resetOfflineCacheRepositoryForTests } =
    await import('@/offline/offline-cache-repository')
  const { __resetOfflineDatabaseSingletonForTests } =
    await import('@/offline/database')
  const { __resetOfflineStorageStatusForTests } =
    await import('@/offline/storage-status')
  const { __resetCourierRouteOfflineCacheServiceForTests } =
    await import('@/offline/courier-route-offline-cache.service')
  const { __resetNotificationOfflineCacheServiceForTests } =
    await import('@/offline/notification-offline-cache.service')
  const { __resetPendingActionOfflineServiceForTests } =
    await import('@/offline/pending-action-offline.service')
  const { __resetOfflineActionSyncServiceForTests } =
    await import('@/offline/offline-action-sync.service')
  const { __resetOfflineCacheOwnerServiceForTests } =
    await import('@/offline/offline-cache-owner.service')

  await __resetOfflineCacheRepositoryForTests()
  __resetOfflineDatabaseSingletonForTests()
  __resetOfflineStorageStatusForTests()
  __resetCourierRouteOfflineCacheServiceForTests()
  __resetNotificationOfflineCacheServiceForTests()
  __resetPendingActionOfflineServiceForTests()
  __resetOfflineActionSyncServiceForTests()
  __resetOfflineCacheOwnerServiceForTests()
}

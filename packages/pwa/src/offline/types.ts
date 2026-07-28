/**
 * Phase 28A offline cache contracts.
 *
 * Server-wins rule (encoded for later phases):
 * - Cached snapshots are read-only replicas of a prior online fetch.
 * - After reconnect, a successful online route query replaces the cache.
 * - Pending actions (Phase 28C) are validated against fresh server state;
 *   rejected/conflicting actions never overwrite authoritative server data.
 * - Server cancellation/completion invalidates unsafe pending actions.
 */

/** Bounded internal storage mode — never expose raw browser exceptions. */
export type OfflineStorageMode =
  'ready' | 'locked' | 'online-only' | 'unavailable'

export type OfflineDiagnosticCategory =
  | 'ok'
  | 'unavailable'
  | 'quota_exceeded'
  | 'migration_failed'
  | 'private_browsing'
  | 'unknown'

/**
 * Allowed pending-action types (Phase 28C: courier stop arrival only).
 */
export enum PendingActionType {
  CourierStopArrived = 'COURIER_STOP_ARRIVED',
}

/**
 * Explicitly forbidden action types (compile-time documentation + runtime guard).
 * Must never be queued.
 */
export enum ForbiddenPendingActionType {
  QrConfirmed = 'QR_CONFIRMED',
  OrderDelivered = 'ORDER_DELIVERED',
  RouteCompleted = 'ROUTE_COMPLETED',
  /** Phase 34A — offline voice-report upload is forbidden. */
  RouteVoiceReportUploaded = 'ROUTE_VOICE_REPORT_UPLOADED',
}

export enum PendingActionState {
  Pending = 'PENDING',
  Syncing = 'SYNCING',
  Succeeded = 'SUCCEEDED',
  Failed = 'FAILED',
  Conflict = 'CONFLICT',
}

export type CacheOwnerIdentity = {
  userId: string
  bezorgerProfileId: string
}

export type CachedRouteAddress = {
  street: string
  houseNumber: string
  postalCode: string
  city: string
}

export type CachedRouteLine = {
  vaccineId: string
  vaccineName: string
  quantity: number
}

export type CachedRouteStopArrival = {
  clientArrivedAt: string
  recordedAt: string
  arrivedByUserId: string
}

export type CachedRouteStop = {
  stopId: string | null
  sequence: number
  pharmacyName: string
  address: CachedRouteAddress
  orderIds: string[]
  orderCount: number
  totalQuantity: number
  lines: CachedRouteLine[]
  /** Delivery-state flags only — never QR token material. */
  qrAvailable: boolean
  qrConsumed: boolean
  deliveredAt: string | null
  /** Server-confirmed arrival only — never invent from pending overlay. */
  arrival: CachedRouteStopArrival | null
}

/**
 * Whitelisted route snapshot for IndexedDB.
 * Must never contain tokens, nonces, SVG, push secrets, or unrelated profiles.
 */
export type CachedRouteSnapshot = {
  routeId: string
  routeDate: string
  routeStatus: string
  assignedCourierProfileId: string
  stops: CachedRouteStop[]
  /** Phase 30A safe coarse location — assigned courier only; no coordinates. */
  lastKnownCourierCity: string | null
  lastKnownLocationRecordedAt: string | null
  locationSource: string | null
  nextStopSequence: number | null
  nextStopPharmacyName: string | null
  nextStopCity: string | null
}

export type CourierRouteCacheRecord = {
  /** `${ownerUserId}:${routeDate}` */
  cacheKey: string
  ownerUserId: string
  ownerBezorgerProfileId: string
  routeId: string
  routeDate: string
  routeStatus: string
  assignedCourierProfileId: string
  fetchedAt: string
  expiresAt: string
  /** Server `updatedAt` when available (revision marker). */
  serverUpdatedAt: string | null
  routeSnapshot: CachedRouteSnapshot
}

export type NotificationInterpolationSnapshot = {
  routeDate?: string | null
  pharmacyName?: string | null
  city?: string | null
  orderReference?: string | null
  orderCount?: number | null
  stopCount?: number | null
  doseCount?: number | null
  warningPercentage?: number | null
  weeklyDoseCap?: number | null
  vaccineName?: string | null
  quantityRemaining?: number | null
  stockThreshold?: number | null
}

export type NotificationCacheRecord = {
  notificationId: string
  ownerUserId: string
  type: string
  titleKey: string | null
  bodyKey: string | null
  interpolationData: NotificationInterpolationSnapshot | null
  actionPath: string | null
  createdAt: string
  /** Snapshot of server readAt at cache time — not mutated offline. */
  readAt: string | null
  cachedAt: string
  expiresAt: string
}

export type PendingActionPayload = {
  routeId: string
  stopId: string
  clientArrivedAt: string
}

export type PendingActionRecord = {
  actionId: string
  ownerUserId: string
  ownerBezorgerProfileId: string
  type: PendingActionType
  payload: PendingActionPayload
  createdAt: string
  updatedAt: string
  state: PendingActionState
  retryCount: number
  lastAttemptAt: string | null
  lastErrorCode: string | null
  idempotencyKey: string
  expiresAt: string
}

export type SyncStateRecord = {
  /** `${ownerUserId}::${resourceKey}` */
  syncKey: string
  resourceKey: string
  ownerUserId: string
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastServerRevision: string | null
  lastErrorCode: string | null
}

export type MetadataRecord = {
  key: string
  value: string
  updatedAt: string
}

export type RouteCacheDiagnostics = {
  hasCachedRoute: boolean
  cachedAt: string | null
  expiresAt: string | null
  routeId: string | null
  routeDate: string | null
}

export type OfflineStorageStatus = {
  mode: OfflineStorageMode
  diagnostic: OfflineDiagnosticCategory
  sessionUnlocked: boolean
}

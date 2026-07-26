/**
 * Phase 28A — IndexedDB offline cache constants.
 * Database name is repository-scoped only (no user ids or secrets).
 */

/** Application IndexedDB database name. */
export const OFFLINE_DB_NAME = 'vaccin-delivery-offline'

/** Current schema version (idb openDB version). */
export const OFFLINE_DB_VERSION = 1

/** Absolute cache TTL for routes and notifications (UTC). */
export const CACHE_TTL_MS = 48 * 60 * 60 * 1000

/**
 * Safe default TTL for pending actions (Phase 28C may refine).
 * Not processed in Phase 28A.
 */
export const PENDING_ACTION_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Bounded recent notification cache size. */
export const NOTIFICATION_CACHE_LIMIT = 50

/** Max JSON-ish payload keys / string length for pending actions. */
export const PENDING_ACTION_PAYLOAD_MAX_KEYS = 8
export const PENDING_ACTION_PAYLOAD_MAX_STRING_LENGTH = 256

export const METADATA_KEYS = {
  SCHEMA_VERSION: 'schemaVersion',
  CURRENT_CACHE_OWNER_USER_ID: 'currentCacheOwnerUserId',
  CURRENT_CACHE_OWNER_BEZORGER_PROFILE_ID: 'currentCacheOwnerBezorgerProfileId',
  LAST_CLEANUP_AT: 'lastCleanupAt',
  LAST_SUCCESSFUL_SYNC_AT: 'lastSuccessfulSyncAt',
} as const

export type MetadataKey = (typeof METADATA_KEYS)[keyof typeof METADATA_KEYS]

/**
 * Why `idb` was chosen over Dexie:
 * - Smallest maintained IndexedDB wrapper that still provides typed DBSchema,
 *   versioned upgrades, and a clear browser-only open path.
 * - Already present transitively in the lockfile; no heavy query DSL needed
 *   for Phase 28A’s simple key/index stores.
 * - Works cleanly with fake-indexeddb in Vitest.
 */
export const INDEXED_DB_LIBRARY_RATIONALE =
  'idb: smallest typed IndexedDB wrapper with migrations; fits Phase 28A store contracts without Dexie’s larger API surface.'

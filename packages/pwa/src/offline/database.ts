import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import {
  INDEXED_DB_LIBRARY_RATIONALE,
  METADATA_KEYS,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
} from '@/offline/constants'
import type {
  CourierRouteCacheRecord,
  MetadataRecord,
  NotificationCacheRecord,
  PendingActionRecord,
  SyncStateRecord,
} from '@/offline/types'
import { nowUtcIso } from '@/offline/time'

export { INDEXED_DB_LIBRARY_RATIONALE }

export interface VaccinDeliveryOfflineDb extends DBSchema {
  metadata: {
    key: string
    value: MetadataRecord
  }
  courierRoutes: {
    key: string
    value: CourierRouteCacheRecord
    indexes: {
      'by-owner': string
      'by-expiresAt': string
      'by-owner-date': [string, string]
    }
  }
  notifications: {
    key: string
    value: NotificationCacheRecord
    indexes: {
      'by-owner': string
      'by-expiresAt': string
      'by-owner-createdAt': [string, string]
    }
  }
  pendingActions: {
    key: string
    value: PendingActionRecord
    indexes: {
      'by-owner': string
      'by-expiresAt': string
    }
  }
  syncState: {
    key: string
    value: SyncStateRecord
    indexes: {
      'by-owner': string
    }
  }
}

export type OfflineDatabase = IDBPDatabase<VaccinDeliveryOfflineDb>

let dbPromise: Promise<OfflineDatabase> | null = null
let openFailed = false

export function isBrowserIndexedDbAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof indexedDB !== 'undefined' &&
    indexedDB !== null
  )
}

function applySchemaUpgrade(db: OfflineDatabase): void {
  if (!db.objectStoreNames.contains('metadata')) {
    db.createObjectStore('metadata', { keyPath: 'key' })
  }

  if (!db.objectStoreNames.contains('courierRoutes')) {
    const store = db.createObjectStore('courierRoutes', { keyPath: 'cacheKey' })
    store.createIndex('by-owner', 'ownerUserId')
    store.createIndex('by-expiresAt', 'expiresAt')
    store.createIndex('by-owner-date', ['ownerUserId', 'routeDate'])
  }

  if (!db.objectStoreNames.contains('notifications')) {
    const store = db.createObjectStore('notifications', {
      keyPath: 'notificationId',
    })
    store.createIndex('by-owner', 'ownerUserId')
    store.createIndex('by-expiresAt', 'expiresAt')
    store.createIndex('by-owner-createdAt', ['ownerUserId', 'createdAt'])
  }

  if (!db.objectStoreNames.contains('pendingActions')) {
    const store = db.createObjectStore('pendingActions', {
      keyPath: 'actionId',
    })
    store.createIndex('by-owner', 'ownerUserId')
    store.createIndex('by-expiresAt', 'expiresAt')
  }

  if (!db.objectStoreNames.contains('syncState')) {
    const store = db.createObjectStore('syncState', { keyPath: 'syncKey' })
    store.createIndex('by-owner', 'ownerUserId')
  }
}

/**
 * Opens the offline database. Browser-only — never during SSR/build.
 * Failures are swallowed by callers via online-only fallback.
 */
export async function openOfflineDatabase(): Promise<OfflineDatabase> {
  if (!isBrowserIndexedDbAvailable()) {
    throw new Error('INDEXED_DB_UNAVAILABLE')
  }

  if (openFailed) {
    throw new Error('INDEXED_DB_UNAVAILABLE')
  }

  if (!dbPromise) {
    dbPromise = openDB<VaccinDeliveryOfflineDb>(
      OFFLINE_DB_NAME,
      OFFLINE_DB_VERSION,
      {
        upgrade(database) {
          applySchemaUpgrade(database)
        },
      },
    )
      .then(async database => {
        const existing = await database.get(
          'metadata',
          METADATA_KEYS.SCHEMA_VERSION,
        )
        if (!existing) {
          await database.put('metadata', {
            key: METADATA_KEYS.SCHEMA_VERSION,
            value: String(OFFLINE_DB_VERSION),
            updatedAt: nowUtcIso(),
          })
        }
        return database
      })
      .catch(error => {
        openFailed = true
        dbPromise = null
        throw error
      })
  }

  return dbPromise
}

export async function closeOfflineDatabase(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise
      db.close()
    } catch {
      // ignore
    }
  }
  dbPromise = null
  openFailed = false
}

/** Test helper — resets module singleton so each suite gets a clean open. */
export function __resetOfflineDatabaseSingletonForTests(): void {
  dbPromise = null
  openFailed = false
}

export function __markOfflineDatabaseFailedForTests(): void {
  openFailed = true
  dbPromise = null
}

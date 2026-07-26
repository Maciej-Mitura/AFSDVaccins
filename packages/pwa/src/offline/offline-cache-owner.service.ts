import { UserRole } from '@vaccin-delivery/types'

import {
  getOfflineCacheRepository,
  type OfflineCacheRepository,
} from '@/offline/offline-cache-repository'
import {
  setOfflineSessionUnlocked,
  setOfflineStorageReady,
} from '@/offline/storage-status'
import type { CacheOwnerIdentity } from '@/offline/types'

/**
 * Account isolation + logout policy (Phase 28A):
 *
 * - Cache is bound to authenticated Mongo user id + bezorger profile id
 *   (never role alone).
 * - Same courier re-login before expiry: retain unexpired cache and unlock.
 * - Different courier login: clear routes, notifications, pending actions,
 *   sync state; reset owner metadata; set new owner.
 * - Non-courier login: clear all courier-private offline data.
 * - Logout: lock session (hide data) but preserve IndexedDB rows so the same
 *   courier can reuse cache on next login. Logged-out UI must never read
 *   private cache (sessionUnlocked === false).
 * - 48-hour absolute expiresAt remains the safety fallback.
 */
export class OfflineCacheOwnerService {
  constructor(
    private readonly repository: OfflineCacheRepository = getOfflineCacheRepository(),
  ) {}

  /**
   * Call after authenticated app-user resolution.
   */
  async resolveAuthenticatedOwner(options: {
    role: UserRole | string | null | undefined
    userId: string | null | undefined
    bezorgerProfileId: string | null | undefined
  }): Promise<void> {
    const ready = await this.repository.initialise()
    if (!ready) {
      setOfflineSessionUnlocked(false)
      return
    }

    await this.repository.removeExpiredRecords()

    const isCourier =
      options.role === UserRole.Bezorger || options.role === 'BEZORGER'
    const userId = options.userId?.trim() || null
    const bezorgerProfileId = options.bezorgerProfileId?.trim() || null

    if (!isCourier || !userId || !bezorgerProfileId) {
      await this.repository.clearAllPrivateData()
      setOfflineSessionUnlocked(false)
      setOfflineStorageReady()
      return
    }

    const nextOwner: CacheOwnerIdentity = { userId, bezorgerProfileId }
    const previous = await this.repository.getCacheOwner()

    if (
      previous &&
      (previous.userId !== nextOwner.userId ||
        previous.bezorgerProfileId !== nextOwner.bezorgerProfileId)
    ) {
      await this.repository.clearAllPrivateData()
    }

    await this.repository.setCacheOwner(nextOwner)
    setOfflineSessionUnlocked(true)
    setOfflineStorageReady()
  }

  /**
   * Logout / session-expired: lock reads without deleting IndexedDB.
   * In-memory UI state must still be cleared by existing logout handlers.
   */
  lockForLogout(): void {
    setOfflineSessionUnlocked(false)
  }
}

let sharedService: OfflineCacheOwnerService | null = null

export function getOfflineCacheOwnerService(): OfflineCacheOwnerService {
  if (!sharedService) {
    sharedService = new OfflineCacheOwnerService()
  }
  return sharedService
}

export function __resetOfflineCacheOwnerServiceForTests(): void {
  sharedService = null
}

/** Fire-and-forget owner resolve — never throws into auth flow. */
export function resolveOfflineCacheOwnerSafe(options: {
  role: UserRole | string | null | undefined
  userId: string | null | undefined
  bezorgerProfileId: string | null | undefined
}): void {
  void getOfflineCacheOwnerService()
    .resolveAuthenticatedOwner(options)
    .catch(() => {
      setOfflineSessionUnlocked(false)
    })
}

export function lockOfflineCacheForLogout(): void {
  getOfflineCacheOwnerService().lockForLogout()
}

import { recordDeliveryStopArrival } from '@/api/delivery-arrival-rest'
import {
  DeliveryArrivalRestError,
  isDeliveryArrivalDomainConflict,
  isDeliveryArrivalObsoleteConflict,
  isDeliveryArrivalTransientError,
} from '@/api/delivery-arrival-errors'
import {
  PENDING_ACTION_MAX_AUTO_RETRIES,
  PENDING_ACTION_RETRY_BASE_MS,
} from '@/offline/constants'
import { getPendingActionOfflineService } from '@/offline/pending-action-offline.service'
import { isOfflineSessionUnlocked } from '@/offline/storage-status'
import { PendingActionState, type PendingActionRecord } from '@/offline/types'
import { isExpired, nowUtcIso } from '@/offline/time'

export type OfflineActionSyncOwner = {
  userId: string
  bezorgerProfileId: string
}

export type OfflineActionSyncResult = {
  processed: number
  succeeded: number
  conflicts: number
  failed: number
  skipped: number
}

export type OfflineActionSyncHooks = {
  /** Fetch authoritative route before/after sync. */
  refreshAuthoritativeRoute: () => Promise<void>
  isOnline: () => boolean
}

/**
 * Focused Phase 28C sync engine for COURIER_STOP_ARRIVED pending actions.
 *
 * - Runs only while the PWA is open (no Background Sync / SW token storage).
 * - Verifies owner user + courier profile before every submission.
 * - Processes oldest eligible action first; one at a time.
 * - Server wins on domain conflicts.
 */
export class OfflineActionSyncService {
  private running = false
  private queuedRerun = false

  constructor(
    private readonly pendingActions = getPendingActionOfflineService(),
  ) {}

  async syncPendingArrivals(
    owner: OfflineActionSyncOwner,
    hooks: OfflineActionSyncHooks,
  ): Promise<OfflineActionSyncResult> {
    const empty: OfflineActionSyncResult = {
      processed: 0,
      succeeded: 0,
      conflicts: 0,
      failed: 0,
      skipped: 0,
    }

    if (!isOfflineSessionUnlocked()) {
      return empty
    }
    if (!hooks.isOnline()) {
      return empty
    }
    if (!owner.userId || !owner.bezorgerProfileId) {
      return empty
    }

    if (this.running) {
      this.queuedRerun = true
      return empty
    }

    this.running = true
    const result: OfflineActionSyncResult = { ...empty }

    try {
      // Prefer fresh server state before submitting queued mutations.
      try {
        await hooks.refreshAuthoritativeRoute()
      } catch {
        // Keep going — individual submissions still validate on the server.
      }

      const eligible = await this.pendingActions.listEligibleForSync(
        owner.userId,
        owner.bezorgerProfileId,
      )

      for (const action of eligible) {
        if (!hooks.isOnline() || !isOfflineSessionUnlocked()) {
          result.skipped += eligible.length - result.processed
          break
        }

        if (isExpired(action.expiresAt)) {
          await this.pendingActions.updateRecord({
            ...action,
            state: PendingActionState.Conflict,
            lastErrorCode: 'PENDING_ACTION_EXPIRED',
          })
          result.conflicts += 1
          result.processed += 1
          continue
        }

        if (
          action.retryCount >= PENDING_ACTION_MAX_AUTO_RETRIES &&
          action.state === PendingActionState.Failed
        ) {
          result.skipped += 1
          result.processed += 1
          continue
        }

        if (!this.isBackoffElapsed(action)) {
          result.skipped += 1
          continue
        }

        const claimed = await this.pendingActions.claimForSync(
          action.actionId,
          owner.userId,
          owner.bezorgerProfileId,
        )
        if (!claimed) {
          result.skipped += 1
          continue
        }

        result.processed += 1
        const outcome = await this.submitArrival(claimed)

        if (outcome === 'success') {
          await this.pendingActions.remove(claimed.actionId)
          result.succeeded += 1
          try {
            await hooks.refreshAuthoritativeRoute()
          } catch {
            // Action already accepted; UI refresh can retry later.
          }
          continue
        }

        if (outcome.kind === 'conflict') {
          if (outcome.remove) {
            await this.pendingActions.remove(claimed.actionId)
          } else {
            await this.pendingActions.updateRecord({
              ...claimed,
              state: PendingActionState.Conflict,
              lastErrorCode: outcome.code,
              retryCount: claimed.retryCount,
            })
          }
          result.conflicts += 1
          try {
            await hooks.refreshAuthoritativeRoute()
          } catch {
            // Best-effort.
          }
          continue
        }

        await this.pendingActions.updateRecord({
          ...claimed,
          state: PendingActionState.Failed,
          lastErrorCode: outcome.code,
          retryCount: claimed.retryCount + 1,
        })
        result.failed += 1
      }
    } finally {
      this.running = false
      if (this.queuedRerun) {
        this.queuedRerun = false
        void this.syncPendingArrivals(owner, hooks)
      }
    }

    return result
  }

  private isBackoffElapsed(action: PendingActionRecord): boolean {
    if (action.state !== PendingActionState.Failed || !action.lastAttemptAt) {
      return true
    }
    const last = Date.parse(action.lastAttemptAt)
    if (Number.isNaN(last)) {
      return true
    }
    const delay =
      PENDING_ACTION_RETRY_BASE_MS * 2 ** Math.min(action.retryCount, 4)
    return Date.now() >= last + delay
  }

  private async submitArrival(
    action: PendingActionRecord,
  ): Promise<
    | 'success'
    | { kind: 'conflict'; code: string; remove: boolean }
    | { kind: 'transient'; code: string }
  > {
    try {
      await recordDeliveryStopArrival({
        routeId: action.payload.routeId,
        stopId: action.payload.stopId,
        clientArrivedAt: action.payload.clientArrivedAt,
        idempotencyKey: action.idempotencyKey,
      })
      return 'success'
    } catch (error: unknown) {
      if (!(error instanceof DeliveryArrivalRestError)) {
        return { kind: 'transient', code: 'NETWORK_ERROR' }
      }

      // Same-key replay is success.
      if (error.code === 'DELIVERY_ARRIVAL_ALREADY_RECORDED') {
        // Different key after server arrival — drop local pending, refresh.
        return { kind: 'conflict', code: error.code, remove: true }
      }

      // Idempotent success path is a 200 from the API; ALREADY_RECORDED is
      // different-key. Treat delivered/inactive as obsolete local pending.
      if (isDeliveryArrivalObsoleteConflict(error.code)) {
        return { kind: 'conflict', code: error.code, remove: true }
      }

      if (isDeliveryArrivalDomainConflict(error.code)) {
        return { kind: 'conflict', code: error.code, remove: false }
      }

      if (isDeliveryArrivalTransientError(error.code)) {
        return { kind: 'transient', code: error.code }
      }

      return { kind: 'transient', code: error.code || 'NETWORK_ERROR' }
    }
  }
}

let sharedSyncService: OfflineActionSyncService | null = null

export function getOfflineActionSyncService(): OfflineActionSyncService {
  if (!sharedSyncService) {
    sharedSyncService = new OfflineActionSyncService()
  }
  return sharedSyncService
}

export function __resetOfflineActionSyncServiceForTests(): void {
  sharedSyncService = null
}

/** Test helper — expose now for diagnostics without leaking into UI. */
export function offlineActionSyncNowIso(): string {
  return nowUtcIso()
}

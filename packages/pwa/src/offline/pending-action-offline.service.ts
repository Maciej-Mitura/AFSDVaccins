import {
  getOfflineCacheRepository,
  type OfflineCacheRepository,
} from '@/offline/offline-cache-repository'
import {
  assertPendingActionTypeAllowed,
  parsePendingActionPayload,
} from '@/offline/pending-action-schema'
import { isOfflineSessionUnlocked } from '@/offline/storage-status'
import {
  PendingActionState,
  PendingActionType,
  type PendingActionPayload,
  type PendingActionRecord,
} from '@/offline/types'
import { isExpired, nowUtcIso, pendingActionExpiresAt } from '@/offline/time'

export type EnqueuePendingActionInput = {
  ownerUserId: string
  ownerBezorgerProfileId: string
  type: string
  payload: unknown
  idempotencyKey: string
  actionId?: string
}

export type EnqueueCourierStopArrivedInput = {
  ownerUserId: string
  ownerBezorgerProfileId: string
  routeId: string
  stopId: string
  clientArrivedAt: string
}

/**
 * Pending-action queue for Phase 28C courier stop arrival.
 */
export class PendingActionOfflineService {
  constructor(
    private readonly repository: OfflineCacheRepository = getOfflineCacheRepository(),
  ) {}

  /**
   * Validates and stores a pending action. Forbidden QR/delivery types throw.
   */
  async enqueue(
    input: EnqueuePendingActionInput,
  ): Promise<PendingActionRecord> {
    if (!isOfflineSessionUnlocked()) {
      throw new Error('PENDING_ACTION_SESSION_LOCKED')
    }

    const type = assertPendingActionTypeAllowed(input.type)
    const payload: PendingActionPayload = parsePendingActionPayload(
      type,
      input.payload,
    )

    const now = nowUtcIso()
    const record: PendingActionRecord = {
      actionId: input.actionId ?? crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      ownerBezorgerProfileId: input.ownerBezorgerProfileId,
      type,
      payload,
      createdAt: now,
      updatedAt: now,
      state: PendingActionState.Pending,
      retryCount: 0,
      lastAttemptAt: null,
      lastErrorCode: null,
      idempotencyKey: input.idempotencyKey,
      expiresAt: pendingActionExpiresAt(),
    }

    const ok = await this.repository.putPendingAction(record)
    if (!ok) {
      throw new Error('PENDING_ACTION_STORAGE_UNAVAILABLE')
    }
    return record
  }

  /**
   * Enqueue at most one active arrival action per owner + route + stop.
   * Returns the existing active action when present.
   */
  async enqueueCourierStopArrived(
    input: EnqueueCourierStopArrivedInput,
  ): Promise<{ record: PendingActionRecord; created: boolean }> {
    const existing = await this.findActiveArrivalForStop(
      input.ownerUserId,
      input.routeId,
      input.stopId,
    )
    if (existing) {
      return { record: existing, created: false }
    }

    const record = await this.enqueue({
      ownerUserId: input.ownerUserId,
      ownerBezorgerProfileId: input.ownerBezorgerProfileId,
      type: PendingActionType.CourierStopArrived,
      payload: {
        routeId: input.routeId,
        stopId: input.stopId,
        clientArrivedAt: input.clientArrivedAt,
      },
      idempotencyKey: crypto.randomUUID(),
    })
    return { record, created: true }
  }

  async findActiveArrivalForStop(
    ownerUserId: string,
    routeId: string,
    stopId: string,
  ): Promise<PendingActionRecord | null> {
    const actions = await this.listForOwner(ownerUserId)
    const active = actions
      .filter(
        action =>
          action.type === PendingActionType.CourierStopArrived &&
          action.payload.routeId === routeId &&
          action.payload.stopId === stopId &&
          (action.state === PendingActionState.Pending ||
            action.state === PendingActionState.Syncing ||
            action.state === PendingActionState.Failed) &&
          !isExpired(action.expiresAt),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    return active[0] ?? null
  }

  async listForOwner(ownerUserId: string): Promise<PendingActionRecord[]> {
    if (!isOfflineSessionUnlocked()) {
      return []
    }
    return this.repository.listPendingActionsForOwner(ownerUserId)
  }

  async listEligibleForSync(
    ownerUserId: string,
    ownerBezorgerProfileId: string,
  ): Promise<PendingActionRecord[]> {
    if (!isOfflineSessionUnlocked()) {
      return []
    }

    const actions =
      await this.repository.listPendingActionsForOwner(ownerUserId)
    return actions
      .filter(
        action =>
          action.ownerUserId === ownerUserId &&
          action.ownerBezorgerProfileId === ownerBezorgerProfileId &&
          action.type === PendingActionType.CourierStopArrived &&
          (action.state === PendingActionState.Pending ||
            action.state === PendingActionState.Failed) &&
          !isExpired(action.expiresAt),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async getById(actionId: string): Promise<PendingActionRecord | null> {
    if (!isOfflineSessionUnlocked()) {
      return null
    }
    return this.repository.getPendingAction(actionId)
  }

  /**
   * Cancel a pending/failed arrival before sync. Rejects while SYNCING.
   */
  async cancelIfCancellable(
    ownerUserId: string,
    actionId: string,
  ): Promise<{
    cancelled: boolean
    reason?: 'not_found' | 'syncing' | 'locked'
  }> {
    if (!isOfflineSessionUnlocked()) {
      return { cancelled: false, reason: 'locked' }
    }

    const existing = await this.repository.getPendingAction(actionId)
    if (!existing || existing.ownerUserId !== ownerUserId) {
      return { cancelled: false, reason: 'not_found' }
    }
    if (existing.state === PendingActionState.Syncing) {
      return { cancelled: false, reason: 'syncing' }
    }
    if (
      existing.state !== PendingActionState.Pending &&
      existing.state !== PendingActionState.Failed &&
      existing.state !== PendingActionState.Conflict
    ) {
      return { cancelled: false, reason: 'not_found' }
    }

    const ok = await this.repository.deletePendingAction(actionId)
    return { cancelled: ok }
  }

  async updateRecord(record: PendingActionRecord): Promise<boolean> {
    if (!isOfflineSessionUnlocked()) {
      return false
    }
    return this.repository.putPendingAction({
      ...record,
      updatedAt: nowUtcIso(),
    })
  }

  async remove(actionId: string): Promise<boolean> {
    return this.repository.deletePendingAction(actionId)
  }

  /**
   * Atomically claim an action for sync (PENDING/FAILED → SYNCING).
   * Returns null when another claim won or the action is gone/expired.
   */
  async claimForSync(
    actionId: string,
    ownerUserId: string,
    ownerBezorgerProfileId: string,
  ): Promise<PendingActionRecord | null> {
    if (!isOfflineSessionUnlocked()) {
      return null
    }

    const existing = await this.repository.getPendingAction(actionId)
    if (!existing) {
      return null
    }
    if (
      existing.ownerUserId !== ownerUserId ||
      existing.ownerBezorgerProfileId !== ownerBezorgerProfileId
    ) {
      return null
    }
    if (isExpired(existing.expiresAt)) {
      await this.updateRecord({
        ...existing,
        state: PendingActionState.Conflict,
        lastErrorCode: 'PENDING_ACTION_EXPIRED',
      })
      return null
    }
    if (
      existing.state !== PendingActionState.Pending &&
      existing.state !== PendingActionState.Failed
    ) {
      return null
    }

    const now = nowUtcIso()
    const claimed: PendingActionRecord = {
      ...existing,
      state: PendingActionState.Syncing,
      lastAttemptAt: now,
      updatedAt: now,
    }
    const ok = await this.repository.putPendingAction(claimed)
    if (!ok) {
      return null
    }

    // Re-read to reduce double-claim races in the same tab.
    const reloaded = await this.repository.getPendingAction(actionId)
    if (
      !reloaded ||
      reloaded.state !== PendingActionState.Syncing ||
      reloaded.lastAttemptAt !== now
    ) {
      return null
    }
    return reloaded
  }

  getAllowedTypes(): PendingActionType[] {
    return [PendingActionType.CourierStopArrived]
  }
}

let sharedService: PendingActionOfflineService | null = null

export function getPendingActionOfflineService(): PendingActionOfflineService {
  if (!sharedService) {
    sharedService = new PendingActionOfflineService()
  }
  return sharedService
}

export function __resetPendingActionOfflineServiceForTests(): void {
  sharedService = null
}

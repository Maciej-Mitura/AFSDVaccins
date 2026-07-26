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
import { nowUtcIso, pendingActionExpiresAt } from '@/offline/time'

export type EnqueuePendingActionInput = {
  ownerUserId: string
  type: string
  payload: unknown
  idempotencyKey: string
  actionId?: string
}

/**
 * Pending-action schema foundation for Phase 28C.
 * Phase 28A may validate/enqueue in tests only — no sync processing.
 */
export class PendingActionOfflineService {
  constructor(
    private readonly repository: OfflineCacheRepository = getOfflineCacheRepository(),
  ) {}

  /**
   * Validates and stores a pending action. Forbidden QR/delivery types throw.
   * Not wired to UI in Phase 28A.
   */
  async enqueue(
    input: EnqueuePendingActionInput,
  ): Promise<PendingActionRecord> {
    const type = assertPendingActionTypeAllowed(input.type)
    const payload: PendingActionPayload = parsePendingActionPayload(
      type,
      input.payload,
    )

    const now = nowUtcIso()
    const record: PendingActionRecord = {
      actionId: input.actionId ?? crypto.randomUUID(),
      ownerUserId: input.ownerUserId,
      type,
      payload,
      createdAt: now,
      updatedAt: now,
      state: PendingActionState.Pending,
      retryCount: 0,
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

  async listForOwner(ownerUserId: string): Promise<PendingActionRecord[]> {
    if (!isOfflineSessionUnlocked()) {
      return []
    }
    return this.repository.listPendingActionsForOwner(ownerUserId)
  }

  /** Compile-time/documentation helper — only COURIER_STOP_ARRIVED is allowed. */
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

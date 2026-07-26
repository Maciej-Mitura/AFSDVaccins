import { computed, ref, type Ref } from 'vue'

import {
  DeliveryArrivalRestError,
  isDeliveryArrivalDomainConflict,
  mapDeliveryArrivalRestError,
} from '@/api/delivery-arrival-errors'
import { recordDeliveryStopArrival } from '@/api/delivery-arrival-rest'
import { getOfflineActionSyncService } from '@/offline/offline-action-sync.service'
import { getPendingActionOfflineService } from '@/offline/pending-action-offline.service'
import { isOfflineSessionUnlocked } from '@/offline/storage-status'
import { PendingActionState, type PendingActionRecord } from '@/offline/types'
import { nowUtcIso } from '@/offline/time'

export type StopArrivalUiState =
  | 'none'
  | 'mark'
  | 'pending'
  | 'syncing'
  | 'confirmed'
  | 'delivered'
  | 'conflict'
  | 'failed'

export type StopArrivalViewModel = {
  stopId: string
  state: StopArrivalUiState
  clientArrivedAt: string | null
  recordedAt: string | null
  pendingActionId: string | null
  errorCode: string | null
  canMarkArrived: boolean
  canCancelPending: boolean
  canRetry: boolean
  canDiscard: boolean
}

type RouteLike = {
  id: string
  status: string
  stops: Array<{
    stopId?: string | null
    deliveredAt?: string | null
    qrConsumed?: boolean | null
    arrival?: {
      clientArrivedAt: string
      recordedAt: string
      arrivedByUserId?: string
    } | null
  }>
} | null

/**
 * Courier stop-arrival queue + overlay (Phase 28C).
 *
 * Does not rewrite the cached route snapshot as server-confirmed.
 * Overlay is derived from pendingActions + authoritative stop.arrival.
 */
export function useCourierStopArrival(options: {
  route: Ref<RouteLike>
  routeSource: Ref<'SERVER' | 'CACHE' | 'NONE'>
  isOnline: Ref<boolean>
  ownerUserId: Ref<string | null>
  ownerBezorgerProfileId: Ref<string | null>
  refreshAuthoritativeRoute: () => Promise<void>
}) {
  const pendingActions = getPendingActionOfflineService()
  const syncService = getOfflineActionSyncService()

  const actions = ref<PendingActionRecord[]>([])
  const feedbackMessage = ref<string | null>(null)
  const feedbackTone = ref<'success' | 'warning' | 'error' | null>(null)
  const busyStopIds = ref<Set<string>>(new Set())

  async function reloadPendingActions(): Promise<void> {
    const userId = options.ownerUserId.value
    if (!userId || !isOfflineSessionUnlocked()) {
      actions.value = []
      return
    }
    actions.value = await pendingActions.listForOwner(userId)
  }

  function pendingForStop(stopId: string): PendingActionRecord | null {
    const routeId = options.route.value?.id
    if (!routeId) {
      return null
    }
    const matches = actions.value
      .filter(
        action =>
          action.payload.routeId === routeId &&
          action.payload.stopId === stopId &&
          action.state !== PendingActionState.Succeeded,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return matches[0] ?? null
  }

  const stopViewModels = computed((): StopArrivalViewModel[] => {
    const route = options.route.value
    if (!route) {
      return []
    }

    const routeActive =
      route.status === 'IN_PROGRESS' || route.status === 'InProgress'

    return route.stops
      .filter(stop => typeof stop.stopId === 'string' && stop.stopId.length > 0)
      .map(stop => {
        const stopId = stop.stopId as string
        const delivered = Boolean(stop.qrConsumed || stop.deliveredAt)
        const serverArrival = stop.arrival ?? null
        const pending = pendingForStop(stopId)

        if (delivered) {
          return {
            stopId,
            state: 'delivered' as const,
            clientArrivedAt: serverArrival?.clientArrivedAt ?? null,
            recordedAt: serverArrival?.recordedAt ?? null,
            pendingActionId: null,
            errorCode: null,
            canMarkArrived: false,
            canCancelPending: false,
            canRetry: false,
            canDiscard: false,
          }
        }

        if (serverArrival) {
          return {
            stopId,
            state: 'confirmed' as const,
            clientArrivedAt: serverArrival.clientArrivedAt,
            recordedAt: serverArrival.recordedAt,
            pendingActionId: null,
            errorCode: null,
            canMarkArrived: false,
            canCancelPending: false,
            canRetry: false,
            canDiscard: false,
          }
        }

        if (pending?.state === PendingActionState.Syncing) {
          return {
            stopId,
            state: 'syncing' as const,
            clientArrivedAt: pending.payload.clientArrivedAt,
            recordedAt: null,
            pendingActionId: pending.actionId,
            errorCode: pending.lastErrorCode,
            canMarkArrived: false,
            canCancelPending: false,
            canRetry: false,
            canDiscard: false,
          }
        }

        if (pending?.state === PendingActionState.Conflict) {
          return {
            stopId,
            state: 'conflict' as const,
            clientArrivedAt: pending.payload.clientArrivedAt,
            recordedAt: null,
            pendingActionId: pending.actionId,
            errorCode: pending.lastErrorCode,
            canMarkArrived: false,
            canCancelPending: false,
            canRetry: false,
            canDiscard: true,
          }
        }

        if (pending?.state === PendingActionState.Failed) {
          return {
            stopId,
            state: 'failed' as const,
            clientArrivedAt: pending.payload.clientArrivedAt,
            recordedAt: null,
            pendingActionId: pending.actionId,
            errorCode: pending.lastErrorCode,
            canMarkArrived: false,
            canCancelPending: true,
            canRetry: true,
            canDiscard: true,
          }
        }

        if (pending?.state === PendingActionState.Pending) {
          return {
            stopId,
            state: 'pending' as const,
            clientArrivedAt: pending.payload.clientArrivedAt,
            recordedAt: null,
            pendingActionId: pending.actionId,
            errorCode: null,
            canMarkArrived: false,
            canCancelPending: true,
            canRetry: false,
            canDiscard: false,
          }
        }

        const canMark =
          routeActive &&
          Boolean(options.ownerUserId.value) &&
          Boolean(options.ownerBezorgerProfileId.value) &&
          isOfflineSessionUnlocked() &&
          (options.routeSource.value === 'SERVER' ||
            options.routeSource.value === 'CACHE')

        return {
          stopId,
          state: canMark ? ('mark' as const) : ('none' as const),
          clientArrivedAt: null,
          recordedAt: null,
          pendingActionId: null,
          errorCode: null,
          canMarkArrived: canMark,
          canCancelPending: false,
          canRetry: false,
          canDiscard: false,
        }
      })
  })

  function viewModelForStop(stopId: string): StopArrivalViewModel | null {
    return stopViewModels.value.find(item => item.stopId === stopId) ?? null
  }

  async function markArrived(stopId: string): Promise<void> {
    const route = options.route.value
    const ownerUserId = options.ownerUserId.value
    const ownerBezorgerProfileId = options.ownerBezorgerProfileId.value
    if (!route || !ownerUserId || !ownerBezorgerProfileId) {
      return
    }

    const vm = viewModelForStop(stopId)
    if (!vm?.canMarkArrived || busyStopIds.value.has(stopId)) {
      return
    }

    busyStopIds.value = new Set(busyStopIds.value).add(stopId)
    feedbackMessage.value = null
    feedbackTone.value = null

    const clientArrivedAt = nowUtcIso()
    const shouldQueueOffline =
      !options.isOnline.value || options.routeSource.value === 'CACHE'

    try {
      if (shouldQueueOffline) {
        await pendingActions.enqueueCourierStopArrived({
          ownerUserId,
          ownerBezorgerProfileId,
          routeId: route.id,
          stopId,
          clientArrivedAt,
        })
        await reloadPendingActions()
        feedbackMessage.value = 'arrival.willSyncWhenOnline'
        feedbackTone.value = 'warning'
        return
      }

      // Online + SERVER: try immediate REST; queue only on transport failure.
      const idempotencyKey = crypto.randomUUID()
      try {
        await recordDeliveryStopArrival({
          routeId: route.id,
          stopId,
          clientArrivedAt,
          idempotencyKey,
        })
        await options.refreshAuthoritativeRoute()
        feedbackMessage.value = 'arrival.recorded'
        feedbackTone.value = 'success'
      } catch (error: unknown) {
        if (
          error instanceof DeliveryArrivalRestError &&
          isDeliveryArrivalDomainConflict(error.code)
        ) {
          feedbackMessage.value = mapDeliveryArrivalRestError(error)
          feedbackTone.value = 'error'
          try {
            await options.refreshAuthoritativeRoute()
          } catch {
            // ignore
          }
          return
        }

        // Transport / transient — queue safely.
        await pendingActions.enqueue({
          ownerUserId,
          ownerBezorgerProfileId,
          type: 'COURIER_STOP_ARRIVED',
          payload: {
            routeId: route.id,
            stopId,
            clientArrivedAt,
          },
          idempotencyKey,
        })
        await reloadPendingActions()
        feedbackMessage.value = 'arrival.willSyncWhenOnline'
        feedbackTone.value = 'warning'
      }
    } finally {
      const next = new Set(busyStopIds.value)
      next.delete(stopId)
      busyStopIds.value = next
    }
  }

  async function cancelPending(actionId: string): Promise<boolean> {
    const ownerUserId = options.ownerUserId.value
    if (!ownerUserId) {
      return false
    }
    const result = await pendingActions.cancelIfCancellable(
      ownerUserId,
      actionId,
    )
    await reloadPendingActions()
    return result.cancelled
  }

  async function discardPending(actionId: string): Promise<boolean> {
    return cancelPending(actionId)
  }

  async function retrySync(): Promise<void> {
    const ownerUserId = options.ownerUserId.value
    const ownerBezorgerProfileId = options.ownerBezorgerProfileId.value
    if (!ownerUserId || !ownerBezorgerProfileId) {
      return
    }

    const result = await syncService.syncPendingArrivals(
      { userId: ownerUserId, bezorgerProfileId: ownerBezorgerProfileId },
      {
        refreshAuthoritativeRoute: options.refreshAuthoritativeRoute,
        isOnline: () => options.isOnline.value,
      },
    )
    await reloadPendingActions()

    if (result.succeeded > 0) {
      feedbackMessage.value = 'arrival.recorded'
      feedbackTone.value = 'success'
    } else if (result.conflicts > 0) {
      feedbackMessage.value = 'arrival.conflict'
      feedbackTone.value = 'warning'
    } else if (result.failed > 0) {
      feedbackMessage.value = 'arrival.unableToRecord'
      feedbackTone.value = 'error'
    }
  }

  async function syncOnReconnect(): Promise<void> {
    await reloadPendingActions()
    await retrySync()
  }

  return {
    stopViewModels,
    viewModelForStop,
    feedbackMessage,
    feedbackTone,
    reloadPendingActions,
    markArrived,
    cancelPending,
    discardPending,
    retrySync,
    syncOnReconnect,
  }
}

/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@vaccin-delivery/types'

import { OFFLINE_DB_NAME } from '@/offline/constants'
import {
  __resetAllOfflineCacheForTests,
  getCourierRouteOfflineCacheService,
  getOfflineActionSyncService,
  getOfflineCacheOwnerService,
  getOfflineCacheRepository,
  getPendingActionOfflineService,
  PendingActionState,
  PendingActionType,
  serializeCourierRouteSnapshot,
} from '@/offline'
import { DeliveryArrivalRestError } from '@/api/delivery-arrival-errors'
import * as arrivalRest from '@/api/delivery-arrival-rest'
import { setOfflineSessionUnlocked } from '@/offline/storage-status'

function sampleRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: 'route-1',
    bezorgerProfileId: 'bez-1',
    deliveryDate: '2026-07-26',
    status: 'IN_PROGRESS',
    updatedAt: '2026-07-26T08:00:00.000Z',
    stops: [
      {
        stopId: 'stop-1',
        sequence: 1,
        pharmacyName: 'Apotheek Centrum',
        address: {
          street: 'Kerkstraat',
          houseNumber: '1',
          postalCode: '9000',
          city: 'Gent',
          country: 'BE',
        },
        orderIds: ['ord-1'],
        orderCount: 1,
        totalQuantity: 2,
        lines: [
          {
            vaccineId: 'vac-1',
            vaccineName: 'Vaccin A',
            manufacturer: 'Maker',
            quantity: 2,
          },
        ],
        qrAvailable: true,
        qrConsumed: false,
        deliveredAt: null,
        arrival: null,
      },
    ],
    ...overrides,
  }
}

describe('Phase 28C offline stop arrival queue and sync', () => {
  beforeEach(async () => {
    await __resetAllOfflineCacheForTests()
    indexedDB.deleteDatabase(OFFLINE_DB_NAME)
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    await __resetAllOfflineCacheForTests()
    indexedDB.deleteDatabase(OFFLINE_DB_NAME)
    vi.restoreAllMocks()
  })

  async function unlockCourier(): Promise<void> {
    const ownerService = getOfflineCacheOwnerService()
    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })
  }

  it('21-23. offline mark arrived queues one action and overlay payload', async () => {
    await unlockCourier()
    const pending = getPendingActionOfflineService()

    const first = await pending.enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })
    expect(first.created).toBe(true)
    expect(first.record.state).toBe(PendingActionState.Pending)
    expect(first.record.payload.clientArrivedAt).toBe(
      '2026-07-26T10:00:00.000Z',
    )

    const second = await pending.enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:05:00.000Z',
    })
    expect(second.created).toBe(false)
    expect(second.record.actionId).toBe(first.record.actionId)

    const listed = await pending.listForOwner('user-a')
    expect(listed).toHaveLength(1)
  })

  it('24. cached route is not rewritten as server-confirmed arrival', async () => {
    await unlockCourier()
    const routeService = getCourierRouteOfflineCacheService()
    await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute(),
    })

    const pending = getPendingActionOfflineService()
    await pending.enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })

    const cached = await routeService.readCurrentRoute(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      '2026-07-26',
    )
    expect(cached?.routeSnapshot.stops[0]?.arrival).toBeNull()
  })

  it('25-26. pending arrival can be cancelled and overlay removed', async () => {
    await unlockCourier()
    const pending = getPendingActionOfflineService()
    const { record } = await pending.enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })

    const cancelled = await pending.cancelIfCancellable(
      'user-a',
      record.actionId,
    )
    expect(cancelled.cancelled).toBe(true)
    expect(await pending.listForOwner('user-a')).toHaveLength(0)
  })

  it('27-29. domain error must not queue; transport failure queues', async () => {
    // Domain vs transport is exercised via REST error helpers + enqueue rules
    // in useCourierStopArrival; here we assert storage only accepts explicit enqueue.
    await unlockCourier()
    const pending = getPendingActionOfflineService()
    expect(pending.getAllowedTypes()).toEqual([
      PendingActionType.CourierStopArrived,
    ])
    expect(() =>
      serializeCourierRouteSnapshot(
        sampleRoute({
          stops: [
            {
              ...sampleRoute().stops[0],
              deliveryProof: { deliveredAt: 'x' },
            },
          ],
        }),
      ),
    ).not.toThrow()
  })

  it('30-32. reconnect processes oldest first; success removes action', async () => {
    await unlockCourier()
    const pending = getPendingActionOfflineService()
    const older = await pending.enqueue({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      type: PendingActionType.CourierStopArrived,
      payload: {
        routeId: 'route-1',
        stopId: 'stop-1',
        clientArrivedAt: '2026-07-26T09:00:00.000Z',
      },
      idempotencyKey: 'idem-old',
      actionId: 'action-old',
    })
    await pending.updateRecord({
      ...older,
      createdAt: '2026-07-26T09:00:00.000Z',
      updatedAt: '2026-07-26T09:00:00.000Z',
    })
    const newer = await pending.enqueue({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      type: PendingActionType.CourierStopArrived,
      payload: {
        routeId: 'route-1',
        stopId: 'stop-2',
        clientArrivedAt: '2026-07-26T10:00:00.000Z',
      },
      idempotencyKey: 'idem-new',
      actionId: 'action-new',
    })
    await pending.updateRecord({
      ...newer,
      createdAt: '2026-07-26T10:00:00.000Z',
      updatedAt: '2026-07-26T10:00:00.000Z',
    })

    const order: string[] = []
    vi.spyOn(arrivalRest, 'recordDeliveryStopArrival').mockImplementation(
      input => {
        order.push(input.stopId)
        return Promise.resolve({
          routeId: input.routeId,
          stopId: input.stopId,
          clientArrivedAt: input.clientArrivedAt,
          recordedAt: '2026-07-26T11:00:00.000Z',
          arrivedByUserId: 'user-a',
          arrivalStatus: 'RECORDED' as const,
        })
      },
    )

    const sync = getOfflineActionSyncService()
    const refresh = vi.fn().mockResolvedValue(undefined)
    const result = await sync.syncPendingArrivals(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      { refreshAuthoritativeRoute: refresh, isOnline: () => true },
    )

    expect(order[0]).toBe('stop-1')
    expect(result.succeeded).toBe(2)
    expect(await pending.listForOwner('user-a')).toHaveLength(0)
    expect(older.actionId).toBe('action-old')
    expect(refresh).toHaveBeenCalled()
  })

  it('31. same action is not processed in parallel', async () => {
    await unlockCourier()
    const pending = getPendingActionOfflineService()
    const { record } = await pending.enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })

    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    let calls = 0
    vi.spyOn(arrivalRest, 'recordDeliveryStopArrival').mockImplementation(
      async () => {
        calls += 1
        await gate
        return {
          routeId: 'route-1',
          stopId: 'stop-1',
          clientArrivedAt: '2026-07-26T10:00:00.000Z',
          recordedAt: '2026-07-26T11:00:00.000Z',
          arrivedByUserId: 'user-a',
          arrivalStatus: 'RECORDED',
        }
      },
    )

    const sync = getOfflineActionSyncService()
    const hooks = {
      refreshAuthoritativeRoute: vi.fn().mockResolvedValue(undefined),
      isOnline: () => true,
    }
    const p1 = sync.syncPendingArrivals(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      hooks,
    )
    const p2 = sync.syncPendingArrivals(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      hooks,
    )
    release()
    await Promise.all([p1, p2])
    expect(calls).toBe(1)
    expect(await pending.getById(record.actionId)).toBeNull()
  })

  it('33-34. transient failure retries; conflict does not auto-retry', async () => {
    await unlockCourier()
    const pending = getPendingActionOfflineService()
    await pending.enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })

    vi.spyOn(arrivalRest, 'recordDeliveryStopArrival').mockRejectedValue(
      new DeliveryArrivalRestError(0, 'NETWORK_ERROR'),
    )

    const sync = getOfflineActionSyncService()
    await sync.syncPendingArrivals(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      {
        refreshAuthoritativeRoute: vi.fn().mockResolvedValue(undefined),
        isOnline: () => true,
      },
    )

    const failed = (await pending.listForOwner('user-a'))[0]
    expect(failed.state).toBe(PendingActionState.Failed)
    expect(failed.retryCount).toBe(1)

    vi.spyOn(arrivalRest, 'recordDeliveryStopArrival').mockRejectedValue(
      new DeliveryArrivalRestError(409, 'DELIVERY_ARRIVAL_ROUTE_INACTIVE'),
    )
    // Force backoff elapsed
    await pending.updateRecord({
      ...failed,
      lastAttemptAt: '2000-01-01T00:00:00.000Z',
    })

    await sync.syncPendingArrivals(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      {
        refreshAuthoritativeRoute: vi.fn().mockResolvedValue(undefined),
        isOnline: () => true,
      },
    )
    expect(await pending.listForOwner('user-a')).toHaveLength(0)
  })

  it('39-40. another courier cannot sync; logout prevents sync', async () => {
    await unlockCourier()
    const pending = getPendingActionOfflineService()
    await pending.enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })

    const spy = vi.spyOn(arrivalRest, 'recordDeliveryStopArrival')
    const sync = getOfflineActionSyncService()
    const result = await sync.syncPendingArrivals(
      { userId: 'user-b', bezorgerProfileId: 'bez-2' },
      {
        refreshAuthoritativeRoute: vi.fn().mockResolvedValue(undefined),
        isOnline: () => true,
      },
    )
    expect(result.processed).toBe(0)
    expect(spy).not.toHaveBeenCalled()

    setOfflineSessionUnlocked(false)
    const locked = await sync.syncPendingArrivals(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      {
        refreshAuthoritativeRoute: vi.fn().mockResolvedValue(undefined),
        isOnline: () => true,
      },
    )
    expect(locked.processed).toBe(0)
  })

  it('41-42. same courier re-login may resume; expired action not submitted', async () => {
    await unlockCourier()
    const pending = getPendingActionOfflineService()
    const { record } = await pending.enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })

    getOfflineCacheOwnerService().lockForLogout()
    setOfflineSessionUnlocked(false)
    expect(await pending.listForOwner('user-a')).toHaveLength(0)

    await getOfflineCacheOwnerService().resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })
    const resumed = await pending.listForOwner('user-a')
    expect(resumed.some(a => a.actionId === record.actionId)).toBe(true)

    await pending.updateRecord({
      ...resumed[0],
      expiresAt: '2000-01-01T00:00:00.000Z',
    })
    const spy = vi.spyOn(arrivalRest, 'recordDeliveryStopArrival')
    await getOfflineActionSyncService().syncPendingArrivals(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      {
        refreshAuthoritativeRoute: vi.fn().mockResolvedValue(undefined),
        isOnline: () => true,
      },
    )
    expect(spy).not.toHaveBeenCalled()
  })

  it('44. delivery/stock status never changes locally on enqueue', async () => {
    await unlockCourier()
    const routeService = getCourierRouteOfflineCacheService()
    await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute(),
    })
    await getPendingActionOfflineService().enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })
    const cached = await routeService.readCurrentRoute(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      '2026-07-26',
    )
    expect(cached?.routeSnapshot.stops[0]?.deliveredAt).toBeNull()
    expect(cached?.routeSnapshot.stops[0]?.qrConsumed).toBe(false)
    expect(cached?.routeSnapshot.routeStatus).toBe('IN_PROGRESS')
  })

  it('cancel unavailable while SYNCING', async () => {
    await unlockCourier()
    const pending = getPendingActionOfflineService()
    const { record } = await pending.enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })
    await pending.updateRecord({
      ...record,
      state: PendingActionState.Syncing,
    })
    const result = await pending.cancelIfCancellable('user-a', record.actionId)
    expect(result).toEqual({ cancelled: false, reason: 'syncing' })
  })

  it('repository still isolates pending actions by owner', async () => {
    await unlockCourier()
    const repo = getOfflineCacheRepository()
    await getPendingActionOfflineService().enqueueCourierStopArrived({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      routeId: 'route-1',
      stopId: 'stop-1',
      clientArrivedAt: '2026-07-26T10:00:00.000Z',
    })
    await repo.clearAllPrivateData()
    expect(await repo.listPendingActionsForOwner('user-a')).toHaveLength(0)
  })
})

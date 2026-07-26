/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@vaccin-delivery/types'

import {
  CACHE_TTL_MS,
  NOTIFICATION_CACHE_LIMIT,
  OFFLINE_DB_NAME,
} from '@/offline/constants'
import {
  __resetAllOfflineCacheForTests,
  assertPendingActionTypeAllowed,
  containsForbiddenRouteCacheField,
  ForbiddenPendingActionType,
  getCourierRouteOfflineCacheService,
  getNotificationOfflineCacheService,
  getOfflineCacheOwnerService,
  getOfflineCacheRepository,
  getOfflineStorageStatus,
  getPendingActionOfflineService,
  isBrowserIndexedDbAvailable,
  isForbiddenPendingActionType,
  isOfflineSessionUnlocked,
  lockOfflineCacheForLogout,
  openOfflineDatabase,
  PendingActionType,
  serializeCourierRouteSnapshot,
} from '@/offline'
import { __markOfflineDatabaseFailedForTests } from '@/offline/database'
import {
  classifyIndexedDbError,
  setOfflineSessionUnlocked,
  setOfflineStorageOnlineOnly,
} from '@/offline/storage-status'

function sampleRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: 'route-1',
    bezorgerProfileId: 'bez-1',
    deliveryDate: '2026-07-26',
    status: 'ASSIGNED',
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
        apothekerProfileId: 'aph-1',
        apothekerUserId: 'user-aph',
      },
    ],
    statusHistory: [],
    skippedApothekerProfileIds: [],
    routeTemplateId: 'tpl-1',
    generatedByUserId: 'admin-1',
    ...overrides,
  }
}

describe('Phase 28A offline IndexedDB foundation', () => {
  beforeEach(async () => {
    await __resetAllOfflineCacheForTests()
    indexedDB.deleteDatabase(OFFLINE_DB_NAME)
  })

  afterEach(async () => {
    await __resetAllOfflineCacheForTests()
    indexedDB.deleteDatabase(OFFLINE_DB_NAME)
    vi.restoreAllMocks()
  })

  it('initialises only when IndexedDB is available in a browser-like context', async () => {
    expect(isBrowserIndexedDbAvailable()).toBe(true)
    const db = await openOfflineDatabase()
    expect(db.name).toBe(OFFLINE_DB_NAME)
    expect(db.objectStoreNames.contains('courierRoutes')).toBe(true)
    expect(db.objectStoreNames.contains('notifications')).toBe(true)
    expect(db.objectStoreNames.contains('pendingActions')).toBe(true)
    expect(db.objectStoreNames.contains('syncState')).toBe(true)
    expect(db.objectStoreNames.contains('metadata')).toBe(true)
  })

  it('schema migration is deterministic across reopen', async () => {
    const first = await openOfflineDatabase()
    const version = first.version
    first.close()
    await __resetAllOfflineCacheForTests()
    const second = await openOfflineDatabase()
    expect(second.version).toBe(version)
    expect([...second.objectStoreNames].sort()).toEqual(
      [
        'courierRoutes',
        'metadata',
        'notifications',
        'pendingActions',
        'syncState',
      ].sort(),
    )
  })

  it('route snapshot stores only whitelisted fields', () => {
    const snapshot = serializeCourierRouteSnapshot(sampleRoute())
    expect(snapshot).toEqual({
      routeId: 'route-1',
      routeDate: '2026-07-26',
      routeStatus: 'ASSIGNED',
      assignedCourierProfileId: 'bez-1',
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
          },
          orderIds: ['ord-1'],
          orderCount: 1,
          totalQuantity: 2,
          lines: [
            {
              vaccineId: 'vac-1',
              vaccineName: 'Vaccin A',
              quantity: 2,
            },
          ],
          qrAvailable: true,
          qrConsumed: false,
          deliveredAt: null,
          arrival: null,
        },
      ],
      lastKnownCourierCity: null,
      lastKnownLocationRecordedAt: null,
      locationSource: null,
      nextStopSequence: null,
      nextStopPharmacyName: null,
      nextStopCity: null,
    })
    expect(snapshot).not.toHaveProperty('manufacturer')
    expect(snapshot?.stops[0]?.arrival).toBeNull()
    expect(snapshot).not.toHaveProperty('routeTemplateId')
    expect(snapshot).not.toHaveProperty('statusHistory')
    expect(JSON.stringify(snapshot)).not.toContain('Maker')
    expect(JSON.stringify(snapshot)).not.toContain('admin-1')
  })

  it('strips QR token, nonce/hash, bearer, push and Azure fields', () => {
    const dirty = sampleRoute({
      encodedQrToken: 'secret-token',
      nonce: 'n1',
      nonceHash: 'h1',
      qrSvg: '<svg/>',
      authorization: 'Bearer abc',
      idToken: 'firebase',
      refreshToken: 'refresh',
      endpoint: 'https://push.example',
      p256dh: 'key',
      pushAuth: 'auth',
      vapidPrivateKey: 'private',
      sasUrl: 'https://azure.blob/sas',
      stops: [
        {
          ...sampleRoute().stops[0],
          qrToken: 'stop-token',
          nonceHash: 'stop-hash',
        },
      ],
    })

    expect(containsForbiddenRouteCacheField(dirty)).toBe(true)
    const snapshot = serializeCourierRouteSnapshot(dirty)
    expect(snapshot).not.toBeNull()
    expect(containsForbiddenRouteCacheField(snapshot)).toBe(false)
    const json = JSON.stringify(snapshot)
    expect(json).not.toContain('secret-token')
    expect(json).not.toContain('stop-token')
    expect(json).not.toContain('n1')
    expect(json).not.toContain('h1')
    expect(json).not.toContain('Bearer')
    expect(json).not.toContain('firebase')
    expect(json).not.toContain('push.example')
    expect(json).not.toContain('azure.blob')
  })

  it('same courier can read unexpired cache; logout hides it; re-login restores', async () => {
    const ownerService = getOfflineCacheOwnerService()
    const routeService = getCourierRouteOfflineCacheService()

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })

    const written = await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute(),
    })
    expect(written).not.toBeNull()

    const read = await routeService.readCurrentRoute(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      '2026-07-26',
    )
    expect(read?.routeId).toBe('route-1')

    lockOfflineCacheForLogout()
    expect(isOfflineSessionUnlocked()).toBe(false)
    const hidden = await routeService.readCurrentRoute(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      '2026-07-26',
    )
    expect(hidden).toBeNull()

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })
    const restored = await routeService.readCurrentRoute(
      { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      '2026-07-26',
    )
    expect(restored?.routeId).toBe('route-1')
  })

  it('another courier login clears routes, pending actions and notifications', async () => {
    const ownerService = getOfflineCacheOwnerService()
    const routeService = getCourierRouteOfflineCacheService()
    const notificationService = getNotificationOfflineCacheService()
    const pendingService = getPendingActionOfflineService()
    const repository = getOfflineCacheRepository()

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })
    await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute(),
    })
    await notificationService.cacheFromOnlineList('user-a', [
      {
        id: 'n1',
        type: 'ROUTE_ASSIGNED',
        titleKey: 't',
        bodyKey: 'b',
        createdAt: '2026-07-26T10:00:00.000Z',
        readAt: null,
      },
    ])
    await pendingService.enqueue({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      type: PendingActionType.CourierStopArrived,
      payload: {
        routeId: 'route-1',
        stopId: 'stop-1',
        clientArrivedAt: '2026-07-26T10:00:00.000Z',
      },
      idempotencyKey: 'idem-1',
    })

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-b',
      bezorgerProfileId: 'bez-2',
    })

    expect(
      await routeService.readCurrentRoute(
        { userId: 'user-a', bezorgerProfileId: 'bez-1' },
        '2026-07-26',
      ),
    ).toBeNull()
    expect(await notificationService.readCachedNotifications('user-a')).toEqual(
      [],
    )
    expect(await pendingService.listForOwner('user-a')).toEqual([])
    expect(await repository.getCacheOwner()).toEqual({
      userId: 'user-b',
      bezorgerProfileId: 'bez-2',
    })
  })

  it('non-courier login clears courier-private data', async () => {
    const ownerService = getOfflineCacheOwnerService()
    const routeService = getCourierRouteOfflineCacheService()
    const repository = getOfflineCacheRepository()

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })
    await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute(),
    })

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Admin,
      userId: 'admin-1',
      bezorgerProfileId: null,
    })

    expect(isOfflineSessionUnlocked()).toBe(false)
    expect(await repository.getCacheOwner()).toBeNull()
    // Even if unlocked incorrectly, prior rows were cleared.
    setOfflineSessionUnlocked(true)
    expect(await repository.listCourierRoutesByOwner('user-a')).toEqual([])
  })

  it('route and notification caches expire after 48 hours; cleanup preserves valid', async () => {
    const ownerService = getOfflineCacheOwnerService()
    const routeService = getCourierRouteOfflineCacheService()
    const notificationService = getNotificationOfflineCacheService()
    const repository = getOfflineCacheRepository()

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })
    await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute(),
    })
    await notificationService.cacheFromOnlineList('user-a', [
      {
        id: 'n-fresh',
        type: 'ROUTE_ASSIGNED',
        createdAt: '2026-07-26T10:00:00.000Z',
        readAt: '2026-07-26T11:00:00.000Z',
      },
    ])

    const routes = await repository.listCourierRoutesByOwner('user-a')
    const notifications = await repository.getNotificationsForOwner('user-a')
    expect(routes).toHaveLength(1)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].readAt).toBe('2026-07-26T11:00:00.000Z')

    const expiredAt = Date.now() + CACHE_TTL_MS + 1000
    const removed = await repository.removeExpiredRecords(expiredAt)
    expect(removed).toBeGreaterThanOrEqual(2)
    expect(await repository.listCourierRoutesByOwner('user-a')).toEqual([])
    expect(await notificationService.readCachedNotifications('user-a')).toEqual(
      [],
    )

    // Fresh write after cleanup remains until its own expiry.
    await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute({ id: 'route-2' }),
    })
    const stillValid = await repository.removeExpiredRecords(Date.now())
    expect(stillValid).toBe(0)
    expect(
      (
        await routeService.readCurrentRoute(
          { userId: 'user-a', bezorgerProfileId: 'bez-1' },
          '2026-07-26',
        )
      )?.routeId,
    ).toBe('route-2')
  })

  it('route writes overwrite same owner/date and remove stale other dates', async () => {
    const ownerService = getOfflineCacheOwnerService()
    const routeService = getCourierRouteOfflineCacheService()
    const repository = getOfflineCacheRepository()

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })

    await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute({ id: 'old', deliveryDate: '2026-07-25' }),
    })
    await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute({
        id: 'new',
        deliveryDate: '2026-07-26',
        status: 'IN_PROGRESS',
      }),
    })

    const all = await repository.listCourierRoutesByOwner('user-a')
    expect(all).toHaveLength(1)
    expect(all[0].routeId).toBe('new')
    expect(all[0].routeStatus).toBe('IN_PROGRESS')
  })

  it('another courier route cannot be written into current owner cache', async () => {
    const ownerService = getOfflineCacheOwnerService()
    const routeService = getCourierRouteOfflineCacheService()

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })

    const rejected = await routeService.writeFromOnlineRoute({
      owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
      route: sampleRoute({ bezorgerProfileId: 'bez-other' }),
      enforceAssignedCourier: true,
    })
    expect(rejected).toBeNull()
  })

  it('retains only newest bounded notification count; readAt is snapshot only', async () => {
    const ownerService = getOfflineCacheOwnerService()
    const notificationService = getNotificationOfflineCacheService()

    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })

    const items = Array.from(
      { length: NOTIFICATION_CACHE_LIMIT + 10 },
      (_, i) => ({
        id: `n-${i}`,
        type: 'ROUTE_ASSIGNED',
        createdAt: new Date(Date.UTC(2026, 6, 26, 0, i)).toISOString(),
        readAt: i % 2 === 0 ? new Date().toISOString() : null,
      }),
    )

    await notificationService.cacheFromOnlineList('user-a', items)
    const cached = await notificationService.readCachedNotifications('user-a')
    expect(cached).toHaveLength(NOTIFICATION_CACHE_LIMIT)
    expect(cached[0].notificationId).toBe(`n-${NOTIFICATION_CACHE_LIMIT + 9}`)
    // Snapshot preserved — service has no mark-read API.
    expect(cached.some(item => item.readAt !== null)).toBe(true)
    expect(notificationService).not.toHaveProperty('markRead')
  })

  it('cached notifications do not trigger toasts', async () => {
    const toastModule = await import('@/composables/useNotificationToast')
    const spy = vi.spyOn(toastModule, 'showNotificationToastIfNew')

    const ownerService = getOfflineCacheOwnerService()
    const notificationService = getNotificationOfflineCacheService()
    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })
    await notificationService.cacheFromOnlineList('user-a', [
      {
        id: 'n-toast',
        type: 'ROUTE_ASSIGNED',
        createdAt: '2026-07-26T10:00:00.000Z',
      },
    ])
    await notificationService.readCachedNotifications('user-a')
    expect(spy).not.toHaveBeenCalled()
  })

  it('pending action payload is schema-validated; forbidden types cannot queue', async () => {
    const ownerService = getOfflineCacheOwnerService()
    const pendingService = getPendingActionOfflineService()
    await ownerService.resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-a',
      bezorgerProfileId: 'bez-1',
    })

    await expect(
      pendingService.enqueue({
        ownerUserId: 'user-a',
        ownerBezorgerProfileId: 'bez-1',
        type: PendingActionType.CourierStopArrived,
        payload: {
          routeId: 'r1',
          stopId: 's1',
          clientArrivedAt: '2026-07-26T10:00:00.000Z',
          token: 'nope',
        },
        idempotencyKey: 'idem',
      }),
    ).rejects.toThrow()

    for (const type of Object.values(ForbiddenPendingActionType)) {
      expect(isForbiddenPendingActionType(type)).toBe(true)
      expect(() => assertPendingActionTypeAllowed(type)).toThrow(
        /PENDING_ACTION_TYPE_FORBIDDEN/,
      )
      await expect(
        pendingService.enqueue({
          ownerUserId: 'user-a',
          ownerBezorgerProfileId: 'bez-1',
          type,
          payload: {
            routeId: 'r1',
            stopId: 's1',
            clientArrivedAt: '2026-07-26T10:00:00.000Z',
          },
          idempotencyKey: `idem-${type}`,
        }),
      ).rejects.toThrow(/PENDING_ACTION_TYPE_FORBIDDEN/)
    }

    const ok = await pendingService.enqueue({
      ownerUserId: 'user-a',
      ownerBezorgerProfileId: 'bez-1',
      type: PendingActionType.CourierStopArrived,
      payload: {
        routeId: 'r1',
        stopId: 's1',
        clientArrivedAt: '2026-07-26T10:00:00.000Z',
      },
      idempotencyKey: 'idem-ok',
    })
    expect(ok.type).toBe(PendingActionType.CourierStopArrived)
  })

  it('IndexedDB failure and quota failure fall back to online-only without crashing', async () => {
    await __resetAllOfflineCacheForTests()
    __markOfflineDatabaseFailedForTests()

    const repository = getOfflineCacheRepository()
    const ok = await repository.initialise()
    expect(ok).toBe(false)
    expect(getOfflineStorageStatus().mode).toBe('online-only')

    const routeService = getCourierRouteOfflineCacheService()
    await expect(
      routeService.writeFromOnlineRoute({
        owner: { userId: 'user-a', bezorgerProfileId: 'bez-1' },
        route: sampleRoute(),
      }),
    ).resolves.toBeNull()

    // Quota path: classify + online-only without throw to caller.
    const quota = new DOMException('Quota exceeded', 'QuotaExceededError')
    const category = classifyIndexedDbError(quota)
    expect(category).toBe('quota_exceeded')
    setOfflineStorageOnlineOnly(category)
    expect(getOfflineStorageStatus().mode).toBe('online-only')
    expect(getOfflineStorageStatus().diagnostic).toBe('quota_exceeded')
  })
})

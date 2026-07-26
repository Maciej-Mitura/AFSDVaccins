/**
 * @vitest-environment happy-dom
 *
 * Phase 28B — offline courier route and notification viewing.
 */
import 'fake-indexeddb/auto'

import { ApolloError } from '@apollo/client/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@vaccin-delivery/types'

import {
  __resetAllOfflineCacheForTests,
  getCourierRouteOfflineCacheService,
  getNotificationOfflineCacheService,
  getOfflineCacheOwnerService,
  getPendingActionOfflineService,
  OFFLINE_DB_NAME,
  PendingActionType,
} from '@/offline'
import {
  __resetTodayRouteStateForTests,
  useDeliveryRoutes,
} from '@/composables/useDeliveryRoutes'
import {
  __resetNotificationOfflineStateForTests,
  useNotifications,
} from '@/composables/useNotifications'
import { __resetOnlineStatusForTests } from '@/composables/useOnlineStatus'
import { __resetAppI18nForTests } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import {
  classifyRequestFailure,
  isNetworkUnavailableFailure,
} from '@/offline/ui-error-category'
import { hydrateDeliveryRouteFromCache } from '@/offline/hydrate-from-cache'
import { CACHE_TTL_MS } from '@/offline/constants'

const queryMock = vi.fn()
const mutateMock = vi.fn()
const writeQueryMock = vi.fn()
const subscribeMock: ReturnType<typeof vi.fn> = vi.fn(() => ({
  subscribe: () => ({ unsubscribe: vi.fn() }),
}))

type TestCurrentUser = {
  id: string
  role: string
  bezorgerProfile: { id: string } | null
} | null

const currentUser = vi.hoisted(() => {
  const state: { value: TestCurrentUser } = {
    value: {
      id: 'user-1',
      role: 'BEZORGER',
      bezorgerProfile: { id: 'bez-1' },
    },
  }
  return state
})

const initialized = vi.hoisted(() => ({ value: true }))

let reconnectHandlers: Array<() => void | Promise<void>> = []

vi.mock('@/composables/useGraphQL', () => ({
  default: () => ({
    apolloClient: {
      query: (options: unknown) => queryMock(options),
      mutate: (options: unknown) => mutateMock(options),
      writeQuery: (options: unknown) => writeQueryMock(options),
      subscribe: (options: unknown) => subscribeMock(options),
    },
  }),
  registerReconnectHandler: (handler: () => void | Promise<void>) => {
    reconnectHandlers.push(handler)
    return () => {
      reconnectHandlers = reconnectHandlers.filter(item => item !== handler)
    }
  },
  triggerReconnectHandlers: async () => {
    await Promise.all(
      reconnectHandlers.map(handler => Promise.resolve(handler())),
    )
  },
}))

vi.mock('@/composables/useCurrentUser', async () => {
  const actual = await vi.importActual<
    typeof import('@/composables/useCurrentUser')
  >('@/composables/useCurrentUser')
  return {
    ...actual,
    useCurrentUser: () => ({
      currentUser,
      initialized,
    }),
    mapGraphQLError: actual.mapGraphQLError,
  }
})

function sampleRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: 'route-1',
    routeTemplateId: 'tpl-1',
    bezorgerProfileId: 'bez-1',
    deliveryDate: '2026-07-26',
    status: 'ASSIGNED',
    skippedApothekerProfileIds: [],
    generatedAt: '2026-07-26T06:00:00.000Z',
    generatedByUserId: 'admin-1',
    createdAt: '2026-07-26T06:00:00.000Z',
    updatedAt: '2026-07-26T08:00:00.000Z',
    statusHistory: [],
    stops: [
      {
        stopId: 'stop-1',
        sequence: 1,
        apothekerProfileId: 'aph-1',
        apothekerUserId: 'user-aph',
        pharmacyName: 'Apotheek Centrum',
        address: {
          street: 'Kerkstraat',
          houseNumber: '1',
          postalCode: '9000',
          city: 'Gent',
          country: 'BE',
        },
        orderIds: ['ord-1', 'ord-2'],
        orderCount: 2,
        totalQuantity: 5,
        lines: [
          {
            vaccineId: 'vac-1',
            vaccineName: 'Vaccin A',
            manufacturer: 'Maker',
            quantity: 3,
          },
          {
            vaccineId: 'vac-2',
            vaccineName: 'Vaccin B',
            manufacturer: 'Maker',
            quantity: 2,
          },
        ],
        qrAvailable: true,
        qrConsumed: false,
        deliveredAt: null,
      },
    ],
    ...overrides,
  }
}

function networkApolloError(): ApolloError {
  return new ApolloError({
    networkError: Object.assign(new Error('Failed to fetch'), {
      name: 'ServerError',
      statusCode: 0,
    }),
  })
}

function domainApolloError(): ApolloError {
  return new ApolloError({
    graphQLErrors: [
      {
        message: 'Domain failure',
        extensions: { code: 'DELIVERY_ROUTE_NOT_FOUND' },
      },
    ],
  })
}

function authApolloError(): ApolloError {
  return new ApolloError({
    graphQLErrors: [
      {
        message: 'Unauthenticated',
        extensions: { code: 'UNAUTHENTICATED' },
      },
    ],
  })
}

async function seedOwnerAndRoute(): Promise<void> {
  await getOfflineCacheOwnerService().resolveAuthenticatedOwner({
    role: UserRole.Bezorger,
    userId: 'user-1',
    bezorgerProfileId: 'bez-1',
  })
  await getCourierRouteOfflineCacheService().writeFromOnlineRoute({
    owner: { userId: 'user-1', bezorgerProfileId: 'bez-1' },
    route: sampleRoute(),
    enforceAssignedCourier: true,
  })
}

describe('Phase 28B offline route and notification viewing', () => {
  beforeEach(async () => {
    await __resetAllOfflineCacheForTests()
    indexedDB.deleteDatabase(OFFLINE_DB_NAME)
    __resetTodayRouteStateForTests()
    __resetNotificationOfflineStateForTests()
    __resetOnlineStatusForTests()
    __resetAppI18nForTests()
    __resetLocaleLoaderForTests()
    createTestI18n('en')
    reconnectHandlers = []
    queryMock.mockReset()
    mutateMock.mockReset()
    writeQueryMock.mockReset()
    currentUser.value = {
      id: 'user-1',
      role: UserRole.Bezorger,
      bezorgerProfile: { id: 'bez-1' },
    }
    initialized.value = true
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
  })

  afterEach(async () => {
    await __resetAllOfflineCacheForTests()
    indexedDB.deleteDatabase(OFFLINE_DB_NAME)
    __resetTodayRouteStateForTests()
    __resetNotificationOfflineStateForTests()
    __resetOnlineStatusForTests()
    vi.restoreAllMocks()
  })

  it('classifies network vs domain Apollo failures', () => {
    expect(isNetworkUnavailableFailure(networkApolloError())).toBe(true)
    expect(classifyRequestFailure(domainApolloError())).toBe('SERVER_ERROR')
    expect(classifyRequestFailure(authApolloError())).toBe('AUTH_REQUIRED')
  })

  it('1-2: successful online route renders SERVER source and updates cache', async () => {
    queryMock.mockResolvedValueOnce({ data: { myTodayRoute: sampleRoute() } })

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()

    expect(api.todayRouteSource.value).toBe('SERVER')
    expect(api.todayRouteIsReadOnly.value).toBe(false)
    expect(api.myTodayRoute.value?.id).toBe('route-1')

    const cached =
      await getCourierRouteOfflineCacheService().readValidRouteForOwner({
        userId: 'user-1',
        bezorgerProfileId: 'bez-1',
      })
    expect(cached.record?.routeId).toBe('route-1')
  })

  it('3: browser offline loads valid cached route', async () => {
    await seedOwnerAndRoute()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()

    expect(queryMock).not.toHaveBeenCalled()
    expect(api.todayRouteSource.value).toBe('CACHE')
    expect(api.todayRouteIsReadOnly.value).toBe(true)
    expect(api.myTodayRoute.value?.stops[0]?.pharmacyName).toBe(
      'Apotheek Centrum',
    )
  })

  it('4: API network failure loads valid cached route', async () => {
    await seedOwnerAndRoute()
    queryMock.mockRejectedValueOnce(networkApolloError())

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()

    expect(api.todayRouteSource.value).toBe('CACHE')
    expect(api.myTodayRoute.value?.id).toBe('route-1')
  })

  it('5: GraphQL domain error does not incorrectly use cache', async () => {
    await seedOwnerAndRoute()
    queryMock.mockRejectedValueOnce(domainApolloError())

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()

    expect(api.todayRouteSource.value).toBe('NONE')
    expect(api.myTodayRoute.value).toBeNull()
    expect(api.todayRouteErrorCategory.value).toBe('SERVER_ERROR')
  })

  it('6: authentication error does not expose cached route', async () => {
    await seedOwnerAndRoute()
    queryMock.mockRejectedValueOnce(authApolloError())

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()

    expect(api.myTodayRoute.value).toBeNull()
    expect(api.todayRouteErrorCategory.value).toBe('AUTH_REQUIRED')
  })

  it('7: expired cache is not rendered', async () => {
    await getOfflineCacheOwnerService().resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-1',
      bezorgerProfileId: 'bez-1',
    })
    await getCourierRouteOfflineCacheService().writeFromOnlineRoute({
      owner: { userId: 'user-1', bezorgerProfileId: 'bez-1' },
      route: sampleRoute(),
    })

    const { getOfflineCacheRepository } =
      await import('@/offline/offline-cache-repository')
    const repository = getOfflineCacheRepository()
    const listed = await repository.listCourierRoutesByOwner('user-1')
    expect(listed.length).toBeGreaterThan(0)
    const expiredAt = new Date(Date.now() - 60_000).toISOString()
    for (const record of listed) {
      await repository.putCourierRoute({
        ...record,
        expiresAt: expiredAt,
      })
    }

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()

    expect(api.myTodayRoute.value).toBeNull()
    expect(api.todayRouteErrorCategory.value).toBe('OFFLINE_CACHE_EXPIRED')
  })

  it('8: no cache shows offline-unavailable state', async () => {
    await getOfflineCacheOwnerService().resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-1',
      bezorgerProfileId: 'bez-1',
    })
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()

    expect(api.todayRouteSource.value).toBe('NONE')
    expect(api.todayRouteErrorCategory.value).toBe('OFFLINE_NO_CACHE')
  })

  it('9-11: cached route exposes whitelist fields and metadata', async () => {
    await seedOwnerAndRoute()
    const { record } =
      await getCourierRouteOfflineCacheService().readValidRouteForOwner({
        userId: 'user-1',
        bezorgerProfileId: 'bez-1',
      })
    expect(record).not.toBeNull()
    const hydrated = hydrateDeliveryRouteFromCache(record!)
    expect(hydrated.stops[0]?.pharmacyName).toBe('Apotheek Centrum')
    expect(hydrated.stops[0]?.address.postalCode).toBe('9000')
    expect(hydrated.stops[0]?.address.city).toBe('Gent')
    expect(hydrated.stops[0]?.orderIds).toEqual(['ord-1', 'ord-2'])
    expect(hydrated.stops[0]?.lines[0]?.vaccineName).toBe('Vaccin A')
    expect(hydrated.stops[0]?.lines[0]?.quantity).toBe(3)
    expect(record!.fetchedAt).toBeTruthy()
  })

  it('12-17: read-only mode blocks mutations and queues nothing', async () => {
    await seedOwnerAndRoute()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()
    expect(api.todayRouteIsReadOnly.value).toBe(true)

    const updated = await api.updateRouteStatus(
      'route-1',
      'IN_PROGRESS' as never,
    )
    expect(updated).toBeNull()
    expect(mutateMock).not.toHaveBeenCalled()

    const pending =
      await getPendingActionOfflineService().listForOwner('user-1')
    expect(pending).toHaveLength(0)
    expect(PendingActionType.CourierStopArrived).toBe('COURIER_STOP_ARRIVED')
  })

  it('18-19: reconnect performs one authoritative refetch and replaces cache', async () => {
    await seedOwnerAndRoute()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()
    expect(api.todayRouteSource.value).toBe('CACHE')

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    __resetOnlineStatusForTests()

    const serverRoute = sampleRoute({
      status: 'IN_PROGRESS',
      stops: [
        {
          ...sampleRoute().stops[0],
          pharmacyName: 'Updated Pharmacy',
        },
      ],
    })
    queryMock.mockResolvedValueOnce({ data: { myTodayRoute: serverRoute } })

    api.subscribeToTodayRouteUpdates()
    expect(reconnectHandlers).toHaveLength(1)
    const reconnect = reconnectHandlers[0]
    expect(reconnect).toBeTypeOf('function')
    await reconnect()

    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(api.todayRouteSource.value).toBe('SERVER')
    expect(api.myTodayRoute.value?.status).toBe('IN_PROGRESS')
    expect(api.myTodayRoute.value?.stops[0]?.pharmacyName).toBe(
      'Updated Pharmacy',
    )
    api.stopTodayRouteSubscription()
  })

  it('20-22: cancelled / completed / unassigned server route replaces cache', async () => {
    await seedOwnerAndRoute()

    const api = useDeliveryRoutes()

    queryMock.mockResolvedValueOnce({
      data: { myTodayRoute: sampleRoute({ status: 'CANCELLED' }) },
    })
    await api.loadMyTodayRoute()
    expect(api.myTodayRoute.value?.status).toBe('CANCELLED')
    expect(api.todayRouteSource.value).toBe('SERVER')

    queryMock.mockResolvedValueOnce({
      data: { myTodayRoute: sampleRoute({ status: 'COMPLETED' }) },
    })
    await api.loadMyTodayRoute()
    expect(api.myTodayRoute.value?.status).toBe('COMPLETED')

    queryMock.mockResolvedValueOnce({ data: { myTodayRoute: null } })
    await api.loadMyTodayRoute()
    expect(api.myTodayRoute.value).toBeNull()
    expect(api.todayRouteSource.value).toBe('NONE')

    const cached =
      await getCourierRouteOfflineCacheService().readValidRouteForOwner({
        userId: 'user-1',
        bezorgerProfileId: 'bez-1',
      })
    expect(cached.record).toBeNull()
  })

  it('23-24: refresh failure keeps valid cached route; manual retry works', async () => {
    await seedOwnerAndRoute()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()
    expect(api.todayRouteSource.value).toBe('CACHE')

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    __resetOnlineStatusForTests()
    queryMock.mockRejectedValueOnce(networkApolloError())
    await api.loadMyTodayRoute({ isRefresh: true })

    expect(api.todayRouteSource.value).toBe('CACHE')
    expect(api.todayRouteIsReadOnly.value).toBe(true)
    expect(api.todayRouteRefreshError.value).toBeTruthy()

    queryMock.mockResolvedValueOnce({
      data: { myTodayRoute: sampleRoute({ status: 'IN_PROGRESS' }) },
    })
    await api.loadMyTodayRoute({ isRefresh: true })
    expect(api.todayRouteSource.value).toBe('SERVER')
    expect(api.myTodayRoute.value?.status).toBe('IN_PROGRESS')
  })

  it('25-27: logout clears UI; other courier never sees prior cache; no auth flash', async () => {
    await seedOwnerAndRoute()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()
    expect(api.myTodayRoute.value).not.toBeNull()

    initialized.value = false
    currentUser.value = null
    api.clearTodayRouteState()
    expect(api.myTodayRoute.value).toBeNull()

    // Auth still initializing — must not load previous cache.
    await api.loadMyTodayRoute()
    expect(api.myTodayRoute.value).toBeNull()

    initialized.value = true
    currentUser.value = {
      id: 'user-2',
      role: UserRole.Bezorger,
      bezorgerProfile: { id: 'bez-2' },
    }
    await getOfflineCacheOwnerService().resolveAuthenticatedOwner({
      role: UserRole.Bezorger,
      userId: 'user-2',
      bezorgerProfileId: 'bez-2',
    })
    await api.loadMyTodayRoute()
    expect(api.myTodayRoute.value).toBeNull()
    expect(api.todayRouteErrorCategory.value).toBe('OFFLINE_NO_CACHE')
  })

  it('28-35: notification online/offline/read-only/reconnect behaviour', async () => {
    const toastSeen = vi.fn()
    vi.doMock('@/composables/useNotificationToast', () => ({
      markNotificationsSeenForToast: toastSeen,
      showNotificationToastIfNew: vi.fn(),
      clearNotificationToastState: vi.fn(),
      markNotificationToastSubscriptionBoundary: vi.fn(),
    }))

    const items = [
      {
        id: 'n-2',
        type: 'ROUTE_ASSIGNED',
        title: 'Second',
        body: 'Body 2',
        titleKey: null,
        bodyKey: null,
        interpolationData: null,
        read: false,
        readAt: null,
        relatedOrderId: null,
        eventId: 'e-2',
        actionPath: null,
        createdAt: '2026-07-26T10:00:00.000Z',
      },
      {
        id: 'n-1',
        type: 'ROUTE_ASSIGNED',
        title: 'First',
        body: 'Body 1',
        titleKey: null,
        bodyKey: null,
        interpolationData: null,
        read: true,
        readAt: '2026-07-26T09:00:00.000Z',
        relatedOrderId: null,
        eventId: 'e-1',
        actionPath: null,
        createdAt: '2026-07-26T09:00:00.000Z',
      },
    ]

    queryMock.mockResolvedValueOnce({ data: { myNotifications: items } })
    const api = useNotifications()
    await api.loadNotifications()
    expect(api.notificationSource.value).toBe('SERVER')
    expect(api.notificationsAreReadOnly.value).toBe(false)

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()
    __resetNotificationOfflineStateForTests()

    await api.loadNotifications()
    expect(api.notificationSource.value).toBe('CACHE')
    expect(api.notifications.value.map(item => item.id)).toEqual(['n-2', 'n-1'])
    expect(api.notificationsAreReadOnly.value).toBe(true)

    await expect(api.markNotificationRead('n-2')).rejects.toThrow()
    await expect(api.markAllNotificationsRead()).rejects.toThrow()
    expect(mutateMock).not.toHaveBeenCalled()

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    __resetOnlineStatusForTests()

    queryMock.mockResolvedValueOnce({
      data: {
        myNotifications: [
          { ...items[0], id: 'n-2' },
          { ...items[1], id: 'n-1' },
        ],
      },
    })
    await api.loadNotifications(false, { isRefresh: true })
    expect(api.notificationSource.value).toBe('SERVER')
    expect(api.notifications.value.map(item => item.id)).toEqual(['n-2', 'n-1'])

    // Expired notification cache not rendered
    await getNotificationOfflineCacheService().replaceCacheFromOnlineList(
      'user-1',
      items,
    )
    const past = Date.now() - CACHE_TTL_MS - 60_000
    const repo = await import('@/offline/offline-cache-repository')
    const records = await repo
      .getOfflineCacheRepository()
      .listNotificationsForOwnerIncludingExpired('user-1')
    for (const record of records) {
      record.expiresAt = new Date(past).toISOString()
      await repo.getOfflineCacheRepository().putNotification(record)
    }

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()
    __resetNotificationOfflineStateForTests()
    await api.loadNotifications()
    expect(api.notifications.value).toHaveLength(0)
    expect(api.notificationErrorCategory.value).toBe('OFFLINE_CACHE_EXPIRED')
  })

  it('36: IndexedDB failure leaves online UI functional', async () => {
    const { __markOfflineDatabaseFailedForTests } =
      await import('@/offline/database')
    __markOfflineDatabaseFailedForTests()
    queryMock.mockResolvedValueOnce({ data: { myTodayRoute: sampleRoute() } })

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()

    expect(api.todayRouteSource.value).toBe('SERVER')
    expect(api.myTodayRoute.value?.id).toBe('route-1')
  })

  it('37: route subscriptions do not write partial snapshots directly', async () => {
    const writeSpy = vi.spyOn(
      getCourierRouteOfflineCacheService(),
      'writeFromOnlineRoute',
    )

    let subscriptionNext: ((value: unknown) => void) | undefined
    subscribeMock.mockImplementationOnce(() => ({
      subscribe: (handlers: { next: (value: unknown) => void }) => {
        subscriptionNext = handlers.next
        return { unsubscribe: vi.fn() }
      },
    }))

    queryMock.mockResolvedValue({
      data: { myTodayRoute: sampleRoute({ status: 'IN_PROGRESS' }) },
    })

    const api = useDeliveryRoutes()
    api.subscribeToTodayRouteUpdates()

    writeSpy.mockClear()
    expect(subscriptionNext).toBeTypeOf('function')
    subscriptionNext!({
      data: {
        bezorgerRouteUpdates: sampleRoute({ status: 'IN_PROGRESS' }),
      },
    })

    // Immediate subscription handler must not write IndexedDB itself.
    expect(writeSpy).not.toHaveBeenCalled()
    // Authoritative refetch is scheduled instead.
    await vi.waitFor(() => expect(queryMock).toHaveBeenCalled())
    api.stopTodayRouteSubscription()
  })

  it('38: full offline reload restores cached route', async () => {
    await seedOwnerAndRoute()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()
    __resetTodayRouteStateForTests()

    const api = useDeliveryRoutes()
    await api.loadMyTodayRoute()
    expect(api.todayRouteSource.value).toBe('CACHE')
    expect(api.myTodayRoute.value?.id).toBe('route-1')
  })
})

/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SAMPLE_VAPID_PUBLIC =
  'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc'

const mutate = vi.fn()
const query = vi.fn()

vi.mock('@/composables/useGraphQL', () => ({
  default: () => ({
    apolloClient: {
      query,
      mutate,
    },
  }),
}))

vi.mock('@/utils/vapid', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/vapid')>('@/utils/vapid')
  return {
    ...actual,
    readViteVapidPublicKey: () => SAMPLE_VAPID_PUBLIC,
  }
})

import {
  __resetPushNotificationsForTests,
  usePushNotifications,
} from './usePushNotifications'

function mockPushEnvironment(options?: {
  permission?: NotificationPermission
  withSubscription?: boolean
}) {
  const permission = options?.permission ?? 'default'
  const unsubscribe = vi.fn(() => Promise.resolve(true))
  const subscription = {
    endpoint: 'https://push.example/endpoint-1',
    toJSON: () => ({
      endpoint: 'https://push.example/endpoint-1',
      keys: {
        p256dh: 'p256dh-key-material-xx',
        auth: 'auth-key-material-xxxx',
      },
    }),
    unsubscribe,
  }

  const subscribe = vi.fn(() => Promise.resolve(subscription))
  const getSubscription = vi.fn(() =>
    Promise.resolve(options?.withSubscription ? subscription : null),
  )

  const requestPermission = vi.fn(() =>
    Promise.resolve('granted' as NotificationPermission),
  )

  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: {
      permission,
      requestPermission,
    },
  })

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription,
          subscribe,
        },
      }),
    },
  })

  vi.stubGlobal('PushManager', function PushManager() {})

  return {
    subscribe,
    getSubscription,
    unsubscribe,
    subscription,
    requestPermission,
  }
}

describe('usePushNotifications', () => {
  beforeEach(() => {
    __resetPushNotificationsForTests()
    query.mockReset()
    mutate.mockReset()
    query.mockResolvedValue({
      data: {
        myPushCapability: {
          enabled: false,
          subscriptionCount: 0,
          provider: 'fake',
          vapidPublicKey: SAMPLE_VAPID_PUBLIC,
          permissionGuidance: null,
        },
      },
    })
  })

  afterEach(() => {
    __resetPushNotificationsForTests()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows unsupported for browsers without Notification API', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    const api = usePushNotifications()
    await api.refresh()
    expect(api.status.value).toBe('unsupported')
  })

  it('maps denied permission to denied status with guidance path', async () => {
    mockPushEnvironment({ permission: 'denied' })
    const api = usePushNotifications()
    await api.refresh()
    expect(api.status.value).toBe('denied')
  })

  it('creates push subscription and registers with backend on enable', async () => {
    const { subscribe, requestPermission } = mockPushEnvironment({
      permission: 'default',
    })
    mutate.mockResolvedValue({
      data: {
        registerPushSubscription: {
          enabled: true,
          subscriptionCount: 1,
          provider: 'fake',
          vapidPublicKey: SAMPLE_VAPID_PUBLIC,
          permissionGuidance: null,
        },
      },
    })

    const api = usePushNotifications()
    const ok = await api.enableFromUserGesture()

    expect(ok).toBe(true)
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: expect.objectContaining({
            endpoint: 'https://push.example/endpoint-1',
            p256dh: 'p256dh-key-material-xx',
            auth: 'auth-key-material-xxxx',
          }),
        },
      }),
    )
    expect(api.status.value).toBe('enabled')
    expect(api.isEnabled.value).toBe(true)
  })

  it('does not show enabled when backend registration fails', async () => {
    mockPushEnvironment({ permission: 'granted' })
    mutate.mockResolvedValue({
      data: {
        registerPushSubscription: {
          enabled: false,
          subscriptionCount: 0,
          provider: 'fake',
          vapidPublicKey: SAMPLE_VAPID_PUBLIC,
          permissionGuidance: null,
        },
      },
    })

    const api = usePushNotifications()
    const ok = await api.enableFromUserGesture()

    expect(ok).toBe(false)
    expect(api.status.value).toBe('error')
    expect(api.isEnabled.value).toBe(false)
  })

  it('toggle off disables backend registration and unsubscribes browser', async () => {
    const { unsubscribe } = mockPushEnvironment({
      permission: 'granted',
      withSubscription: true,
    })
    mutate.mockResolvedValue({
      data: {
        disablePushSubscription: {
          enabled: false,
          subscriptionCount: 0,
          provider: 'fake',
          vapidPublicKey: SAMPLE_VAPID_PUBLIC,
          permissionGuidance: null,
        },
      },
    })

    const api = usePushNotifications()
    const ok = await api.disableFromUserGesture()

    expect(ok).toBe(true)
    expect(mutate).toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(api.status.value).toBe('disabled')
  })

  it('never exposes raw subscription keys in capability snapshot state', async () => {
    mockPushEnvironment({ permission: 'granted', withSubscription: true })
    query.mockResolvedValue({
      data: {
        myPushCapability: {
          enabled: true,
          subscriptionCount: 1,
          provider: 'fake',
          vapidPublicKey: SAMPLE_VAPID_PUBLIC,
          permissionGuidance: null,
        },
      },
    })

    const api = usePushNotifications()
    await api.refresh()

    expect(api.capability.value).toEqual(
      expect.objectContaining({
        enabled: true,
        hasVapidPublicKey: true,
      }),
    )
    expect(JSON.stringify(api.capability.value)).not.toMatch(/p256dh|auth-key/)
    expect(api.capability.value).not.toHaveProperty('endpoint')
    expect(api.capability.value).not.toHaveProperty('p256dh')
    expect(api.capability.value).not.toHaveProperty('auth')
  })
})

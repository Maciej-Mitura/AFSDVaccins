import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearNotificationToastState,
  markNotificationToastSubscriptionBoundary,
  markNotificationsSeenForToast,
  setNotificationToastApi,
  setNotificationToastNavigate,
  showNotificationToastIfNew,
  wasNotificationToasted,
} from '../composables/useNotificationToast'

describe('useNotificationToast', () => {
  beforeEach(() => {
    clearNotificationToastState()
    setNotificationToastApi(null)
    setNotificationToastNavigate(null)
  })

  it('shows toast once for a new unread notification', () => {
    const added: unknown[] = []
    setNotificationToastApi({
      add: toast => {
        added.push(toast)
      },
    })

    expect(
      showNotificationToastIfNew({
        id: 'n1',
        title: 'Hello',
        body: 'World',
        read: false,
      }),
    ).toBe(true)
    expect(added).toHaveLength(1)
    expect(added[0]).toEqual(
      expect.objectContaining({
        title: 'Hello',
        description: 'World',
        position: 'top-right',
      }),
    )

    expect(
      showNotificationToastIfNew({
        id: 'n1',
        title: 'Hello',
        body: 'World',
        read: false,
      }),
    ).toBe(false)
    expect(added).toHaveLength(1)
  })

  it('historical query / reconnect results do not show toasts', () => {
    markNotificationsSeenForToast([{ id: 'old-1' }, { id: 'old-2' }])
    expect(wasNotificationToasted('old-1')).toBe(true)

    expect(
      showNotificationToastIfNew({
        id: 'old-1',
        title: 'Old',
        body: 'Should not toast',
        read: false,
      }),
    ).toBe(false)
  })

  it('skips already-read notifications', () => {
    expect(
      showNotificationToastIfNew({
        id: 'n2',
        title: 'x',
        body: 'y',
        read: true,
      }),
    ).toBe(false)
  })

  it('dedupes by eventId across reconnect replay', () => {
    const added: unknown[] = []
    setNotificationToastApi({
      add: toast => {
        added.push(toast)
      },
    })

    expect(
      showNotificationToastIfNew({
        id: 'n-a',
        eventId: 'evt-1',
        title: 'A',
        body: 'B',
        read: false,
      }),
    ).toBe(true)

    expect(
      showNotificationToastIfNew({
        id: 'n-b',
        eventId: 'evt-1',
        title: 'A',
        body: 'B',
        read: false,
      }),
    ).toBe(false)
    expect(added).toHaveLength(1)
  })

  it('toast action accepts only internal actionPath', () => {
    const navigated: string[] = []
    const added: Array<{ actions?: Array<{ onClick?: () => void }> }> = []
    setNotificationToastNavigate(path => {
      navigated.push(path)
    })
    setNotificationToastApi({
      add: toast => {
        added.push(toast)
      },
    })

    showNotificationToastIfNew({
      id: 'n3',
      title: 't',
      body: 'b',
      read: false,
      actionPath: 'https://evil.example',
    })
    expect(added[0]?.actions).toBeUndefined()

    showNotificationToastIfNew({
      id: 'n4',
      title: 't',
      body: 'b',
      read: false,
      actionPath: '/bezorger/today',
    })
    expect(added[1]?.actions).toHaveLength(1)
    added[1]?.actions?.[0]?.onClick?.()
    expect(navigated).toEqual(['/bezorger/today'])
  })

  it('does not toast notifications older than the subscription boundary', () => {
    const added: unknown[] = []
    setNotificationToastApi({
      add: toast => {
        added.push(toast)
      },
    })

    markNotificationToastSubscriptionBoundary(
      new Date('2026-07-26T12:00:00.000Z').getTime(),
    )

    expect(
      showNotificationToastIfNew({
        id: 'old-boundary',
        title: 'Old',
        body: 'Before subscribe',
        read: false,
        createdAt: '2026-07-26T10:00:00.000Z',
      }),
    ).toBe(false)
    expect(added).toHaveLength(0)
  })

  it('clearing toast state on logout prevents cross-account replay', () => {
    showNotificationToastIfNew({
      id: 'acct-a',
      title: 'A',
      body: 'B',
      read: false,
    })
    clearNotificationToastState()
    expect(wasNotificationToasted('acct-a')).toBe(false)
  })
})

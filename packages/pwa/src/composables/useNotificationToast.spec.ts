import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearNotificationToastState,
  markNotificationsSeenForToast,
  showNotificationToastIfNew,
  wasNotificationToasted,
  setNotificationToastApi,
} from '../composables/useNotificationToast'

describe('useNotificationToast', () => {
  beforeEach(() => {
    clearNotificationToastState()
    setNotificationToastApi(null)
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

  it('reconnect/refetch foundation does not replay old toasts', () => {
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
})

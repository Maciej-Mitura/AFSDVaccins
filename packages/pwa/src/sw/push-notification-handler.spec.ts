import { describe, expect, it } from 'vitest'

import {
  focusOrOpenActionPath,
  hasVisibleClient,
  parseSafePushPayload,
  shouldDisplayOsNotification,
  type ClientsLike,
  type WindowClientLike,
} from './push-notification-handler'

describe('push-notification-handler', () => {
  it('parses bounded safe payloads and rejects sensitive keys', () => {
    expect(
      parseSafePushPayload({
        notificationId: 'n1',
        type: 'BEZORGER_ROUTE_ASSIGNED',
        title: 'Title',
        body: 'Body',
        actionPath: '/bezorger/routes',
        createdAt: '2026-07-26T06:00:00.000Z',
      }),
    ).toMatchObject({
      notificationId: 'n1',
      actionPath: '/bezorger/routes',
    })

    expect(
      parseSafePushPayload({
        notificationId: 'n1',
        type: 'X',
        title: 't',
        body: 'b',
        endpoint: 'https://evil',
      }),
    ).toBeNull()
  })

  it('suppresses OS display when a visible client exists', async () => {
    const clients: ClientsLike = {
      matchAll: () =>
        Promise.resolve([
          { visibilityState: 'visible', focused: true },
        ] as WindowClientLike[]),
    }

    expect(hasVisibleClient([{ visibilityState: 'visible' }])).toBe(true)
    await expect(shouldDisplayOsNotification(clients)).resolves.toBe(false)
  })

  it('displays OS notification when no visible client exists', async () => {
    const clients: ClientsLike = {
      matchAll: () =>
        Promise.resolve([
          { visibilityState: 'hidden', focused: false },
        ] as WindowClientLike[]),
    }

    await expect(shouldDisplayOsNotification(clients)).resolves.toBe(true)
  })

  it('notification click focuses existing window or opens actionPath', async () => {
    const focused: WindowClientLike = {
      url: 'https://app.example/',
      focus: () => Promise.resolve(focused),
      navigate: () => Promise.resolve(focused),
    }
    const clients: ClientsLike = {
      matchAll: () => Promise.resolve([focused]),
      openWindow: () => Promise.resolve(null),
    }

    const result = await focusOrOpenActionPath(
      clients,
      '/bezorger/routes',
      'https://app.example',
    )
    expect(result).toBe(focused)

    const opened: WindowClientLike = { url: 'https://app.example/admin/orders' }
    const empty: ClientsLike = {
      matchAll: () => Promise.resolve([]),
      openWindow: url => {
        expect(url).toBe('https://app.example/admin/orders')
        return Promise.resolve(opened)
      },
    }

    await expect(
      focusOrOpenActionPath(empty, '/admin/orders', 'https://app.example'),
    ).resolves.toBe(opened)
  })
})

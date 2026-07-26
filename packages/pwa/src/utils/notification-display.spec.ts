import { describe, expect, it } from 'vitest'

import {
  looksLikeI18nKey,
  resolveNotificationBody,
  resolveNotificationCopy,
  resolveNotificationTitle,
} from './notification-display'

describe('notification display resolution', () => {
  const t = (key: string, values?: Record<string, unknown>) => {
    if (key === 'notifications.bezorger.routeAssigned.title') {
      return 'Route assigned'
    }
    if (key === 'notifications.bezorger.routeAssigned.body') {
      const routeDate =
        typeof values?.routeDate === 'string' ||
        typeof values?.routeDate === 'number'
          ? String(values.routeDate)
          : ''
      return `You were assigned a route for ${routeDate}`
    }
    return key
  }

  it('renders typed notification using locale keys and interpolation', () => {
    const copy = resolveNotificationCopy(
      {
        title: 'notifications.bezorger.routeAssigned.title',
        body: 'notifications.bezorger.routeAssigned.body',
        titleKey: 'notifications.bezorger.routeAssigned.title',
        bodyKey: 'notifications.bezorger.routeAssigned.body',
        interpolationData: { routeDate: '2026-07-26' },
      },
      t,
    )

    expect(copy.title).toBe('Route assigned')
    expect(copy.body).toBe('You were assigned a route for 2026-07-26')
  })

  it('falls back to legacy title/body when keys are absent', () => {
    expect(
      resolveNotificationTitle(
        {
          title: 'Legacy Dutch title',
          body: 'Legacy Dutch body',
        },
        t,
      ),
    ).toBe('Legacy Dutch title')

    expect(
      resolveNotificationBody(
        {
          title: 'Legacy Dutch title',
          body: 'Legacy Dutch body',
        },
        t,
      ),
    ).toBe('Legacy Dutch body')
  })

  it('detects mirrored i18n keys in legacy fields', () => {
    expect(looksLikeI18nKey('notifications.admin.newOrder.title')).toBe(true)
    expect(looksLikeI18nKey('New order received')).toBe(false)
  })
})

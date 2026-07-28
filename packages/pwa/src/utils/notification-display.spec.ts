import { describe, expect, it } from 'vitest'

import {
  looksLikeI18nKey,
  resolveNotificationBody,
  resolveNotificationCopy,
  resolveNotificationTitle,
} from './notification-display'

describe('notification display resolution', () => {
  const catalog: Record<string, string> = {
    'notifications.bezorger.routeAssigned.title':
      'A new route has been assigned to you',
    'notifications.bezorger.routeAssigned.body':
      'Route for {stopCount} pharmacies is scheduled for {routeDate}.',
    'notifications.apotheker.nextStop.title':
      "You're next on the delivery route",
    'notifications.apotheker.nextStop.body':
      'Prepare for delivery on {routeDate}. The courier is coming from {city}.',
    'notifications.apotheker.nextStop.bodyNoCity':
      'Prepare for your delivery on {routeDate}.',
    'notifications.admin.newOrder.body':
      '{pharmacyName} placed an order for delivery on {routeDate} ({orderCount} products).',
    'notifications.admin.newOrder.title': 'New order received',
    'notifications.fallback.pharmacyName': 'A pharmacy',
  }

  const t = (key: string, values?: Record<string, unknown>) => {
    const template = catalog[key]
    if (!template) {
      return key
    }
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, name: string) => {
      const value = values?.[name]
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value)
      }
      return ''
    })
  }

  it('renders typed notification using locale keys and interpolation', () => {
    const copy = resolveNotificationCopy(
      {
        title: 'notifications.bezorger.routeAssigned.title',
        body: 'notifications.bezorger.routeAssigned.body',
        titleKey: 'notifications.bezorger.routeAssigned.title',
        bodyKey: 'notifications.bezorger.routeAssigned.body',
        interpolationData: { routeDate: '2026-07-26', stopCount: 3 },
      },
      t,
    )

    expect(copy.title).toBe('A new route has been assigned to you')
    expect(copy.body).toBe(
      'Route for 3 pharmacies is scheduled for 2026-07-26.',
    )
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

  it('never surfaces raw translation keys when lookup fails', () => {
    const copy = resolveNotificationCopy(
      {
        title: 'notifications.missing.title',
        body: 'notifications.missing.body',
        titleKey: 'notifications.missing.title',
        bodyKey: 'notifications.missing.body',
        interpolationData: null,
      },
      t,
    )

    expect(copy.title).not.toMatch(/^notifications\./)
    expect(copy.body).not.toMatch(/^notifications\./)
  })

  it('omits optional city without braces or undefined', () => {
    const body = resolveNotificationBody(
      {
        title: 'notifications.apotheker.nextStop.title',
        body: 'notifications.apotheker.nextStop.body',
        titleKey: 'notifications.apotheker.nextStop.title',
        bodyKey: 'notifications.apotheker.nextStop.body',
        interpolationData: {
          routeDate: '2026-07-30',
          pharmacyName: 'Apotheek A',
        },
      },
      t,
    )

    expect(body).toBe('Prepare for your delivery on 2026-07-30.')
    expect(body).not.toContain('{')
    expect(body).not.toContain('undefined')
  })

  it('includes city when present for next-stop body', () => {
    const body = resolveNotificationBody(
      {
        title: 'notifications.apotheker.nextStop.title',
        body: 'notifications.apotheker.nextStop.body',
        titleKey: 'notifications.apotheker.nextStop.title',
        bodyKey: 'notifications.apotheker.nextStop.body',
        interpolationData: {
          routeDate: '2026-07-30',
          pharmacyName: 'Apotheek A',
          city: 'Gent',
        },
      },
      t,
    )

    expect(body).toBe(
      'Prepare for delivery on 2026-07-30. The courier is coming from Gent.',
    )
  })

  it('uses pharmacy fallback when pharmacyName is missing', () => {
    const body = resolveNotificationBody(
      {
        title: 'notifications.admin.newOrder.title',
        body: 'notifications.admin.newOrder.body',
        titleKey: 'notifications.admin.newOrder.title',
        bodyKey: 'notifications.admin.newOrder.body',
        interpolationData: { routeDate: '2026-07-28', orderCount: 2 },
      },
      t,
    )

    expect(body).toBe(
      'A pharmacy placed an order for delivery on 2026-07-28 (2 products).',
    )
    expect(body).not.toContain('{pharmacyName}')
  })
})

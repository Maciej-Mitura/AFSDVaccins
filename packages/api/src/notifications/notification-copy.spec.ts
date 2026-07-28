import {
  interpolateNotificationTemplate,
  resolveEnglishNotificationCopy,
} from './notification-copy.en'
import { NotificationType } from './notification-type.enum'
import {
  PHASE_27A_TAXONOMY,
  getNotificationTaxonomy,
  isPhase27ANotificationType,
} from './notification-taxonomy'
import { UserRole } from '../user/user-role.enum'

describe('notification copy English resolution', () => {
  it('maps every structured taxonomy entry to English title and body templates', () => {
    for (const entry of PHASE_27A_TAXONOMY) {
      const copy = resolveEnglishNotificationCopy({
        title: entry.titleKey,
        body: entry.bodyKey,
        titleKey: entry.titleKey,
        bodyKey: entry.bodyKey,
        interpolationData: {
          routeDate: '2026-07-29',
          pharmacyName: 'Apotheek Centrum',
          city: 'Gent',
          orderReference: 'order-1',
          orderCount: 2,
          stopCount: 3,
          doseCount: 10,
          warningPercentage: 90,
          weeklyDoseCap: 200,
          vaccineName: 'Influenza',
          quantityRemaining: 4,
          stockThreshold: 5,
        },
      })
      expect(copy.title).toBeTruthy()
      expect(copy.title).not.toMatch(/^notifications\./)
      expect(copy.body).toBeTruthy()
      expect(copy.body).not.toMatch(/^notifications\./)
      expect(copy.body).not.toContain('{')
      expect(copy.body).not.toContain('undefined')
    }
  })

  it('interpolates stopCount for bezorger route assignment', () => {
    const copy = resolveEnglishNotificationCopy({
      title: 'notifications.bezorger.routeAssigned.title',
      body: 'notifications.bezorger.routeAssigned.body',
      titleKey: 'notifications.bezorger.routeAssigned.title',
      bodyKey: 'notifications.bezorger.routeAssigned.body',
      interpolationData: {
        routeDate: '2026-07-29',
        stopCount: 3,
      },
    })

    expect(copy.title).toBe('A new route has been assigned to you')
    expect(copy.body).toBe(
      'Route for 3 pharmacies is scheduled for 2026-07-29.',
    )
  })

  it('uses no-city next-stop body when city is absent', () => {
    const copy = resolveEnglishNotificationCopy({
      title: 'notifications.apotheker.nextStop.title',
      body: 'notifications.apotheker.nextStop.body',
      titleKey: 'notifications.apotheker.nextStop.title',
      bodyKey: 'notifications.apotheker.nextStop.body',
      interpolationData: {
        routeDate: '2026-07-30',
        pharmacyName: 'Apotheek A',
      },
    })

    expect(copy.body).toBe('Prepare for your delivery on 2026-07-30.')
    expect(copy.body).not.toContain('coming from')
  })

  it('does not leave braces for missing optional values', () => {
    const text = interpolateNotificationTemplate('Hello {name}, city={city}.', {
      name: 'Ada',
    })
    expect(text).toBe('Hello Ada, city=.')
    expect(text).not.toContain('{city}')
  })
})

describe('notification taxonomy coverage', () => {
  it('covers all notification event types with titleKey/bodyKey and actionPath', () => {
    const expectedTypes = Object.values(NotificationType)
    expect(PHASE_27A_TAXONOMY).toHaveLength(expectedTypes.length)

    for (const type of expectedTypes) {
      expect(isPhase27ANotificationType(type)).toBe(true)
      const entry = getNotificationTaxonomy(type)
      expect(entry).toBeDefined()
      expect(entry!.titleKey.startsWith('notifications.')).toBe(true)
      expect(entry!.bodyKey.startsWith('notifications.')).toBe(true)
      expect(entry!.actionPath).toMatch(/^\/(admin|apotheker|bezorger)\//)
      expect(
        entry!.recipientRole === UserRole.ADMIN ||
          entry!.recipientRole === UserRole.APOTHEKER ||
          entry!.recipientRole === UserRole.BEZORGER,
      ).toBe(true)
    }
  })

  it('uses role-appropriate action paths', () => {
    expect(
      getNotificationTaxonomy(NotificationType.ADMIN_NEW_ORDER)?.actionPath,
    ).toBe('/admin/orders')
    expect(
      getNotificationTaxonomy(NotificationType.LOW_STOCK_WARNING)?.actionPath,
    ).toBe('/admin/stock')
    expect(
      getNotificationTaxonomy(NotificationType.BEZORGER_ROUTE_ASSIGNED)
        ?.actionPath,
    ).toBe('/bezorger/today')
    expect(
      getNotificationTaxonomy(NotificationType.ORDER_CONFIRMATION)?.actionPath,
    ).toBe('/apotheker/orders')
  })
})

/**
 * Status / enum display labels must resolve to catalog keys (no raw enums).
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import nlCatalog from '@/locales/nl.json'
import enCatalog from '@/locales/en.json'
import { unwrapLocaleCatalog } from '@/i18n/locale-loader'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import {
  __resetAppI18nForTests,
  activeInactiveLabel,
  apiHealthStatusLabel,
  deliveryMethodLabel,
  notificationReadLabel,
  operationsFeedEventTypeLabel,
  orderStatusLabel,
  routeStatusLabel,
  userRoleLabel,
} from '@/i18n'
import { createTestI18n } from '@/i18n/test-utils'

const nl = unwrapLocaleCatalog('nl', nlCatalog)
const en = unwrapLocaleCatalog('en', enCatalog)

describe('status/enum label mapping coverage', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('maps all known domain enums to human labels (not raw enums or keys)', () => {
    const cases: Array<{ label: string; raw: string }> = [
      { label: orderStatusLabel('PENDING'), raw: 'PENDING' },
      { label: orderStatusLabel('PLANNED'), raw: 'PLANNED' },
      { label: orderStatusLabel('DELIVERED'), raw: 'DELIVERED' },
      { label: orderStatusLabel('CANCELLED'), raw: 'CANCELLED' },
      { label: routeStatusLabel('ASSIGNED'), raw: 'ASSIGNED' },
      { label: routeStatusLabel('IN_PROGRESS'), raw: 'IN_PROGRESS' },
      { label: routeStatusLabel('COMPLETED'), raw: 'COMPLETED' },
      { label: routeStatusLabel('CANCELLED'), raw: 'CANCELLED' },
      { label: userRoleLabel('ADMIN'), raw: 'ADMIN' },
      { label: userRoleLabel('APOTHEKER'), raw: 'APOTHEKER' },
      { label: userRoleLabel('BEZORGER'), raw: 'BEZORGER' },
      { label: apiHealthStatusLabel('ok'), raw: 'ok' },
      { label: operationsFeedEventTypeLabel('NEW_ORDER'), raw: 'NEW_ORDER' },
      {
        label: operationsFeedEventTypeLabel('ORDER_STATUS_CHANGED'),
        raw: 'ORDER_STATUS_CHANGED',
      },
      { label: operationsFeedEventTypeLabel('LOW_STOCK'), raw: 'LOW_STOCK' },
      { label: activeInactiveLabel(true), raw: 'true' },
      { label: activeInactiveLabel(false), raw: 'false' },
      { label: notificationReadLabel(true), raw: 'read' },
      { label: notificationReadLabel(false), raw: 'unread' },
      { label: deliveryMethodLabel('ADMIN'), raw: 'ADMIN' },
      { label: deliveryMethodLabel('QR'), raw: 'QR' },
    ]

    for (const item of cases) {
      expect(item.label, item.raw).not.toBe(item.raw)
      expect(item.label.trim().length).toBeGreaterThan(0)
      expect(item.label.startsWith('status.')).toBe(false)
      expect(item.label.startsWith('orderHistory.')).toBe(false)
    }

    const requiredKeys = [
      'status.order.pending',
      'status.order.planned',
      'status.order.delivered',
      'status.order.cancelled',
      'status.route.assigned',
      'status.route.inProgress',
      'status.route.completed',
      'status.route.cancelled',
      'status.role.admin',
      'status.role.apotheker',
      'status.role.bezorger',
      'status.operations.newOrder',
      'status.operations.orderStatusChanged',
      'status.operations.lowStock',
      'status.active',
      'status.inactive',
      'status.notification.read',
      'status.notification.unread',
      'orderHistory.deliveryMethod.admin',
      'orderHistory.deliveryMethod.qr',
      'common.unknown',
    ]
    for (const key of requiredKeys) {
      expect(nl[key]?.trim().length, `nl:${key}`).toBeGreaterThan(0)
      expect(en[key]?.trim().length, `en:${key}`).toBeGreaterThan(0)
    }
  })
})

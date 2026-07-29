/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  __resetAppI18nForTests,
  activeInactiveLabel,
  apiHealthStatusLabel,
  operationsFeedEventTypeLabel,
  orderStatusLabel,
  routeStatusLabel,
  stockAdjustmentTypeLabel,
  userRoleLabel,
  type SupportedLocale,
} from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import { useLanguage } from '@/composables/useLanguage'

const LOCALES: SupportedLocale[] = ['nl', 'en', 'es', 'zh']

describe('status labels', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('nl')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('resolves domain labels in all four locales (non-empty, not raw keys)', async () => {
    const { setLocale } = useLanguage()

    for (const locale of LOCALES) {
      await setLocale(locale)

      const samples = [
        { key: 'status.order.pending', value: orderStatusLabel('PENDING') },
        { key: 'status.order.planned', value: orderStatusLabel('PLANNED') },
        { key: 'status.order.delivered', value: orderStatusLabel('DELIVERED') },
        { key: 'status.order.cancelled', value: orderStatusLabel('CANCELLED') },
        { key: 'status.route.assigned', value: routeStatusLabel('ASSIGNED') },
        {
          key: 'status.route.inProgress',
          value: routeStatusLabel('IN_PROGRESS'),
        },
        { key: 'status.route.completed', value: routeStatusLabel('COMPLETED') },
        { key: 'status.route.cancelled', value: routeStatusLabel('CANCELLED') },
        { key: 'status.role.admin', value: userRoleLabel('ADMIN') },
        { key: 'status.role.apotheker', value: userRoleLabel('APOTHEKER') },
        { key: 'status.role.bezorger', value: userRoleLabel('BEZORGER') },
        { key: 'status.api.ok', value: apiHealthStatusLabel('ok') },
        { key: 'status.api.ok', value: apiHealthStatusLabel('OK') },
        {
          key: 'status.operations.newOrder',
          value: operationsFeedEventTypeLabel('NEW_ORDER'),
        },
        {
          key: 'status.operations.orderStatusChanged',
          value: operationsFeedEventTypeLabel('ORDER_STATUS_CHANGED'),
        },
        {
          key: 'status.operations.lowStock',
          value: operationsFeedEventTypeLabel('LOW_STOCK'),
        },
        { key: 'status.active', value: activeInactiveLabel(true) },
        { key: 'status.inactive', value: activeInactiveLabel(false) },
        {
          key: 'admin.stock.adjustment.restock',
          value: stockAdjustmentTypeLabel('RESTOCK'),
        },
        {
          key: 'admin.stock.adjustment.decrease',
          value: stockAdjustmentTypeLabel('MANUAL_DECREASE'),
        },
        {
          key: 'admin.stock.adjustment.correction',
          value: stockAdjustmentTypeLabel('MANUAL_CORRECTION'),
        },
        {
          key: 'admin.stock.adjustment.deliveryDeduction',
          value: stockAdjustmentTypeLabel('DELIVERY_DEDUCTION'),
        },
      ]

      for (const sample of samples) {
        expect(sample.value.trim(), `${locale}:${sample.key}`).not.toBe('')
        expect(sample.value, `${locale}:${sample.key}`).not.toBe(sample.key)
      }
    }
  })

  it('does not render raw API health / feed enum tokens', async () => {
    const { setLocale } = useLanguage()
    await setLocale('zh')

    expect(apiHealthStatusLabel('ok')).not.toBe('ok')
    expect(operationsFeedEventTypeLabel('NEW_ORDER')).not.toBe('NEW_ORDER')
    expect(operationsFeedEventTypeLabel('ORDER_STATUS_CHANGED')).not.toBe(
      'ORDER_STATUS_CHANGED',
    )
    expect(operationsFeedEventTypeLabel('LOW_STOCK')).not.toBe('LOW_STOCK')
    expect(orderStatusLabel('PLANNED')).not.toBe('PLANNED')
    expect(userRoleLabel('ADMIN')).not.toBe('ADMIN')
    expect(stockAdjustmentTypeLabel('RESTOCK')).not.toBe('RESTOCK')
    expect(stockAdjustmentTypeLabel('MANUAL_DECREASE')).not.toBe(
      'MANUAL_DECREASE',
    )
    expect(stockAdjustmentTypeLabel('MANUAL_CORRECTION')).not.toBe(
      'MANUAL_CORRECTION',
    )
    expect(stockAdjustmentTypeLabel('DELIVERY_DEDUCTION')).not.toBe(
      'DELIVERY_DEDUCTION',
    )
  })

  it('falls back to common.unknown for unmapped stock adjustment types', async () => {
    const { setLocale } = useLanguage()
    await setLocale('nl')
    const unknown = stockAdjustmentTypeLabel('NOT_A_REAL_TYPE')
    expect(unknown).not.toBe('NOT_A_REAL_TYPE')
    expect(unknown.trim().length).toBeGreaterThan(0)
  })
})

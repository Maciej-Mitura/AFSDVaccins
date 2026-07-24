/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  __resetAppI18nForTests,
  activeInactiveLabel,
  orderStatusLabel,
  routeStatusLabel,
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
        { key: 'status.order.delivered', value: orderStatusLabel('DELIVERED') },
        { key: 'status.route.assigned', value: routeStatusLabel('ASSIGNED') },
        {
          key: 'status.route.inProgress',
          value: routeStatusLabel('IN_PROGRESS'),
        },
        { key: 'status.role.admin', value: userRoleLabel('ADMIN') },
        { key: 'status.role.apotheker', value: userRoleLabel('APOTHEKER') },
        { key: 'status.active', value: activeInactiveLabel(true) },
        { key: 'status.inactive', value: activeInactiveLabel(false) },
      ]

      for (const sample of samples) {
        expect(sample.value.trim(), `${locale}:${sample.key}`).not.toBe('')
        expect(sample.value, `${locale}:${sample.key}`).not.toBe(sample.key)
      }
    }
  })
})

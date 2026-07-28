/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import ViewBezorgerNotifications from '@/views/bezorger/ViewBezorgerNotifications.vue'
import { __resetAppI18nForTests } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

vi.mock(
  '@/components/feature/notifications/FeatureNotificationCentre.vue',
  () => ({
    default: {
      name: 'FeatureNotificationCentre',
      props: ['emptyDescriptionKey'],
      template:
        '<div data-testid="notification-centre" :data-empty-key="emptyDescriptionKey" />',
    },
  }),
)

describe('ViewBezorgerNotifications', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('wraps the shared notification centre in the bezorger rail', () => {
    const wrapper = mount(ViewBezorgerNotifications, {
      global: { plugins: [createTestI18n('en')] },
    })
    expect(
      wrapper.find('[data-testid="bezorger-notifications"]').exists(),
    ).toBe(true)
    const centre = wrapper.find('[data-testid="notification-centre"]')
    expect(centre.exists()).toBe(true)
    expect(centre.attributes('data-empty-key')).toBe(
      'bezorger.notifications.empty.description',
    )
  })
})

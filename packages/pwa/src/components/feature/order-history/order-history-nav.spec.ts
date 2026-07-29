/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    unreadCount: computed(() => 0),
    hasUnread: computed(() => false),
    loadUnreadCount: vi.fn(),
    subscribeToNotificationEvents: vi.fn(),
    stopNotificationSubscription: vi.fn(),
    registerReconnectRefetch: () => () => undefined,
  }),
}))

vi.mock('@/composables/useOrders', () => ({
  useOrders: () => ({
    loadMyOrders: vi.fn(),
    loadWeeklySummary: vi.fn(),
  }),
}))

vi.mock('@/components/common/CommonAppShell.vue', () => ({
  default: {
    name: 'CommonAppShell',
    props: ['title', 'navLinks', 'accountLinks', 'notificationLink'],
    template: `
      <nav data-testid="primary-nav">
        <a v-for="link in navLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
      </nav>
      <slot />
    `,
  },
}))

vi.mock('@/components/common/CommonNotificationBell.vue', () => ({
  default: {
    name: 'CommonNotificationBell',
    props: ['to', 'label'],
    template: '<a data-testid="notification-bell" :href="to">{{ label }}</a>',
  },
}))

import FeatureAdminLayout from '@/components/feature/admin/FeatureAdminLayout.vue'
import FeatureApothekerLayout from '@/components/feature/apotheker/FeatureApothekerLayout.vue'
import FeatureBezorgerLayout from '@/components/feature/bezorger/FeatureBezorgerLayout.vue'

describe('order history navigation', () => {
  it('ADMIN History nav is visible after Orders', () => {
    const wrapper = mount(FeatureAdminLayout, {
      global: { stubs: { RouterView: true } },
    })
    const hrefs = wrapper
      .findAll('[data-testid="primary-nav"] a')
      .map(a => a.attributes('href'))
    expect(hrefs).toContain('/admin/history')
    expect(hrefs.indexOf('/admin/orders')).toBeLessThan(
      hrefs.indexOf('/admin/history'),
    )
    expect(hrefs.indexOf('/admin/history')).toBeLessThan(
      hrefs.indexOf('/admin/route-planning'),
    )
    expect(wrapper.text()).toContain('navigation.admin.history')
  })

  it('APOTHEKER History nav is visible after My orders', () => {
    const wrapper = mount(FeatureApothekerLayout, {
      global: { stubs: { RouterView: true } },
    })
    const hrefs = wrapper
      .findAll('[data-testid="primary-nav"] a')
      .map(a => a.attributes('href'))
    expect(hrefs).toContain('/apotheker/history')
    expect(hrefs.indexOf('/apotheker/orders')).toBeLessThan(
      hrefs.indexOf('/apotheker/history'),
    )
    expect(wrapper.text()).toContain('navigation.apotheker.history')
  })

  it('BEZORGER History nav is absent', () => {
    const wrapper = mount(FeatureBezorgerLayout, {
      global: { stubs: { RouterView: true } },
    })
    const hrefs = wrapper
      .findAll('[data-testid="primary-nav"] a')
      .map(a => a.attributes('href'))
    expect(hrefs).not.toContain('/bezorger/history')
    expect(hrefs.every(href => !href?.includes('/history'))).toBe(true)
    expect(wrapper.text()).not.toContain('navigation.bezorger.history')
  })
})

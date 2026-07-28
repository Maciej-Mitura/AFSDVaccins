/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import { UserRole } from '@vaccin-delivery/types'

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

vi.mock('@/components/common/CommonAppShell.vue', () => ({
  default: {
    name: 'CommonAppShell',
    props: ['title', 'navLinks', 'accountLinks'],
    template: `
      <nav data-testid="admin-nav">
        <a v-for="link in navLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
      </nav>
      <nav data-testid="admin-account-nav">
        <a v-for="link in accountLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
      </nav>
      <div data-testid="admin-header-actions"><slot name="header-actions" /></div>
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

describe('FeatureAdminLayout courier analytics nav', () => {
  it('ADMIN layout includes Courier analytics nav item', () => {
    const wrapper = mount(FeatureAdminLayout, {
      global: {
        stubs: {
          RouterView: true,
        },
      },
    })
    const hrefs = wrapper
      .findAll('[data-testid="admin-nav"] a')
      .map(a => a.attributes('href'))
    expect(hrefs).toContain('/admin/analytics/couriers')
    expect(wrapper.text()).toContain('navigation.admin.courierAnalytics')
    // Role enum sanity — layout is only mounted for admin routes.
    expect(UserRole.Admin).toBe('ADMIN')
  })

  it('exposes notifications once via header actions, not primary nav', () => {
    const wrapper = mount(FeatureAdminLayout, {
      global: {
        stubs: {
          RouterView: true,
        },
      },
    })
    const primaryHrefs = wrapper
      .findAll('[data-testid="admin-nav"] a')
      .map(a => a.attributes('href'))
    expect(primaryHrefs).not.toContain('/admin/notifications')
    expect(primaryHrefs).not.toContain('/profile')

    const accountHrefs = wrapper
      .findAll('[data-testid="admin-account-nav"] a')
      .map(a => a.attributes('href'))
    expect(accountHrefs).toEqual(['/profile'])

    const bell = wrapper.get('[data-testid="notification-bell"]')
    expect(bell.attributes('href')).toBe('/admin/notifications')
    expect(wrapper.findAll('[data-testid="notification-bell"]')).toHaveLength(1)
  })
})

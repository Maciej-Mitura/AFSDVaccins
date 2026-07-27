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
    props: ['title', 'navLinks'],
    template: `
      <nav data-testid="admin-nav">
        <a v-for="link in navLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
      </nav>
      <slot />
    `,
  },
}))

import FeatureAdminLayout from '@/components/feature/admin/FeatureAdminLayout.vue'

describe('FeatureAdminLayout courier analytics nav', () => {
  it('ADMIN layout includes Courier analytics nav item', () => {
    const wrapper = mount(FeatureAdminLayout, {
      global: {
        stubs: {
          RouterView: true,
          UButton: { template: '<button><slot /></button>' },
          UBadge: true,
        },
      },
    })
    const hrefs = wrapper.findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toContain('/admin/analytics/couriers')
    expect(wrapper.text()).toContain('navigation.admin.courierAnalytics')
    // Role enum sanity — layout is only mounted for admin routes.
    expect(UserRole.Admin).toBe('ADMIN')
  })
})

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
    props: ['title', 'navLinks', 'accountLinks'],
    template: `
      <nav data-testid="primary-nav">
        <a v-for="link in navLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
      </nav>
      <nav data-testid="account-nav">
        <a v-for="link in accountLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
      </nav>
      <div data-testid="header-actions"><slot name="header-actions" /></div>
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

import FeatureApothekerLayout from '@/components/feature/apotheker/FeatureApothekerLayout.vue'
import FeatureBezorgerLayout from '@/components/feature/bezorger/FeatureBezorgerLayout.vue'

describe('role layout notification dedupe', () => {
  it('apotheker keeps a single notifications entry in header actions', () => {
    const wrapper = mount(FeatureApothekerLayout, {
      global: { stubs: { RouterView: true } },
    })
    const primary = wrapper
      .findAll('[data-testid="primary-nav"] a')
      .map(a => a.attributes('href'))
    expect(primary).not.toContain('/apotheker/notifications')
    expect(primary).not.toContain('/profile')
    expect(wrapper.findAll('[data-testid="notification-bell"]')).toHaveLength(1)
    expect(
      wrapper.get('[data-testid="notification-bell"]').attributes('href'),
    ).toBe('/apotheker/notifications')
    expect(
      wrapper
        .findAll('[data-testid="account-nav"] a')
        .map(a => a.attributes('href')),
    ).toEqual(['/profile'])
  })

  it('bezorger keeps a single notifications entry in header actions', () => {
    const wrapper = mount(FeatureBezorgerLayout, {
      global: { stubs: { RouterView: true } },
    })
    const primary = wrapper
      .findAll('[data-testid="primary-nav"] a')
      .map(a => a.attributes('href'))
    expect(primary).not.toContain('/bezorger/notifications')
    expect(wrapper.findAll('[data-testid="notification-bell"]')).toHaveLength(1)
    expect(
      wrapper.get('[data-testid="notification-bell"]').attributes('href'),
    ).toBe('/bezorger/notifications')
  })
})

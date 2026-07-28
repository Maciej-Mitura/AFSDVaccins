/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: '/admin/notifications',
    fullPath: '/admin/notifications',
  }),
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: "<a :href=\"typeof to === 'string' ? to : '#'\"><slot /></a>",
  },
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    unreadCount: computed(() => 3),
  }),
}))

import CommonNotificationBell from '@/components/common/CommonNotificationBell.vue'

const UButtonStub = {
  name: 'UButton',
  inheritAttrs: false,
  props: {
    to: { type: [String, Object], default: undefined },
  },
  template: `
    <a
      :href="typeof to === 'string' ? to : '#'"
      :aria-label="$attrs['aria-label']"
      data-testid="notification-bell"
    ><slot /></a>
  `,
}

describe('CommonNotificationBell', () => {
  it('exposes unread count in accessible name and visible badge', () => {
    const wrapper = mount(CommonNotificationBell, {
      props: {
        to: '/admin/notifications',
        label: 'Notifications',
      },
      global: {
        stubs: {
          UButton: UButtonStub,
          Button: UButtonStub,
          UBadge: {
            template:
              '<span data-testid="notification-unread-badge"><slot /></span>',
          },
          Badge: {
            template:
              '<span data-testid="notification-unread-badge"><slot /></span>',
          },
        },
      },
    })

    const link = wrapper.get('[data-testid="notification-bell"]')
    expect(link.attributes('href')).toBe('/admin/notifications')
    expect(link.attributes('aria-label')).toContain('Notifications')
    expect(link.attributes('aria-label')).toContain(
      'notifications.centre.unreadCount',
    )
    expect(
      wrapper.get('[data-testid="notification-unread-badge"]').text(),
    ).toContain('3')
    expect(wrapper.text()).toContain('Notifications')
  })
})

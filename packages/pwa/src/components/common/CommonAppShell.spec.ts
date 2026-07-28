/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

const routePath = ref('/admin/orders')
const push = vi.fn()
const logout = vi.fn(() => Promise.resolve(undefined))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return routePath.value
    },
    get fullPath() {
      return routePath.value
    },
  }),
  useRouter: () => ({ push }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: "<a :href=\"typeof to === 'string' ? to : '#'\"><slot /></a>",
  },
}))

vi.mock('@/composables/useFirebase', () => ({
  useFirebase: () => ({
    isAuthenticated: ref(true),
    logout,
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ clearCurrentUser: vi.fn() }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({ clearNotificationState: vi.fn() }),
  setNotificationTranslate: vi.fn(),
}))

vi.mock('@/composables/useDeliveryRoutes', () => ({
  useDeliveryRoutes: () => ({ clearTodayRouteState: vi.fn() }),
}))

vi.mock('@/composables/useNotificationToast', () => ({
  setNotificationToastNavigate: vi.fn(),
  setNotificationToastOpenLabel: vi.fn(),
  clearNotificationToastState: vi.fn(),
}))

vi.mock('@/composables/usePushNotifications', () => ({
  usePushNotifications: () => ({ resetSession: vi.fn() }),
}))

vi.mock('@/composables/useGraphQL', () => ({
  clearApolloCache: vi.fn(() => Promise.resolve(undefined)),
}))

import CommonAppShell from '@/components/common/CommonAppShell.vue'

const UButtonStub = {
  name: 'UButton',
  props: {
    to: { type: [String, Object], default: undefined },
    variant: { type: String, default: 'ghost' },
    color: { type: String, default: 'neutral' },
    loading: { type: Boolean, default: false },
    block: { type: Boolean, default: false },
  },
  emits: ['click'],
  template: `
    <a
      v-if="to"
      :href="typeof to === 'string' ? to : '#'"
      :data-variant="variant"
      :aria-current="$attrs['aria-current']"
      @click="$emit('click', $event)"
    ><slot /></a>
    <button
      v-else
      type="button"
      :data-testid="$attrs['data-testid']"
      :aria-label="$attrs['aria-label']"
      :aria-expanded="$attrs['aria-expanded']"
      :aria-controls="$attrs['aria-controls']"
      :class="$attrs.class"
      @click="$emit('click', $event)"
    ><slot /></button>
  `,
}

describe('CommonAppShell layout', () => {
  beforeEach(() => {
    routePath.value = '/admin/orders'
    push.mockReset()
    logout.mockClear()
  })

  function mountShell() {
    return mount(CommonAppShell, {
      props: {
        title: 'Admin',
        navLinks: [
          { label: 'Dashboard', to: '/admin' },
          { label: 'Orders', to: '/admin/orders' },
        ],
        accountLinks: [{ label: 'Profile', to: '/profile' }],
      },
      slots: {
        'header-actions':
          '<a data-testid="notification-bell" href="/admin/notifications">Notifications</a>',
      },
      global: {
        stubs: {
          UButton: UButtonStub,
          Button: UButtonStub,
          UIcon: true,
          CommonLanguageSelector: {
            template: '<div data-testid="language-selector" />',
          },
          CommonPushPermissionBanner: true,
        },
      },
    })
  }

  it('groups brand left, primary nav, and account actions separately', () => {
    const wrapper = mountShell()
    expect(wrapper.get('[data-testid="app-shell-title"]').text()).toBe('Admin')
    expect(wrapper.find('h1').exists()).toBe(false)

    const primaryHrefs = wrapper
      .findAll('[data-testid="app-shell-primary-nav"] a')
      .map(a => a.attributes('href'))
    expect(primaryHrefs).toEqual(['/admin', '/admin/orders'])

    const accountHrefs = wrapper
      .findAll('[data-testid="app-shell-account-nav"] a')
      .map(a => a.attributes('href'))
    expect(accountHrefs).toContain('/profile')

    expect(
      wrapper
        .find(
          '[data-testid="app-shell-actions"] [data-testid="notification-bell"]',
        )
        .exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="logout-button"]').exists()).toBe(true)
  })

  it('marks the active primary route with aria-current', () => {
    const wrapper = mountShell()
    const active = wrapper
      .findAll('[data-testid="app-shell-primary-nav"] a')
      .find(a => a.attributes('href') === '/admin/orders')
    expect(active?.attributes('aria-current')).toBe('page')
    expect(active?.attributes('data-variant')).toBe('soft')
  })

  it('toggles the mobile menu and keeps logout reachable there', async () => {
    const wrapper = mountShell()
    const toggle = wrapper.get('[data-testid="app-shell-menu-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="app-shell-mobile-nav"]').exists()).toBe(
      false,
    )

    await toggle.trigger('click')
    await nextTick()

    expect(
      wrapper
        .get('[data-testid="app-shell-menu-toggle"]')
        .attributes('aria-expanded'),
    ).toBe('true')
    expect(wrapper.find('[data-testid="app-shell-mobile-nav"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="logout-button-mobile"]').exists()).toBe(
      true,
    )
  })
})

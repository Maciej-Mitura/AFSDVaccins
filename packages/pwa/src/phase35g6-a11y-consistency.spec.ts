/**
 * @vitest-environment happy-dom
 *
 * Phase 35G6 — focused responsive / a11y / visual consistency checks.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'

const routePath = ref('/admin/orders')

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
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: "<a :href=\"typeof to === 'string' ? to : '#'\"><slot /></a>",
  },
}))

vi.mock('@/composables/useFirebase', () => ({
  useFirebase: () => ({
    isAuthenticated: ref(true),
    logout: vi.fn(() => Promise.resolve(undefined)),
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ clearCurrentUser: vi.fn() }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    unreadCount: computed(() => 2),
    clearNotificationState: vi.fn(),
    loadUnreadCount: vi.fn(),
    subscribeToNotificationEvents: vi.fn(),
    stopNotificationSubscription: vi.fn(),
    registerReconnectRefetch: () => () => undefined,
  }),
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

vi.mock('@/composables/useOrders', () => ({
  useOrders: () => ({
    loadMyOrders: vi.fn(),
    loadWeeklySummary: vi.fn(),
  }),
}))

vi.mock('@/i18n', () => ({
  orderStatusLabel: (status: string) => `status:${status}`,
  deliveryMethodLabel: (method: string | null | undefined) =>
    method ? `method:${method}` : 'orderHistory.value.unavailable',
  formatDate: (value: string) => `date:${value}`,
  formatDateTime: (value: string) => `datetime:${value}`,
  translatePlural: (key: string, count: number) => `${key}:${count}`,
}))

import CommonAppShell from '@/components/common/CommonAppShell.vue'
import CommonNotificationBell from '@/components/common/CommonNotificationBell.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import FeatureAuthLayout from '@/components/feature/auth/FeatureAuthLayout.vue'
import FeatureAdminLayout from '@/components/feature/admin/FeatureAdminLayout.vue'
import FeatureApothekerLayout from '@/components/feature/apotheker/FeatureApothekerLayout.vue'
import FeatureBezorgerLayout from '@/components/feature/bezorger/FeatureBezorgerLayout.vue'
import FeatureCourierAnalyticsLeaderboard from '@/components/feature/admin/analytics/FeatureCourierAnalyticsLeaderboard.vue'
import FeatureOrderHistoryTable from '@/components/feature/order-history/FeatureOrderHistoryTable.vue'

const here = dirname(fileURLToPath(import.meta.url))
const pwaSrc = here

function readSrc(relativePath: string): string {
  return readFileSync(join(pwaSrc, relativePath), 'utf8')
}

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
      :class="$attrs.class"
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

describe('Phase 35G6 heading hierarchy', () => {
  it('page header owns a single h1 and shell title is not an h1', () => {
    const header = mount(CommonPageHeader, { props: { title: 'Orders' } })
    expect(header.findAll('h1')).toHaveLength(1)

    const shell = mount(CommonAppShell, {
      props: {
        title: 'Admin',
        navLinks: [{ label: 'Orders', to: '/admin/orders' }],
      },
      global: {
        stubs: {
          UButton: UButtonStub,
          UIcon: true,
          CommonLanguageSelector: true,
          CommonPushPermissionBanner: true,
        },
      },
    })
    expect(shell.find('h1').exists()).toBe(false)
    expect(shell.get('[data-testid="app-shell-title"]').element.tagName).toBe(
      'P',
    )
  })
})

describe('Phase 35G6 mobile navigation accessibility', () => {
  it('exposes aria-expanded and closes after navigating', async () => {
    routePath.value = '/admin/orders'
    const wrapper = mount(CommonAppShell, {
      props: {
        title: 'Admin',
        navLinks: [{ label: 'Dashboard', to: '/admin' }],
        accountLinks: [{ label: 'Profile', to: '/profile' }],
      },
      global: {
        stubs: {
          UButton: UButtonStub,
          UIcon: true,
          CommonLanguageSelector: true,
          CommonPushPermissionBanner: true,
        },
      },
    })

    const toggle = wrapper.get('[data-testid="app-shell-menu-toggle"]')
    expect(toggle.attributes('aria-controls')).toBe('app-shell-mobile-nav')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    await nextTick()
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[data-testid="app-shell-mobile-nav"]').exists()).toBe(
      true,
    )

    routePath.value = '/admin'
    await nextTick()
    expect(wrapper.find('[data-testid="app-shell-mobile-nav"]').exists()).toBe(
      false,
    )
  })
})

describe('Phase 35G6 aria-expanded on expandable content', () => {
  it('marks order-history line toggles with aria-expanded', async () => {
    const wrapper = mount(FeatureOrderHistoryTable, {
      props: {
        showPharmacy: false,
        orders: [
          {
            id: 'order-1',
            status: 'PLACED',
            totalQuantity: 2,
            submittedAt: '2026-01-01T10:00:00.000Z',
            deliveryDate: '2026-01-02',
            deliveredAt: null,
            cancelledAt: null,
            cancellationReason: null,
            completedByUserId: null,
            completedByDisplayName: null,
            deliveryMethod: null,
            pharmacy: null,
            orderLines: [
              {
                vaccineId: 'v1',
                vaccineName: 'Vaccine A',
                manufacturer: 'Pharma',
                quantity: 2,
              },
            ],
          },
        ],
      } as never,
      global: {
        stubs: {
          UBadge: { template: '<span><slot /></span>' },
          UIcon: true,
        },
      },
    })

    const toggle = wrapper.get('[data-testid="order-history-lines-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })
})

describe('Phase 35G6 status text accompanies colour', () => {
  it('notification unread badge includes sr-only count text', () => {
    const wrapper = mount(CommonNotificationBell, {
      props: { to: '/admin/notifications', label: 'Notifications' },
      global: {
        stubs: {
          UButton: {
            props: ['to'],
            template:
              '<a :href="to" :aria-label="$attrs[\'aria-label\']" :class="$attrs.class" data-testid="notification-bell"><slot /></a>',
          },
          UBadge: {
            template:
              '<span data-testid="notification-unread-badge"><slot /></span>',
          },
        },
      },
    })

    expect(
      wrapper.get('[data-testid="notification-bell"]').attributes('aria-label'),
    ).toContain('notifications.centre.unreadCount')
    expect(
      wrapper.get('[data-testid="notification-unread-badge"]').text(),
    ).toMatch(/2/)
  })
})

describe('Phase 35G6 critical action sizing classes', () => {
  it('keeps min-h-11 on shell, notifications, and key operational actions', () => {
    const shellSrc = readSrc('components/common/CommonAppShell.vue')
    expect(shellSrc).toMatch(/min-h-11 min-w-11 md:hidden/)
    expect(shellSrc).toMatch(/min-h-11 justify-start/)

    expect(readSrc('components/common/CommonNotificationBell.vue')).toMatch(
      /min-h-11/,
    )
    expect(readSrc('views/apotheker/ViewApothekerCreateOrder.vue')).toMatch(
      /data-testid="place-order"[\s\S]*class="min-h-11"/,
    )
    expect(readSrc('views/apotheker/ViewApothekerOrders.vue')).toMatch(
      /canCancel\(order\.status\)[\s\S]*class="min-h-11"/,
    )
    expect(
      readSrc('components/feature/bezorger/FeatureBezorgerStopArrivalPanel.vue'),
    ).toMatch(/min-h-11/)
    expect(
      readSrc('components/feature/voice-report/FeatureRouteVoiceReportCard.vue'),
    ).toMatch(/min-h-11/)
  })
})

describe('Phase 35G6 horizontal overflow patterns', () => {
  it('keeps intentional overflow-x-auto on wide tables without fixed clipping wrappers', () => {
    expect(
      readSrc('components/feature/order-history/FeatureOrderHistoryTable.vue'),
    ).toMatch(/overflow-x-auto/)
    expect(
      readSrc(
        'components/feature/admin/analytics/FeatureCourierAnalyticsLeaderboard.vue',
      ),
    ).toMatch(/overflow-x-auto/)
    expect(readSrc('views/admin/ViewAdminCourierAnalytics.vue')).toMatch(
      /overflow-x-auto/,
    )
    expect(readSrc('views/admin/ViewAdminOrders.vue')).toMatch(/overflow-x-auto/)
  })
})

describe('Phase 35G6 semantic table headers', () => {
  it('uses scope=col on redesigned and analytics tables', () => {
    const history = readSrc(
      'components/feature/order-history/FeatureOrderHistoryTable.vue',
    )
    expect(history.match(/scope="col"/g)?.length).toBeGreaterThan(5)

    const leaderboard = mount(FeatureCourierAnalyticsLeaderboard, {
      props: {
        rankings: [],
        selectedId: null,
      },
      global: {
        stubs: { UBadge: true },
      },
    })
    expect(
      leaderboard.findAll('th').every(th => th.attributes('scope') === 'col'),
    ).toBe(true)

    const analytics = readSrc('views/admin/ViewAdminCourierAnalytics.vue')
    expect(analytics.match(/scope="col"/g)?.length).toBeGreaterThan(10)
  })
})

describe('Phase 35G6 dark-mode semantic classes', () => {
  it('auth and shell surfaces use semantic tokens rather than light-only hex', () => {
    const auth = mount(FeatureAuthLayout, {
      global: {
        stubs: {
          CommonLanguageSelector: true,
          RouterView: { template: '<div />' },
        },
      },
    })
    expect(auth.get('div').classes()).toContain('bg-muted')
    expect(auth.get('h1').classes()).toContain('text-highlighted')

    const shell = readSrc('components/common/CommonAppShell.vue')
    expect(shell).toMatch(/bg-default/)
    expect(shell).toMatch(/bg-elevated/)
    expect(shell).toMatch(/text-highlighted/)
    expect(shell).not.toMatch(/#[0-9a-fA-F]{3,8}/)

    const css = readSrc('assets/main.css')
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/)
  })
})

describe('Phase 35G6 translated labels wrap rather than truncate', () => {
  it('primary nav buttons allow wrapping', () => {
    const shell = readSrc('components/common/CommonAppShell.vue')
    expect(shell).toMatch(/whitespace-normal/)
    expect(shell).not.toMatch(/max-w-40 truncate/)
  })
})

describe('Phase 35G6 modal accessible names', () => {
  it('keeps title bindings on operational modals', () => {
    expect(readSrc('views/admin/ViewAdminRouteTemplates.vue')).toMatch(
      /UModal[\s\S]*:title="formTitle"/,
    )
    expect(readSrc('views/admin/ViewAdminOrders.vue')).toMatch(
      /UModal[\s\S]*admin\.orders\.deliver\.title/,
    )
    expect(
      readSrc('components/feature/delivery-qr/FeatureDeliveryStopQrModal.vue'),
    ).toMatch(/:title="t\('deliveryStopQr\.modal\.title'\)"/)
  })
})

describe('Phase 35G6 unchanged role navigation and permissions', () => {
  it('preserves role primary destinations without duplicating notifications', () => {
    const admin = mount(FeatureAdminLayout, {
      global: {
        stubs: {
          RouterView: true,
          CommonAppShell: {
            props: ['title', 'navLinks', 'accountLinks'],
            template: `
              <nav data-testid="primary-nav">
                <a v-for="link in navLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
              </nav>
              <nav data-testid="account-nav">
                <a v-for="link in accountLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
              </nav>
              <div data-testid="header-actions"><slot name="header-actions" /></div>
            `,
          },
          CommonNotificationBell: {
            props: ['to'],
            template:
              '<a data-testid="notification-bell" :href="to">bell</a>',
          },
        },
      },
    })

    const adminHrefs = admin
      .findAll('[data-testid="primary-nav"] a')
      .map(a => a.attributes('href'))
    expect(adminHrefs).toEqual([
      '/admin',
      '/admin/orders',
      '/admin/history',
      '/admin/route-planning',
      '/admin/route-templates',
      '/admin/analytics/couriers',
      '/admin/vaccines',
      '/admin/stock',
      '/admin/settings',
    ])
    expect(adminHrefs).not.toContain('/admin/notifications')
    expect(
      admin.get('[data-testid="notification-bell"]').attributes('href'),
    ).toBe('/admin/notifications')

    const apotheker = mount(FeatureApothekerLayout, {
      global: {
        stubs: {
          RouterView: true,
          CommonAppShell: {
            props: ['navLinks', 'accountLinks'],
            template: `
              <nav data-testid="primary-nav">
                <a v-for="link in navLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
              </nav>
              <div data-testid="header-actions"><slot name="header-actions" /></div>
            `,
          },
          CommonNotificationBell: {
            props: ['to'],
            template:
              '<a data-testid="notification-bell" :href="to">bell</a>',
          },
        },
      },
    })
    expect(
      apotheker
        .findAll('[data-testid="primary-nav"] a')
        .map(a => a.attributes('href')),
    ).toEqual([
      '/apotheker',
      '/apotheker/vaccines',
      '/apotheker/orders/new',
      '/apotheker/orders',
      '/apotheker/history',
    ])

    const bezorger = mount(FeatureBezorgerLayout, {
      global: {
        stubs: {
          RouterView: true,
          CommonAppShell: {
            props: ['navLinks'],
            template: `
              <nav data-testid="primary-nav">
                <a v-for="link in navLinks" :key="link.to" :href="link.to">{{ link.label }}</a>
              </nav>
              <div data-testid="header-actions"><slot name="header-actions" /></div>
            `,
          },
          CommonNotificationBell: {
            props: ['to'],
            template:
              '<a data-testid="notification-bell" :href="to">bell</a>',
          },
        },
      },
    })
    expect(
      bezorger
        .findAll('[data-testid="primary-nav"] a')
        .map(a => a.attributes('href')),
    ).toEqual(['/bezorger', '/bezorger/today', '/bezorger/tomorrow'])
  })
})

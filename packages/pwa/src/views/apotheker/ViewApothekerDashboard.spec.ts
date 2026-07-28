/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { OrderStatus, RouteStatus, UserRole } from '@vaccin-delivery/types'

import ViewApothekerDashboard from '@/views/apotheker/ViewApothekerDashboard.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const loadMyOrders = vi.fn()
const loadWeeklySummary = vi.fn()
const loadMyPlannedDeliveries = vi.fn()
const loadUnreadCount = vi.fn()
const loadApplicationSettings = vi.fn()

const myOrders = ref([
  {
    id: 'order-active-1',
    status: OrderStatus.Pending,
    submittedAt: '2026-07-28T10:00:00.000Z',
    deliveryDate: '2026-07-29',
    isoWeek: 31,
    isoYear: 2026,
    totalQuantity: 4,
    orderLines: [],
  },
  {
    id: 'order-done-1',
    status: OrderStatus.Delivered,
    submittedAt: '2026-07-20T10:00:00.000Z',
    deliveryDate: '2026-07-21',
    isoWeek: 30,
    isoYear: 2026,
    totalQuantity: 2,
    orderLines: [],
  },
])

const weeklySummary = ref({
  isoYear: 2026,
  isoWeek: 31,
  orderedQuantity: 12,
  weeklyLimit: 200,
  percentageUsed: 6,
  warningReached: false,
  remainingQuantity: 188,
})

const plannedDeliveries = ref([
  {
    routeId: 'route-1',
    stopId: 'stop-1',
    routeDate: '2026-07-29',
    routeStatus: RouteStatus.Assigned,
    stopSequence: 1,
    pharmacyName: 'Apotheek',
    orderCount: 1,
    totalQuantity: 4,
    totalLineCount: 1,
    qrConsumed: false,
    qrAvailable: true,
    orders: [],
  },
])

const unreadCount = ref(2)
const settings = ref({ weeklyDoseCap: 200 })

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({
    currentUser: ref({
      firstName: 'Ann',
      lastName: 'Apotheker',
      role: UserRole.Apotheker,
    }),
    loading: ref(false),
  }),
}))

vi.mock('@/composables/useOrders', () => ({
  useOrders: () => ({
    myOrders,
    weeklySummary,
    loading: ref(false),
    loadMyOrders,
    loadWeeklySummary,
  }),
}))

vi.mock('@/composables/useMyPlannedDeliveries', () => ({
  useMyPlannedDeliveries: () => ({
    plannedDeliveries,
    loading: ref(false),
    loadMyPlannedDeliveries,
  }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    unreadCount,
    loadUnreadCount,
  }),
}))

vi.mock('@/composables/useApplicationSettings', () => ({
  useApplicationSettings: () => ({
    settings,
    loadApplicationSettings,
  }),
}))

vi.mock('@/composables/useGraphQL', () => ({
  default: () => ({ apolloClient: { query: vi.fn() } }),
  registerReconnectHandler: () => () => undefined,
}))

vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
    useRoute: () => ({ name: 'apotheker-dashboard', params: {}, query: {} }),
    RouterLink: {
      name: 'RouterLink',
      props: ['to'],
      template: '<a :href="typeof to === \'string\' ? to : to?.path || \'#\'"><slot /></a>',
    },
  }
})

const uiStubs = {
  CommonLoadingSkeleton: true,
  CommonEmptyState: {
    props: ['title'],
    template: '<div data-testid="empty">{{ title }}</div>',
  },
  CommonPageHeader: {
    props: ['title', 'subtitle', 'meta'],
    template:
      '<header data-testid="common-page-header"><h1>{{ title }}</h1><slot name="actions" /></header>',
  },
  CommonPageSection: {
    props: ['title', 'variant'],
    template:
      '<section><h2 v-if="title">{{ title }}</h2><slot /><slot name="actions" /></section>',
  },
  UButton: {
    props: ['to'],
    template:
      '<a v-if="to" :href="to" data-stub="ubutton"><slot /></a><button v-else type="button"><slot /></button>',
  },
  Button: {
    props: ['to'],
    template:
      '<a v-if="to" :href="to"><slot /></a><button v-else type="button"><slot /></button>',
  },
  UBadge: { template: '<span><slot /></span>' },
  Badge: { template: '<span><slot /></span>' },
  RouterLink: {
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  },
}

describe('ViewApothekerDashboard', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    loadMyOrders.mockReset()
    loadWeeklySummary.mockReset()
    loadMyPlannedDeliveries.mockReset()
    loadUnreadCount.mockReset()
    loadApplicationSettings.mockReset()
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('renders operational sections and navigation actions', async () => {
    const wrapper = mount(ViewApothekerDashboard, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="apotheker-dashboard"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="dashboard-allowance-section"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-deliveries-section"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-recent-orders-section"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="dashboard-notifications-section"]').exists(),
    ).toBe(true)

    expect(wrapper.find('[data-testid="dashboard-allowance-metrics"]').text()).toContain(
      '188',
    )
    expect(
      wrapper.find('[data-testid="dashboard-create-order"]').attributes('href'),
    ).toBe('/apotheker/orders/new')
    expect(
      wrapper.find('[data-testid="dashboard-my-orders"]').attributes('href'),
    ).toBe('/apotheker/orders')
    expect(
      wrapper.find('[data-testid="dashboard-history"]').attributes('href'),
    ).toBe('/apotheker/history')
    expect(
      wrapper
        .find('[data-testid="dashboard-notifications-link"]')
        .attributes('href'),
    ).toBe('/apotheker/notifications')
    expect(wrapper.text()).toContain(
      translate('apotheker.dashboard.notifications.unread', { count: 2 }),
    )

    wrapper.unmount()
  })
})

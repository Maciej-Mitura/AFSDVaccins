/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { UserRole } from '@vaccin-delivery/types'

const loadAdminDailyOverview = vi.fn()
const loadAdminWeeklyStatistics = vi.fn()
const subscribeToAdminOperationsFeed = vi.fn()
const stopFeedSubscription = vi.fn()

const dailyOverview = ref<{
  totalOrders: number
  totalDoses: number
  cancelledOrderCount: number
  statusCounts: Array<{ status: string; count: number }>
} | null>(null)
const weeklyStatistics = ref<{
  isoWeek: number
  isoYear: number
  totalOrders: number
  totalDoses: number
  vaccineQuantities: Array<{
    vaccineId: string
    vaccineName: string
    quantity: number
  }>
} | null>(null)
const adminOverviewLoading = ref(false)
const feedEvents = ref<
  Array<{
    eventType: string
    order?: { id: string; status: string; totalQuantity: number } | null
    vaccine?: {
      name: string
      stockQuantity: number
      stockWarningThreshold: number
    } | null
  }>
>([])
const currentUser = ref({
  firstName: 'Ada',
  lastName: 'Admin',
  email: 'ada@example.com',
  role: UserRole.Admin,
})
const userLoading = ref(false)
const healthResult = ref<{ health: { status: string } } | null>({
  health: { status: 'ok' },
})
const healthLoading = ref(false)
const roleProofResult = ref<{ adminArea: { ok: boolean } } | null>({
  adminArea: { ok: true },
})
const roleProofLoading = ref(false)
const roleProofError = ref<Error | null>(null)

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('@vue/apollo-composable', () => ({
  useQuery: (document: unknown) => {
    if (document === 'ADMIN_AREA_QUERY') {
      return {
        result: roleProofResult,
        loading: roleProofLoading,
        error: roleProofError,
      }
    }
    return {
      result: healthResult,
      loading: healthLoading,
      error: { value: null },
    }
  },
}))

vi.mock('@/assets/graphql/health.query', () => ({
  HEALTH_QUERY: 'HEALTH_QUERY',
}))

vi.mock('@/assets/graphql/role-proof.query', () => ({
  ADMIN_AREA_QUERY: 'ADMIN_AREA_QUERY',
}))

vi.mock('@/composables/useOrders', () => ({
  useOrders: () => ({
    dailyOverview,
    weeklyStatistics,
    adminOverviewLoading,
    loadAdminDailyOverview,
    loadAdminWeeklyStatistics,
  }),
}))

vi.mock('@/composables/useAdminOperationsFeed', () => ({
  useAdminOperationsFeed: () => ({
    feedEvents,
    subscribeToAdminOperationsFeed,
    stopFeedSubscription,
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({
    currentUser,
    loading: userLoading,
  }),
}))

vi.mock('@/composables/useGraphQL', () => ({
  registerReconnectHandler: () => () => undefined,
}))

vi.mock('@/i18n', () => ({
  apiHealthStatusLabel: (status: string) => `health:${status}`,
  operationsFeedEventTypeLabel: (type: string) => `event:${type}`,
  orderStatusLabel: (status: string) => `status:${status}`,
  userRoleLabel: (role: string) => `role:${role}`,
}))

vi.mock('@/utils/operations-feed-display', () => ({
  resolveOperationsFeedDetail: (event: { eventType: string }) =>
    `detail:${event.eventType}`,
}))

vi.mock('@/components/common/CommonLoadingSkeleton.vue', () => ({
  default: {
    name: 'CommonLoadingSkeleton',
    template: '<div data-testid="loading-skeleton" />',
  },
}))

vi.mock('@/components/common/CommonEmptyState.vue', () => ({
  default: {
    name: 'CommonEmptyState',
    props: ['title', 'description'],
    template:
      '<div data-testid="empty-state">{{ title }}|{{ description }}</div>',
  },
}))

vi.mock('@/components/common/CommonErrorState.vue', () => ({
  default: {
    name: 'CommonErrorState',
    props: ['title', 'description'],
    template:
      '<div data-testid="error-state">{{ title }}|{{ description }}</div>',
  },
}))

vi.mock('@/components/common/CommonRealtimeStatus.vue', () => ({
  default: {
    name: 'CommonRealtimeStatus',
    template: '<div data-testid="realtime-status" />',
  },
}))

import ViewAdminDashboard from '@/views/admin/ViewAdminDashboard.vue'

describe('ViewAdminDashboard', () => {
  beforeEach(() => {
    loadAdminDailyOverview.mockClear()
    loadAdminWeeklyStatistics.mockClear()
    subscribeToAdminOperationsFeed.mockClear()
    stopFeedSubscription.mockClear()
    dailyOverview.value = {
      totalOrders: 3,
      totalDoses: 12,
      cancelledOrderCount: 1,
      statusCounts: [{ status: 'PENDING', count: 2 }],
    }
    weeklyStatistics.value = {
      isoWeek: 30,
      isoYear: 2026,
      totalOrders: 8,
      totalDoses: 40,
      vaccineQuantities: [
        { vaccineId: 'v1', vaccineName: 'Flu', quantity: 10 },
      ],
    }
    adminOverviewLoading.value = false
    feedEvents.value = [
      {
        eventType: 'NEW_ORDER',
        order: { id: 'order-1', status: 'PENDING', totalQuantity: 2 },
      },
      {
        eventType: 'LOW_STOCK',
        vaccine: {
          name: 'MMR',
          stockQuantity: 2,
          stockWarningThreshold: 10,
        },
      },
    ]
    currentUser.value = {
      firstName: 'Ada',
      lastName: 'Admin',
      email: 'ada@example.com',
      role: UserRole.Admin,
    }
    userLoading.value = false
    healthResult.value = { health: { status: 'ok' } }
    healthLoading.value = false
    roleProofResult.value = { adminArea: { ok: true } }
    roleProofLoading.value = false
    roleProofError.value = null
  })

  function mountDashboard() {
    const buttonStub = {
      name: 'UButton',
      props: ['to', 'size', 'color', 'variant'],
      template:
        '<a v-if="to" :href="typeof to === \'string\' ? to : \'#\'"><slot /></a><button v-else type="button"><slot /></button>',
    }
    return mount(ViewAdminDashboard, {
      global: {
        stubs: {
          UButton: buttonStub,
          Button: buttonStub,
          UBadge: { template: '<span><slot /></span>' },
          UIcon: true,
          RouterLink: {
            props: ['to'],
            template:
              "<a :href=\"typeof to === 'string' ? to : '#'\"><slot /></a>",
          },
        },
      },
    })
  }

  it('uses a single page h1 and section h2 headings', async () => {
    const wrapper = mountDashboard()
    await flushPromises()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.get('h1').text()).toBe('admin.dashboard.title')
    expect(wrapper.findAll('h2').length).toBeGreaterThanOrEqual(2)
  })

  it('renders operational metric strip and activity sections', async () => {
    const wrapper = mountDashboard()
    await flushPromises()

    expect(
      wrapper.get('[data-testid="admin-dashboard-metrics"]').text(),
    ).toContain('3')
    expect(
      wrapper.get('[data-testid="admin-dashboard-metrics"]').text(),
    ).toContain('12')
    expect(
      wrapper.get('[data-testid="admin-dashboard-operations"]').text(),
    ).toContain('event:NEW_ORDER')
    expect(
      wrapper.get('[data-testid="admin-dashboard-stock-warnings"]').text(),
    ).toContain('detail:LOW_STOCK')
    expect(
      wrapper.get('[data-testid="admin-dashboard-weekly"]').text(),
    ).toContain('Flu')
  })

  it('keeps diagnostics accessible but demoted into a details block', async () => {
    const wrapper = mountDashboard()
    await flushPromises()

    const diagnostics = wrapper.get(
      '[data-testid="admin-dashboard-diagnostics"]',
    )
    expect(diagnostics.element.tagName).toBe('DETAILS')
    expect(diagnostics.text()).toContain('admin.dashboard.roleProof.title')
    expect(diagnostics.text()).toContain('admin.dashboard.apiStatus')
    expect(
      wrapper.get('[data-testid="admin-dashboard-identity"]').text(),
    ).toContain('Ada')
    expect(
      wrapper.get('[data-testid="admin-dashboard-api-health"]').text(),
    ).toContain('health:ok')
    expect(
      wrapper.get('[data-testid="admin-dashboard-role-proof"]').text(),
    ).toContain('admin.dashboard.roleProof.accessible')
  })

  it('does not wrap primary sections in bordered cards', async () => {
    const wrapper = mountDashboard()
    await flushPromises()

    expect(wrapper.html()).not.toMatch(/UCard/)
    const sections = wrapper.findAll('[data-testid="common-page-section"]')
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      expect(section.classes().join(' ')).not.toMatch(/border|shadow/)
    }
  })
})

/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { RouteStatus, UserRole } from '@vaccin-delivery/types'

import ViewBezorgerDashboard from '@/views/bezorger/ViewBezorgerDashboard.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const loadMyTodayRoute = vi.fn()
const loadMyTomorrowRoutePreview = vi.fn()
const loadUnreadCount = vi.fn()

const myTodayRoute = ref<Record<string, unknown> | null>(null)
const myTomorrowRoutePreview = ref<Record<string, unknown> | null>(null)
const unreadCount = ref(0)
const currentUser = ref({
  firstName: 'Ben',
  lastName: 'Bezorger',
  role: UserRole.Bezorger,
})

vi.mock('@vue/apollo-composable', () => ({
  useQuery: () => ({
    result: ref({ bezorgerArea: 'BEZORGER_OK' }),
    loading: ref(false),
    error: ref(null),
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({
    currentUser,
    loading: ref(false),
  }),
}))

vi.mock('@/composables/useDeliveryRoutes', () => ({
  RouteStatus,
  useDeliveryRoutes: () => ({
    myTodayRoute,
    loading: ref(false),
    loadMyTodayRoute,
    myTomorrowRoutePreview,
    previewLoading: ref(false),
    loadMyTomorrowRoutePreview,
  }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    unreadCount,
    loadUnreadCount,
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
    useRoute: () => ({ name: 'bezorger-dashboard', params: {}, query: {} }),
    RouterLink: {
      name: 'RouterLink',
      props: ['to'],
      template:
        "<a :href=\"typeof to === 'string' ? to : to?.path || '#'\"><slot /></a>",
    },
  }
})

const uiStubs = {
  CommonLoadingSkeleton: true,
  CommonEmptyState: {
    props: ['title'],
    template: '<div data-testid="empty">{{ title }}</div>',
  },
  CommonErrorState: true,
  CommonPageHeader: {
    props: ['title', 'subtitle', 'meta'],
    template:
      '<header data-testid="common-page-header"><h1>{{ title }}</h1><slot name="actions" /></header>',
  },
  CommonPageSection: {
    props: ['title', 'variant'],
    template: '<section><h2 v-if="title">{{ title }}</h2><slot /></section>',
  },
  UButton: {
    props: ['to', 'color', 'variant', 'size', 'block', 'loading', 'disabled'],
    inheritAttrs: false,
    template:
      '<a v-if="to" v-bind="$attrs" :href="to"><slot /></a><button v-else type="button" v-bind="$attrs"><slot /></button>',
  },
  Button: {
    props: ['to'],
    inheritAttrs: false,
    template:
      '<a v-if="to" v-bind="$attrs" :href="to"><slot /></a><button v-else type="button" v-bind="$attrs"><slot /></button>',
  },
  UBadge: {
    inheritAttrs: false,
    template: '<span v-bind="$attrs"><slot /></span>',
  },
}

function mountDashboard() {
  return mount(ViewBezorgerDashboard, {
    global: {
      plugins: [createTestI18n('en')],
      stubs: uiStubs,
    },
  })
}

describe('ViewBezorgerDashboard', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    loadMyTodayRoute.mockReset()
    loadMyTomorrowRoutePreview.mockReset()
    loadUnreadCount.mockReset()
    myTodayRoute.value = null
    myTomorrowRoutePreview.value = null
    unreadCount.value = 0
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('renders operational header and demotes role proof', async () => {
    const wrapper = mountDashboard()
    await flushPromises()
    expect(wrapper.find('[data-testid="common-page-header"]').text()).toContain(
      translate('bezorger.dashboard.title'),
    )
    expect(
      wrapper.find('[data-testid="dashboard-role-proof-details"]').exists(),
    ).toBe(true)
    expect(wrapper.findAll('h1').length).toBe(1)
  })

  it('shows unassigned today route and open-today action', async () => {
    const wrapper = mountDashboard()
    await flushPromises()
    expect(wrapper.find('[data-testid="dashboard-today-status"]').text()).toBe(
      translate('bezorger.dashboard.todayRoute.unassigned'),
    )
    expect(
      wrapper.find('[data-testid="dashboard-go-today-block"]').exists(),
    ).toBe(true)
  })

  it('shows start action when route is assigned', async () => {
    myTodayRoute.value = {
      id: 'r1',
      deliveryDate: '2026-07-29',
      status: RouteStatus.Assigned,
    }
    const wrapper = mountDashboard()
    await flushPromises()
    expect(wrapper.find('[data-testid="dashboard-today-status"]').text()).toBe(
      translate('status.route.assigned'),
    )
    expect(
      wrapper.find('[data-testid="dashboard-start-route-block"]').text(),
    ).toContain(translate('bezorger.dashboard.startRoute'))
  })

  it('shows resume action when route is in progress', async () => {
    myTodayRoute.value = {
      id: 'r1',
      deliveryDate: '2026-07-29',
      status: RouteStatus.InProgress,
    }
    const wrapper = mountDashboard()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="dashboard-resume-route-block"]').exists(),
    ).toBe(true)
  })

  it('shows unread notification count and tomorrow link', async () => {
    unreadCount.value = 3
    myTomorrowRoutePreview.value = {
      deliveryDate: '2026-07-30',
      totalStops: 2,
    }
    const wrapper = mountDashboard()
    await flushPromises()
    expect(wrapper.find('[data-testid="dashboard-unread-count"]').text()).toBe(
      translate('bezorger.dashboard.notifications.unread', { count: 3 }),
    )
    expect(
      wrapper.find('[data-testid="dashboard-go-tomorrow"]').attributes('href'),
    ).toBe('/bezorger/tomorrow')
    expect(
      wrapper
        .find('[data-testid="dashboard-notifications-link"]')
        .attributes('href'),
    ).toBe('/bezorger/notifications')
  })
})

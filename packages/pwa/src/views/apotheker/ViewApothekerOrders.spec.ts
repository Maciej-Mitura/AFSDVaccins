/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { OrderStatus } from '@vaccin-delivery/types'

import ViewApothekerOrders from '@/views/apotheker/ViewApothekerOrders.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const loadMyOrders = vi.fn()
const loadWeeklySummary = vi.fn()
const cancelOwnOrder = vi.fn()

const myOrders = ref([
  {
    id: 'pending-1',
    status: OrderStatus.Pending,
    submittedAt: '2026-07-28T10:00:00.000Z',
    deliveryDate: '2026-07-29',
    isoWeek: 31,
    isoYear: 2026,
    totalQuantity: 4,
    orderLines: [
      { vaccineId: 'flu', vaccineName: 'Influenza', quantity: 4 },
    ],
  },
  {
    id: 'delivered-1',
    status: OrderStatus.Delivered,
    submittedAt: '2026-07-20T10:00:00.000Z',
    deliveryDate: '2026-07-21',
    isoWeek: 30,
    isoYear: 2026,
    totalQuantity: 2,
    orderLines: [
      { vaccineId: 'tetanus', vaccineName: 'Tetanus', quantity: 2 },
    ],
  },
])

vi.mock('@/composables/useOrders', () => ({
  useOrders: () => ({
    myOrders,
    loading: ref(false),
    errorMessage: ref(null),
    loadMyOrders,
    loadWeeklySummary,
    cancelOwnOrder,
    subscribeToMyOrderEvents: vi.fn(),
    stopMyOrderSubscriptions: vi.fn(),
    isOrderCannotBeCancelledError: () => false,
  }),
}))

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    subscribeToNotificationEvents: vi.fn(),
    stopNotificationSubscription: vi.fn(),
  }),
  registerNotificationReceivedHandler: () => () => undefined,
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
    useRoute: () => ({ name: 'apotheker-orders', params: {}, query: {} }),
    RouterLink: {
      name: 'RouterLink',
      props: ['to'],
      template: '<a :href="typeof to === \'string\' ? to : \'#\'"><slot /></a>',
    },
  }
})

vi.mock(
  '@/components/feature/apotheker/FeatureApothekerPlannedDeliveries.vue',
  () => ({
    default: {
      name: 'FeatureApothekerPlannedDeliveries',
      template: '<div data-testid="planned-deliveries-section" />',
    },
  }),
)

const uiStubs = {
  CommonLoadingSkeleton: true,
  CommonEmptyState: true,
  CommonErrorState: true,
  CommonRealtimeStatus: true,
  CommonPageHeader: {
    props: ['title', 'subtitle'],
    template:
      '<header data-testid="common-page-header"><h1>{{ title }}</h1><p>{{ subtitle }}</p><slot name="actions" /></header>',
  },
  CommonPageSection: {
    props: ['title', 'variant'],
    template:
      '<section><h2 v-if="title">{{ title }}</h2><slot /><slot name="actions" /></section>',
  },
  UButton: {
    props: ['to', 'disabled', 'loading'],
    emits: ['click'],
    template:
      '<a v-if="to" :href="to"><slot /></a><button v-else type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  Button: {
    props: ['to', 'disabled', 'loading'],
    emits: ['click'],
    template:
      '<a v-if="to" :href="to"><slot /></a><button v-else type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  UBadge: { template: '<span><slot /></span>' },
  Badge: { template: '<span><slot /></span>' },
  UAlert: {
    props: ['title'],
    template: '<div data-testid="alert">{{ title }}</div>',
  },
  Alert: {
    props: ['title'],
    template: '<div data-testid="alert">{{ title }}</div>',
  },
  RouterLink: {
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  },
}

describe('ViewApothekerOrders', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    loadMyOrders.mockReset()
    cancelOwnOrder.mockReset()
    cancelOwnOrder.mockResolvedValue(undefined)
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('lists active orders first and keeps History separate', async () => {
    const wrapper = mount(ViewApothekerOrders, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="common-page-header"]').text()).toContain(
      translate('apotheker.orders.title'),
    )
    expect(wrapper.text()).toContain(translate('apotheker.orders.historyHint'))
    expect(wrapper.text()).toContain(
      translate('apotheker.orders.section.active'),
    )
    expect(wrapper.text()).toContain(
      translate('apotheker.orders.section.completed'),
    )

    const cards = wrapper.findAll('[data-testid="order-card"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].attributes('data-order-state')).toBe('active')
    expect(cards[1].attributes('data-order-state')).toBe('completed')

    wrapper.unmount()
  })

  it('shows cancel only for pending orders and expands lines', async () => {
    const wrapper = mount(ViewApothekerOrders, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    const activeCard = wrapper.find('[data-order-state="active"]')
    const completedCard = wrapper.find('[data-order-state="completed"]')

    expect(activeCard.text()).toContain(translate('common.cancel'))
    expect(completedCard.text()).not.toContain(translate('common.cancel'))

    const toggle = activeCard
      .findAll('button')
      .find(button => button.text().includes(translate('apotheker.orders.toggleLines')))
    expect(toggle).toBeDefined()
    expect(toggle!.attributes('aria-expanded')).toBe('false')
    await toggle!.trigger('click')
    expect(toggle!.attributes('aria-expanded')).toBe('true')
    expect(activeCard.text()).toContain('Influenza')

    wrapper.unmount()
  })
})

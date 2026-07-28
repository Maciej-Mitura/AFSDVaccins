/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { OrderStatus } from '@vaccin-delivery/types'

const loadAdminOrders = vi.fn()
const loadAdminDailyOverview = vi.fn()
const loadStockOverview = vi.fn()
const subscribeToAdminOrderEvents = vi.fn(() => () => {})
const stopAdminOrderSubscriptions = vi.fn()
const updateOrderStatus = vi.fn()
const cancelOrderAsAdmin = vi.fn()
const subscribeToAdminOperationsFeed = vi.fn()
const stopFeedSubscription = vi.fn()

const adminOrders = ref([
  {
    id: 'order-pending-1',
    status: OrderStatus.Pending,
    submittedAt: '2026-07-28T08:00:00.000Z',
    deliveryDate: '2026-07-28',
    totalQuantity: 10,
    apotheker: {
      firstName: 'Pat',
      lastName: 'Pharm',
      email: 'pat@example.com',
    },
    orderLines: [{ vaccineId: 'v1', vaccineName: 'Flu', quantity: 10 }],
    statusHistory: [
      {
        fromStatus: null,
        toStatus: OrderStatus.Pending,
        changedAt: '2026-07-28T08:00:00.000Z',
      },
    ],
  },
  {
    id: 'order-delivered-1',
    status: OrderStatus.Delivered,
    submittedAt: '2026-07-27T08:00:00.000Z',
    deliveryDate: '2026-07-27',
    totalQuantity: 4,
    apotheker: {
      firstName: 'Sam',
      lastName: 'Store',
      email: 'sam@example.com',
    },
    orderLines: [{ vaccineId: 'v1', vaccineName: 'Flu', quantity: 4 }],
    statusHistory: [],
  },
])

const dailyOverview = ref({
  deliveryDate: '2026-07-28',
  totalOrders: 2,
  totalDoses: 14,
  cancelledOrderCount: 0,
  cancelledDoseCount: 0,
  statusCounts: [
    { status: OrderStatus.Pending, count: 1 },
    { status: OrderStatus.Delivered, count: 1 },
  ],
})

const stockOverview = ref([{ id: 'v1', stockQuantity: 100 }])
const feedEvents = ref([
  {
    eventType: 'NEW_ORDER',
    order: { id: 'order-pending-1', status: 'PENDING', totalQuantity: 10 },
  },
])

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('@/composables/useOrders', () => ({
  useOrders: () => ({
    adminOrders,
    dailyOverview,
    ordersLoading: ref(false),
    ordersError: ref(null),
    statusActionLoading: ref(false),
    cancelActionLoading: ref(false),
    loadAdminOrders,
    loadAdminDailyOverview,
    subscribeToAdminOrderEvents,
    stopAdminOrderSubscriptions,
    updateOrderStatus,
    cancelOrderAsAdmin,
    isInvalidOrderStatusTransitionError: () => false,
    isInsufficientStockError: () => false,
    isOrderCannotBeCancelledError: () => false,
    mapGraphQLError: (error: unknown) => String(error),
  }),
}))

vi.mock('@/composables/useStock', () => ({
  useStock: () => ({
    overview: stockOverview,
    loadStockOverview,
  }),
}))

vi.mock('@/composables/useAdminOperationsFeed', () => ({
  useAdminOperationsFeed: () => ({
    feedEvents,
    subscribeToAdminOperationsFeed,
    stopFeedSubscription,
  }),
}))

vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: ref(true) }),
}))

vi.mock('@/composables/useGraphQL', () => ({
  registerReconnectHandler: () => () => {},
}))

vi.mock('@/utils/operations-feed-display', () => ({
  resolveOperationsFeedDetail: () => 'detail:NEW_ORDER',
}))

vi.mock('@/i18n', () => ({
  formatDate: (value: string) => `date:${value}`,
  formatDateTime: (value: string) => `datetime:${value}`,
  operationsFeedEventTypeLabel: (value: string) => `event:${value}`,
  orderStatusLabel: (value: string) => `status:${value}`,
  translatePlural: (key: string, count: number) => `${key}:${count}`,
}))

import ViewAdminOrders from '@/views/admin/ViewAdminOrders.vue'

describe('ViewAdminOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mountOrders() {
    return mount(ViewAdminOrders, {
      global: {
        stubs: {
          CommonRealtimeStatus: true,
          CommonLoadingSkeleton: true,
          CommonEmptyState: true,
          CommonErrorState: true,
          CommonPageHeader: {
            props: ['title', 'subtitle', 'meta'],
            template:
              '<header data-testid="common-page-header"><h1>{{ title }}</h1><slot name="actions" /></header>',
          },
          CommonPageSection: {
            props: ['title', 'description', 'variant'],
            template:
              '<section data-testid="common-page-section" :data-variant="variant"><h2 v-if="title">{{ title }}</h2><slot /><slot name="actions" /></section>',
          },
          UButton: {
            template:
              '<button type="button" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
          },
          UBadge: { template: '<span><slot /></span>' },
          UInput: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template:
              '<input :value="modelValue" v-bind="$attrs" @input="$emit(\'update:modelValue\', ($event.target).value)" />',
          },
          USelect: {
            props: ['modelValue', 'items'],
            emits: ['update:modelValue'],
            template: '<select data-testid="admin-orders-filter-status" />',
          },
          UAlert: { template: '<div><slot /></div>' },
          UModal: {
            template: '<div><slot name="body" /><slot name="footer" /></div>',
          },
          UIcon: true,
        },
      },
    })
  }

  it('uses page header, inset filters, and metric strip', async () => {
    const wrapper = mountOrders()
    await flushPromises()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('[data-testid="admin-orders-filters"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.get('[data-testid="admin-orders-metrics"]').text(),
    ).toContain('2')
    expect(wrapper.html()).not.toMatch(/UCard/)
  })

  it('expands order lines and status history', async () => {
    const wrapper = mountOrders()
    await flushPromises()

    expect(wrapper.find('[data-testid="admin-order-lines"]').exists()).toBe(
      false,
    )
    await wrapper
      .findAll('[data-testid="admin-order-lines-toggle"]')[0]
      .trigger('click')
    expect(wrapper.find('[data-testid="admin-order-lines"]').exists()).toBe(
      true,
    )

    await wrapper
      .findAll('[data-testid="admin-order-history-toggle"]')[0]
      .trigger('click')
    expect(
      wrapper.find('[data-testid="admin-order-status-history"]').exists(),
    ).toBe(true)
  })

  it('keeps pending order actions and quieter completed rows', async () => {
    const wrapper = mountOrders()
    await flushPromises()

    expect(
      wrapper.find('[data-testid="admin-order-mark-planned"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="admin-order-mark-delivered"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="admin-order-cancel"]').exists()).toBe(
      true,
    )

    const delivered = wrapper.get('[data-order-status="DELIVERED"]')
    expect(delivered.classes().join(' ')).toMatch(/text-toned/)
  })

  it('applies filters without changing action wiring', async () => {
    const wrapper = mountOrders()
    await flushPromises()
    loadAdminOrders.mockClear()

    await wrapper
      .get('[data-testid="admin-orders-filter-apply"]')
      .trigger('click')
    await flushPromises()

    expect(loadAdminOrders).toHaveBeenCalled()
    expect(subscribeToAdminOrderEvents).toHaveBeenCalled()
  })
})

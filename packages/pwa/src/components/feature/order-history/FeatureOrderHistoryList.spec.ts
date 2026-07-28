/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { OrderStatus } from '@vaccin-delivery/types'

const load = vi.fn()
const loadMore = vi.fn()
const applyFilters = vi.fn()
const clearFilters = vi.fn()

const filters = {
  search: '',
  status: undefined as OrderStatus | undefined,
  period: 'all' as const,
  deliveryDateFrom: '',
  deliveryDateTo: '',
  apothekerId: undefined as string | undefined,
}

const orders = ref<Array<Record<string, unknown>>>([])
const totalCount = ref<number | null>(0)
const hasNextPage = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const errorMessage = ref<string | null>(null)
const isEmpty = ref(false)
const isFilteredEmpty = ref(false)

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
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

vi.mock('@/composables/useOrderHistory', () => ({
  useOrderHistory: (options: { allowApothekerFilter: boolean }) => ({
    filters,
    orders,
    totalCount,
    hasNextPage,
    loading,
    loadingMore,
    errorMessage,
    isEmpty,
    isFilteredEmpty,
    allowApothekerFilter: options.allowApothekerFilter,
    load,
    loadMore,
    applyFilters,
    clearFilters,
    buildInput: () => ({
      first: 25,
      ...(options.allowApothekerFilter && filters.apothekerId
        ? { apothekerId: filters.apothekerId }
        : {}),
    }),
  }),
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

vi.mock(
  '@/components/feature/order-history/FeatureOrderHistoryFilters.vue',
  () => ({
    default: {
      name: 'FeatureOrderHistoryFilters',
      props: ['filters', 'showPharmacyFilter', 'pharmacyOptions'],
      emits: ['apply', 'clear'],
      template: '<div data-testid="filters-stub" />',
    },
  }),
)

import FeatureOrderHistoryList from '@/components/feature/order-history/FeatureOrderHistoryList.vue'

function sampleOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: '6a569d2cbb2590db980429cd',
    status: OrderStatus.Delivered,
    orderLines: [
      {
        vaccineId: 'v1',
        vaccineName: 'Flu',
        manufacturer: 'Pharma',
        quantity: 2,
      },
    ],
    totalQuantity: 2,
    submittedAt: '2026-07-14T10:00:00.000Z',
    deliveryDate: '2026-07-15',
    cancelledAt: null,
    deliveredAt: null,
    cancellationReason: null,
    pharmacy: {
      apothekerUserId: 'u1',
      pharmacyName: 'Central Pharmacy',
      address: null,
    },
    completedByUserId: null,
    completedByDisplayName: null,
    deliveryMethod: null,
    ...overrides,
  }
}

describe('FeatureOrderHistoryList', () => {
  beforeEach(() => {
    load.mockReset()
    loadMore.mockReset()
    applyFilters.mockReset()
    clearFilters.mockReset()
    orders.value = []
    totalCount.value = 0
    hasNextPage.value = false
    loading.value = false
    loadingMore.value = false
    errorMessage.value = null
    isEmpty.value = false
    isFilteredEmpty.value = false
    filters.search = ''
    filters.status = undefined
    filters.period = 'all'
    filters.apothekerId = undefined
  })

  it('shows loading state', async () => {
    loading.value = true
    const wrapper = mount(FeatureOrderHistoryList, {
      props: {
        title: 'History',
        summary: 'Summary',
        showPharmacy: true,
        allowApothekerFilter: true,
      },
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UButton: true,
          UAlert: true,
          UBadge: { template: '<span><slot /></span>' },
          UIcon: true,
          UInput: true,
          USelect: true,
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="loading-skeleton"]').exists()).toBe(true)
    expect(load).toHaveBeenCalled()
  })

  it('shows empty and filtered empty states', async () => {
    isEmpty.value = true
    const wrapper = mount(FeatureOrderHistoryList, {
      props: {
        title: 'History',
        summary: 'Summary',
        showPharmacy: false,
        allowApothekerFilter: false,
      },
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UButton: true,
          UAlert: true,
          UInput: true,
          USelect: true,
        },
      },
    })
    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain(
      'orderHistory.empty.title',
    )

    isFilteredEmpty.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain(
      'orderHistory.empty.filtered.title',
    )
  })

  it('shows error state', () => {
    errorMessage.value = 'mapped-error'
    const wrapper = mount(FeatureOrderHistoryList, {
      props: {
        title: 'History',
        summary: 'Summary',
        showPharmacy: true,
        allowApothekerFilter: true,
      },
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UButton: true,
          UAlert: true,
          UInput: true,
          USelect: true,
        },
      },
    })
    expect(wrapper.find('[data-testid="error-state"]').text()).toContain(
      'mapped-error',
    )
  })

  it('ADMIN shows pharmacy; APOTHEKER does not', () => {
    orders.value = [sampleOrder()]
    const admin = mount(FeatureOrderHistoryList, {
      props: {
        title: 'Admin',
        summary: 'All',
        showPharmacy: true,
        allowApothekerFilter: true,
      },
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UButton: { template: '<button><slot /></button>' },
          UAlert: true,
          UBadge: { template: '<span><slot /></span>' },
          UIcon: true,
          UInput: true,
          USelect: true,
        },
      },
    })
    expect(admin.text()).toContain('Central Pharmacy')
    expect(admin.find('[data-testid="order-history-table"]').exists()).toBe(
      true,
    )
    expect(admin.find('[data-testid="order-history-cards"]').exists()).toBe(
      true,
    )

    const apotheker = mount(FeatureOrderHistoryList, {
      props: {
        title: 'Apotheker',
        summary: 'Own',
        showPharmacy: false,
        allowApothekerFilter: false,
      },
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UButton: { template: '<button><slot /></button>' },
          UAlert: true,
          UBadge: { template: '<span><slot /></span>' },
          UIcon: true,
          UInput: true,
          USelect: true,
        },
      },
    })
    expect(apotheker.text()).not.toContain('Central Pharmacy')
    expect(apotheker.text()).not.toContain('orderHistory.column.pharmacy')
  })

  it('renders unavailable for null deliveredAt and cancellation reason', () => {
    orders.value = [
      sampleOrder({
        deliveredAt: null,
        cancellationReason: null,
        cancelledAt: '2026-07-16T10:00:00.000Z',
      }),
    ]
    const wrapper = mount(FeatureOrderHistoryList, {
      props: {
        title: 'History',
        summary: 'Summary',
        showPharmacy: true,
        allowApothekerFilter: true,
      },
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UButton: { template: '<button><slot /></button>' },
          UAlert: true,
          UBadge: { template: '<span><slot /></span>' },
          UIcon: true,
          UInput: true,
          USelect: true,
        },
      },
    })
    expect(wrapper.text()).toContain('orderHistory.value.unavailable')
  })

  it('expands order lines locally', async () => {
    orders.value = [sampleOrder()]
    const wrapper = mount(FeatureOrderHistoryList, {
      props: {
        title: 'History',
        summary: 'Summary',
        showPharmacy: false,
        allowApothekerFilter: false,
      },
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UButton: { template: '<button><slot /></button>' },
          UAlert: true,
          UBadge: { template: '<span><slot /></span>' },
          UIcon: true,
          UInput: true,
          USelect: true,
        },
      },
    })

    expect(wrapper.findAll('[data-testid="order-history-lines"]')).toHaveLength(
      0,
    )
    const toggles = wrapper.findAll(
      '[data-testid="order-history-lines-toggle"]',
    )
    expect(toggles.length).toBeGreaterThan(0)
    await toggles[0].trigger('click')
    expect(
      wrapper.findAll('[data-testid="order-history-lines"]').length,
    ).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('Flu')
    expect(wrapper.text()).toContain('Pharma')
  })

  it('load more button triggers pagination', async () => {
    orders.value = [sampleOrder()]
    hasNextPage.value = true
    const wrapper = mount(FeatureOrderHistoryList, {
      props: {
        title: 'History',
        summary: 'Summary',
        showPharmacy: false,
        allowApothekerFilter: false,
      },
      global: {
        stubs: {
          UCard: { template: '<div><slot /></div>' },
          UButton: {
            inheritAttrs: false,
            template:
              '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
          },
          UAlert: true,
          UBadge: { template: '<span><slot /></span>' },
          UIcon: true,
        },
      },
    })
    await wrapper
      .get('[data-testid="order-history-load-more"]')
      .trigger('click')
    expect(loadMore).toHaveBeenCalled()
  })
})

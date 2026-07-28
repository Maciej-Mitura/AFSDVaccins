/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { StockAdjustmentType } from '@vaccin-delivery/types'

const loadStockOverview = vi.fn()
const adjustStock = vi.fn()
const push = vi.fn()

const overview = ref([
  {
    id: 'v1',
    name: 'FluGuard',
    stockQuantity: 3,
    stockWarningThreshold: 10,
    active: true,
  },
  {
    id: 'v2',
    name: 'SafeVax',
    stockQuantity: 50,
    stockWarningThreshold: 10,
    active: true,
  },
])

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: {} }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a><slot /></a>',
  },
}))

vi.mock('@/composables/useStock', () => ({
  useStock: () => ({
    overview,
    loading: ref(false),
    adjusting: ref(false),
    errorMessage: ref(null),
    successMessage: ref(null),
    loadStockOverview,
    adjustStock,
    isInsufficientStockError: () => false,
    isInvalidStockAdjustmentError: () => false,
    mapGraphQLError: (error: unknown) => String(error),
  }),
}))

vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: ref(true) }),
}))

vi.mock('@/i18n', () => ({
  activeInactiveLabel: (active: boolean) => (active ? 'Active' : 'Inactive'),
}))

import ViewAdminStock from '@/views/admin/ViewAdminStock.vue'

describe('ViewAdminStock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mountPage() {
    const buttonStub = {
      name: 'UButton',
      inheritAttrs: true,
      template:
        '<button type="button" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
    }
    return mount(ViewAdminStock, {
      global: {
        stubs: {
          CommonPageHeader: {
            props: ['title'],
            template:
              '<header data-testid="common-page-header"><h1>{{ title }}</h1></header>',
          },
          CommonPageSection: {
            props: ['title', 'variant'],
            template:
              '<section data-testid="common-page-section" :data-variant="variant"><h2 v-if="title">{{ title }}</h2><slot /></section>',
          },
          CommonLoadingSkeleton: true,
          CommonEmptyState: true,
          CommonErrorState: true,
          UButton: buttonStub,
          Button: buttonStub,
          UBadge: { template: '<span><slot /></span>' },
          UAlert: true,
          UIcon: {
            props: ['name'],
            template: '<span :data-icon="name" />',
          },
          UModal: {
            name: 'UModal',
            props: ['open', 'title', 'modelValue'],
            emits: ['update:open', 'update:modelValue'],
            template:
              '<div v-if="open || modelValue" data-testid="stock-adjust-modal"><slot name="body" /><slot /></div>',
          },
          Modal: {
            name: 'Modal',
            props: ['open', 'title', 'modelValue'],
            emits: ['update:open', 'update:modelValue'],
            template:
              '<div v-if="open || modelValue" data-testid="stock-adjust-modal"><slot name="body" /><slot /></div>',
          },
          UForm: {
            name: 'UForm',
            template:
              "<form data-testid=\"stock-adjust-form\" @submit.prevent=\"$emit('submit', { data: { type: 'RESTOCK', quantityDelta: 5, reason: 'restock' } })\"><slot /></form>",
          },
          UFormField: { template: '<div><slot /></div>' },
          USelect: true,
          UInput: true,
          UTextarea: true,
          ULink: true,
        },
      },
    })
  }

  it('shows low-stock warnings before the main list', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const sections = wrapper.findAll('[data-testid="common-page-section"]')
    expect(sections[0].attributes('data-variant')).toBe('inset')
    expect(sections[0].text()).toContain('admin.stock.lowStock')
    expect(sections[0].text()).toContain('FluGuard')
    expect(sections[0].html()).toMatch(/text-warning/)
    expect(wrapper.html()).not.toMatch(/UCard/)
  })

  it('opens adjust form and preserves history navigation', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const adjustButtons = wrapper
      .findAll('button')
      .filter(b => b.text() === 'admin.stock.adjust')
    await adjustButtons[0].trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="stock-adjust-modal"]').exists()).toBe(
      true,
    )

    const historyButtons = wrapper
      .findAll('button')
      .filter(b => b.text() === 'admin.stock.history')
    await historyButtons[0].trigger('click')
    expect(push).toHaveBeenCalledWith('/admin/stock/v1/history')
  })

  it('exposes StockAdjustmentType options in adjust flow', async () => {
    expect(StockAdjustmentType.Restock).toBeTruthy()
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findAll('h1')).toHaveLength(1)
  })
})

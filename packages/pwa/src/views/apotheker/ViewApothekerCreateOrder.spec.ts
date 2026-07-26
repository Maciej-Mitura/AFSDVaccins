/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'
import { GraphQLError } from 'graphql'

import ViewApothekerCreateOrder from '@/views/apotheker/ViewApothekerCreateOrder.vue'
import { createTestI18n } from '@/i18n/test-utils'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { __resetOnlineStatusForTests } from '@/composables/useOnlineStatus'
import { extractDailyLimitExceededDetails } from '@/composables/daily-limit-error'

const routerPush = vi.fn()
const createOrderMock = vi.fn()
const loadDailyAllowancesMock = vi.fn()
const loadWeeklySummaryMock = vi.fn()
const loadVaccinesMock = vi.fn()
const loadApplicationSettingsMock = vi.fn()

const weeklySummary = ref({
  isoYear: 2026,
  isoWeek: 30,
  orderedQuantity: 10,
  weeklyLimit: 200,
  percentageUsed: 5,
  warningReached: false,
  remainingQuantity: 190,
})

const dailyAllowances = ref({
  deliveryDate: '2026-07-26',
  allowances: [
    {
      vaccineId: 'flu',
      vaccineName: 'Influenza',
      dailyMaximum: 50,
      orderedToday: 40,
      remainingToday: 10,
    },
    {
      vaccineId: 'tetanus',
      vaccineName: 'Tetanus',
      dailyMaximum: 50,
      orderedToday: 50,
      remainingToday: 0,
    },
  ],
})

const activeVaccines = ref([
  {
    id: 'flu',
    name: 'Influenza',
    description: '',
    manufacturer: 'PharmaCo',
    stockQuantity: 100,
    stockWarningThreshold: 10,
    active: true,
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
    image: null,
  },
  {
    id: 'tetanus',
    name: 'Tetanus',
    description: '',
    manufacturer: 'PharmaCo',
    stockQuantity: 100,
    stockWarningThreshold: 10,
    active: true,
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
    image: null,
  },
])

const settings = ref({
  orderingClosingTime: '14:00',
  timezone: 'Europe/Brussels',
  weeklyDoseCap: 200,
  dailyDoseCapPerType: 50,
})

vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRouter: () => ({ push: routerPush }),
    useRoute: () => ({ name: 'apotheker-create-order', params: {}, query: {} }),
    RouterLink: {
      name: 'RouterLink',
      props: ['to'],
      template: '<a><slot /></a>',
    },
  }
})

vi.mock('@/composables/useVaccines', () => ({
  useVaccines: () => ({
    activeVaccines,
    loading: ref(false),
    loadVaccines: loadVaccinesMock,
  }),
}))

vi.mock('@/composables/useApplicationSettings', () => ({
  useApplicationSettings: () => ({
    settings,
    loadApplicationSettings: loadApplicationSettingsMock,
  }),
}))

vi.mock('@/composables/useOrders', () => ({
  useOrders: () => ({
    weeklySummary,
    dailyAllowances,
    loading: ref(false),
    errorMessage: ref(null),
    loadWeeklySummary: loadWeeklySummaryMock,
    loadDailyAllowances: loadDailyAllowancesMock,
    createOrder: createOrderMock,
    isWeeklyLimitExceededError: () => false,
    isDailyLimitExceededError: (error: unknown) =>
      extractDailyLimitExceededDetails(error) !== null,
    extractDailyLimitExceededDetails,
    isVaccineInactiveError: () => false,
  }),
}))

type OrderLineFormData = { vaccineId: string; quantity: number }

type ExposedCreateOrder = {
  state: { vaccineId?: string; quantity?: number }
  lines: Array<{ vaccineId: string; quantity: number }>
  addQuantityError: string | null
  formError: string | null
  highlightedVaccineId: string | null
  addMaxQuantity: number
  canSubmit: boolean
  hasInvalidLines: boolean
  addOrMergeLine: (event: { data: OrderLineFormData }) => void
  submitOrder: () => Promise<void>
  validateAddQuantity: () => boolean
  updateLineQuantity: (vaccineId: string, value: number) => void
}

function dailyLimitApolloError(remainingToday: number): ApolloError {
  return new ApolloError({
    graphQLErrors: [
      new GraphQLError('daily limit', {
        extensions: {
          code: 'BAD_REQUEST',
          originalError: {
            error: 'DAILY_LIMIT_EXCEEDED',
            vaccineId: 'flu',
            vaccineName: 'Influenza',
            dailyMaximum: 50,
            alreadyOrderedToday: 50 - remainingToday,
            remainingToday,
            requestedQuantity: 10,
          },
        },
      }),
    ],
  })
}

const uiStubs = {
  CommonLoadingSkeleton: true,
  UCard: { template: '<div><slot name="header" /><slot /></div>' },
  Card: { template: '<div><slot name="header" /><slot /></div>' },
  UAlert: {
    props: ['title'],
    template: '<div data-testid="alert">{{ title }}</div>',
  },
  Alert: {
    props: ['title'],
    template: '<div data-testid="alert">{{ title }}</div>',
  },
  UForm: { template: '<form data-testid="add-line-form"><slot /></form>' },
  Form: { template: '<form data-testid="add-line-form"><slot /></form>' },
  UFormField: {
    props: ['error', 'label'],
    template:
      '<div><label>{{ label }}</label><slot /><p v-if="error" data-testid="field-error">{{ error }}</p></div>',
  },
  FormField: {
    props: ['error', 'label'],
    template:
      '<div><label>{{ label }}</label><slot /><p v-if="error" data-testid="field-error">{{ error }}</p></div>',
  },
  USelect: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: `
      <select
        data-testid="vaccine-select"
        :value="modelValue"
        @change="$emit('update:modelValue', $event.target.value)"
      >
        <option value="" disabled>select</option>
        <option
          v-for="item in items"
          :key="item.value"
          :value="item.value"
          :disabled="item.disabled"
        >
          {{ item.label }}
        </option>
      </select>
    `,
  },
  Select: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: `
      <select
        data-testid="vaccine-select"
        :value="modelValue"
        @change="$emit('update:modelValue', $event.target.value)"
      >
        <option value="" disabled>select</option>
        <option
          v-for="item in items"
          :key="item.value"
          :value="item.value"
          :disabled="item.disabled"
        >
          {{ item.label }}
        </option>
      </select>
    `,
  },
  UInput: {
    props: ['modelValue', 'disabled', 'max', 'min'],
    emits: ['update:modelValue'],
    template: `
      <input
        :value="modelValue"
        :disabled="disabled"
        :max="max"
        :min="min"
        type="number"
        @input="$emit('update:modelValue', Number(($event.target).value))"
      />
    `,
  },
  Input: {
    props: ['modelValue', 'disabled', 'max', 'min'],
    emits: ['update:modelValue'],
    template: `
      <input
        :value="modelValue"
        :disabled="disabled"
        :max="max"
        :min="min"
        type="number"
        @input="$emit('update:modelValue', Number(($event.target).value))"
      />
    `,
  },
  UButton: {
    props: ['disabled', 'loading', 'to', 'title'],
    template:
      '<button type="button" :disabled="disabled" :title="title"><slot /></button>',
  },
  Button: {
    props: ['disabled', 'loading', 'to', 'title'],
    template:
      '<button type="button" :disabled="disabled" :title="title"><slot /></button>',
  },
}

describe('ViewApothekerCreateOrder daily limit UX', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    __resetOnlineStatusForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    routerPush.mockReset()
    createOrderMock.mockReset()
    loadDailyAllowancesMock.mockReset()
    loadWeeklySummaryMock.mockReset()
    loadVaccinesMock.mockReset()
    loadApplicationSettingsMock.mockReset()

    loadDailyAllowancesMock.mockResolvedValue(dailyAllowances.value)
    loadWeeklySummaryMock.mockResolvedValue(weeklySummary.value)
    loadVaccinesMock.mockResolvedValue(undefined)
    loadApplicationSettingsMock.mockResolvedValue(undefined)

    dailyAllowances.value = {
      deliveryDate: '2026-07-26',
      allowances: [
        {
          vaccineId: 'flu',
          vaccineName: 'Influenza',
          dailyMaximum: 50,
          orderedToday: 40,
          remainingToday: 10,
        },
        {
          vaccineId: 'tetanus',
          vaccineName: 'Tetanus',
          dailyMaximum: 50,
          orderedToday: 50,
          remainingToday: 0,
        },
      ],
    }
  })

  afterEach(() => {
    __resetOnlineStatusForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  function mountView() {
    const i18n = createTestI18n('en')
    return mount(ViewApothekerCreateOrder, {
      global: {
        plugins: [i18n],
        stubs: uiStubs,
      },
    })
  }

  function exposed(wrapper: ReturnType<typeof mountView>): ExposedCreateOrder {
    // defineExpose fields are not reflected in VTU component instance typings.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- cast via unknown for VTU
    return wrapper.vm as unknown as ExposedCreateOrder
  }

  function addLine(
    vm: ExposedCreateOrder,
    vaccineId: string,
    quantity: number,
  ): void {
    vm.addOrMergeLine({ data: { vaccineId, quantity } })
  }

  it('displays remaining allowance for the selected vaccine', async () => {
    const wrapper = mountView()
    await flushPromises()

    exposed(wrapper).state.vaccineId = 'flu'
    await nextTick()

    expect(
      wrapper.find('[data-testid="selected-vaccine-allowance"]').text(),
    ).toContain(
      translate('apotheker.orders.create.remainingToday', { remaining: 10 }),
    )
    expect(wrapper.text()).toContain(
      translate('apotheker.orders.create.dailyMaximum'),
    )
    wrapper.unmount()
  })

  it('hard-caps add quantity with max equal to remaining allowance', async () => {
    const wrapper = mountView()
    await flushPromises()

    exposed(wrapper).state.vaccineId = 'flu'
    await nextTick()

    expect(exposed(wrapper).addMaxQuantity).toBe(10)
    expect(
      wrapper.find('[data-testid="add-quantity-input"]').attributes('max'),
    ).toBe('10')
    wrapper.unmount()
  })

  it('marks typed quantity above maximum as invalid and disables submit', async () => {
    const wrapper = mountView()
    await flushPromises()

    const vm = exposed(wrapper)
    vm.state.vaccineId = 'flu'
    await nextTick()
    vm.state.quantity = 11
    await nextTick()
    expect(vm.validateAddQuantity()).toBe(false)
    await nextTick()

    expect(vm.addQuantityError).toBe(
      translate('validation.quantity.exceedsDailyRemaining', { remaining: 10 }),
    )
    expect(wrapper.find('[data-testid="field-error"]').text()).toBe(
      translate('validation.quantity.exceedsDailyRemaining', { remaining: 10 }),
    )

    addLine(vm, 'flu', 11)
    await nextTick()

    expect(vm.lines).toHaveLength(0)
    expect(vm.canSubmit).toBe(false)
    expect(
      wrapper.find('[data-testid="place-order"]').attributes('disabled'),
    ).toBeDefined()
    wrapper.unmount()
  })

  it('accepts exact-limit quantity and enables submit', async () => {
    const wrapper = mountView()
    await flushPromises()

    const vm = exposed(wrapper)
    addLine(vm, 'flu', 10)
    await nextTick()

    expect(wrapper.find('[data-testid="order-line-flu"]').exists()).toBe(true)
    expect(vm.canSubmit).toBe(true)
    expect(
      wrapper.find('[data-testid="place-order"]').attributes('disabled'),
    ).toBeUndefined()
    wrapper.unmount()
  })

  it('disables zero-remaining vaccine selection and shows no-remaining message', async () => {
    const wrapper = mountView()
    await flushPromises()

    const tetanusOption = wrapper
      .findAll('option')
      .find(option => option.attributes('value') === 'tetanus')

    expect(tetanusOption?.attributes('disabled')).toBeDefined()
    expect(tetanusOption?.text()).toContain(
      translate('apotheker.orders.create.noRemainingToday'),
    )
    wrapper.unmount()
  })

  it('blocks duplicate merge that would exceed the remaining allowance', async () => {
    const wrapper = mountView()
    await flushPromises()

    const vm = exposed(wrapper)
    addLine(vm, 'flu', 8)
    await nextTick()
    addLine(vm, 'flu', 3)
    await nextTick()

    expect(vm.addQuantityError).toBe(
      translate('validation.quantity.exceedsDailyRemaining', { remaining: 2 }),
    )
    expect(vm.lines).toEqual([{ vaccineId: 'flu', quantity: 8 }])
    wrapper.unmount()
  })

  it('maps backend daily-limit rejection, refreshes allowance, keeps form open, preserves lines', async () => {
    const wrapper = mountView()
    await flushPromises()

    createOrderMock.mockRejectedValueOnce(dailyLimitApolloError(3))
    loadDailyAllowancesMock.mockImplementation(() => {
      dailyAllowances.value = {
        deliveryDate: '2026-07-26',
        allowances: [
          {
            vaccineId: 'flu',
            vaccineName: 'Influenza',
            dailyMaximum: 50,
            orderedToday: 47,
            remainingToday: 3,
          },
          {
            vaccineId: 'tetanus',
            vaccineName: 'Tetanus',
            dailyMaximum: 50,
            orderedToday: 50,
            remainingToday: 0,
          },
        ],
      }
      return Promise.resolve(dailyAllowances.value)
    })

    const vm = exposed(wrapper)
    addLine(vm, 'flu', 5)
    await nextTick()

    expect(wrapper.find('[data-testid="order-line-flu"]').exists()).toBe(true)

    await vm.submitOrder()
    await flushPromises()

    expect(createOrderMock).toHaveBeenCalledTimes(1)
    expect(loadDailyAllowancesMock).toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
    expect(vm.formError).toBe(
      translate('errors.order.dailyLimitExceededPrecise', { remaining: 3 }),
    )
    expect(wrapper.find('[data-testid="create-order-form-error"]').text()).toBe(
      translate('errors.order.dailyLimitExceededPrecise', { remaining: 3 }),
    )
    expect(wrapper.find('[data-testid="order-line-flu"]').exists()).toBe(true)
    expect(vm.highlightedVaccineId).toBe('flu')
    expect(vm.lines[0]?.quantity).toBe(5)
    expect(wrapper.find('[data-testid="order-line-flu"]').text()).toContain(
      translate('apotheker.orders.create.remainingToday', { remaining: 3 }),
    )
    wrapper.unmount()
  })

  it('uses generic fallback for unknown errors', async () => {
    createOrderMock.mockRejectedValueOnce(new Error('boom'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const wrapper = mountView()
    await flushPromises()

    const vm = exposed(wrapper)
    addLine(vm, 'flu', 1)
    await nextTick()
    await vm.submitOrder()
    await flushPromises()

    expect(vm.formError).toBe(translate('errors.generic'))
    expect(routerPush).not.toHaveBeenCalled()
    consoleError.mockRestore()
    wrapper.unmount()
  })

  it('uses i18n keys for all new daily-limit user-visible messages', () => {
    const keys = [
      'apotheker.orders.create.dailyMaximum',
      'apotheker.orders.create.remainingToday',
      'apotheker.orders.create.noRemainingToday',
      'apotheker.orders.create.requestedQuantity',
      'apotheker.orders.create.reviewQuantities',
      'validation.quantity.exceedsDailyRemaining',
      'errors.order.dailyLimitExceededPrecise',
    ]

    createTestI18n('en')
    for (const key of keys) {
      const message = translate(key, { remaining: 4 })
      expect(message.length).toBeGreaterThan(0)
      expect(message).not.toBe(key)
    }
  })
})

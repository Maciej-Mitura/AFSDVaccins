/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

import ViewBezorgerTomorrowPreview from '@/views/bezorger/ViewBezorgerTomorrowPreview.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const loadMyTomorrowRoutePreview = vi.fn()
const myTomorrowRoutePreview = ref<Record<string, unknown> | null>(null)
const previewErrorMessage = ref<string | null>(null)
const previewErrorCode = ref<string | null>(null)

vi.mock('@/composables/useDeliveryRoutes', () => ({
  useDeliveryRoutes: () => ({
    myTomorrowRoutePreview,
    previewLoading: ref(false),
    previewErrorMessage,
    previewErrorCode,
    loadMyTomorrowRoutePreview,
    subscribeToTomorrowPreviewReconnect: vi.fn(),
    stopTomorrowPreviewReconnect: vi.fn(),
    formatAddress: (stop: { address: { city: string } }) =>
      `Addr, ${stop.address.city}`,
    isMissingTemplatePreviewError: (code: string | null) =>
      code === 'MISSING_TEMPLATE',
    isMultipleActiveTemplatePreviewError: (code: string | null) =>
      code === 'MULTIPLE_TEMPLATES',
  }),
}))

vi.mock('@/composables/useRealtimeConnection', () => ({
  useRealtimeConnection: () => ({ connectionState: ref('connected') }),
}))

const uiStubs = {
  UButton: {
    props: ['loading'],
    emits: ['click'],
    template:
      '<button type="button" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
  },
  UBadge: {
    template: '<span :data-testid="$attrs[\'data-testid\']"><slot /></span>',
  },
  CommonEmptyState: {
    props: ['title'],
    template: '<div data-testid="empty-state">{{ title }}</div>',
  },
  CommonErrorState: {
    props: ['title'],
    template: '<div data-testid="error-state">{{ title }}</div>',
  },
  CommonLoadingSkeleton: { template: '<div data-testid="loading" />' },
  CommonPageHeader: {
    props: ['title', 'subtitle', 'meta'],
    template:
      '<header data-testid="common-page-header"><h1>{{ title }}</h1><slot name="actions" /></header>',
  },
  CommonPageSection: {
    props: ['title', 'variant'],
    template: '<section><h2 v-if="title">{{ title }}</h2><slot /></section>',
  },
}

describe('ViewBezorgerTomorrowPreview Phase 35G5', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    loadMyTomorrowRoutePreview.mockReset()
    myTomorrowRoutePreview.value = null
    previewErrorMessage.value = null
    previewErrorCode.value = null
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('renders informational header without delivery actions', async () => {
    myTomorrowRoutePreview.value = {
      deliveryDate: '2026-07-30',
      routeTemplateName: 'North',
      totalStops: 1,
      totalOrders: 1,
      totalQuantity: 4,
      stops: [
        {
          sequence: 1,
          apothekerProfileId: 'a1',
          pharmacyName: 'Apotheek Zuid',
          address: {
            street: 'S',
            houseNumber: '1',
            postalCode: '1',
            city: 'Gent',
            country: 'BE',
          },
          orderIds: [],
          orderCount: 1,
          totalQuantity: 4,
          lines: [{ vaccineId: 'v1', vaccineName: 'Vac', quantity: 4 }],
        },
      ],
    }
    const wrapper = mount(ViewBezorgerTomorrowPreview, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await nextTick()
    expect(wrapper.find('[data-testid="tomorrow-preview-label"]').text()).toBe(
      translate('bezorger.route.tomorrow.badge'),
    )
    expect(wrapper.text()).toContain(
      translate('bezorger.route.tomorrow.informational'),
    )
    expect(wrapper.text()).toContain('Apotheek Zuid')
    expect(wrapper.find('[data-testid="route-start"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="route-complete"]').exists()).toBe(false)
    expect(wrapper.findAll('h1').length).toBe(1)
  })

  it('shows empty state when preview has no stops', async () => {
    myTomorrowRoutePreview.value = {
      deliveryDate: '2026-07-30',
      routeTemplateName: 'North',
      totalStops: 0,
      totalOrders: 0,
      totalQuantity: 0,
      stops: [],
    }
    const wrapper = mount(ViewBezorgerTomorrowPreview, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await nextTick()
    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain(
      translate('bezorger.route.tomorrow.empty.title'),
    )
  })
})

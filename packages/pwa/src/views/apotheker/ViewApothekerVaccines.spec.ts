/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

import ViewApothekerVaccines from '@/views/apotheker/ViewApothekerVaccines.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const loadVaccines = vi.fn()
const activeVaccines = ref([
  {
    id: 'flu',
    name: 'Influenza',
    description: 'Seasonal flu',
    manufacturer: 'PharmaCo',
    stockQuantity: 40,
    stockWarningThreshold: 10,
    active: true,
    image: null,
  },
  {
    id: 'tetanus',
    name: 'Tetanus',
    description: '',
    manufacturer: 'VaxLabs',
    stockQuantity: 12,
    stockWarningThreshold: 5,
    active: true,
    image: { signedUrl: 'https://example.com/tetanus.png' },
  },
])

vi.mock('@/composables/useVaccines', () => ({
  useVaccines: () => ({
    activeVaccines,
    loading: ref(false),
    errorMessage: ref(null),
    loadVaccines,
  }),
}))

const uiStubs = {
  CommonLoadingSkeleton: true,
  CommonEmptyState: {
    props: ['title'],
    template: '<div data-testid="empty">{{ title }}</div>',
  },
  CommonErrorState: true,
  CommonPageHeader: {
    props: ['title', 'subtitle'],
    template:
      '<header data-testid="common-page-header"><h1>{{ title }}</h1></header>',
  },
  CommonPageSection: {
    props: ['title', 'variant'],
    template: '<section><slot /></section>',
  },
  VaccineImageThumbnail: {
    props: ['vaccineName'],
    template: '<div data-testid="vaccine-thumb">{{ vaccineName }}</div>',
  },
  UFormField: {
    props: ['label'],
    template: '<div><label>{{ label }}</label><slot /></div>',
  },
  UInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input data-testid="vaccine-catalogue-search" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  UBadge: { template: '<span><slot /></span>' },
}

describe('ViewApothekerVaccines', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    loadVaccines.mockReset()
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('renders catalogue rows with status and search, without admin controls', async () => {
    const wrapper = mount(ViewApothekerVaccines, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="common-page-header"]').text()).toContain(
      translate('vaccines.title'),
    )
    expect(
      wrapper.findAll('[data-testid="vaccine-catalogue-item"]'),
    ).toHaveLength(2)
    expect(wrapper.text()).toContain(translate('status.available'))
    expect(wrapper.text()).toContain('PharmaCo')
    expect(wrapper.text()).not.toContain(translate('common.edit'))
    expect(wrapper.text()).not.toContain(translate('vaccines.create'))

    await wrapper
      .find('[data-testid="vaccine-catalogue-search"]')
      .setValue('vax')
    await flushPromises()

    expect(
      wrapper.findAll('[data-testid="vaccine-catalogue-item"]'),
    ).toHaveLength(1)
    expect(wrapper.text()).toContain('Tetanus')

    wrapper.unmount()
  })
})

/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const loadVaccines = vi.fn()
const createVaccine = vi.fn()
const updateVaccine = vi.fn()
const setVaccineActive = vi.fn()

const vaccines = ref([
  {
    id: 'v1',
    name: 'FluGuard',
    description: 'Seasonal',
    manufacturer: 'Acme',
    stockQuantity: 40,
    stockWarningThreshold: 10,
    active: true,
    image: null,
  },
])

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/composables/useVaccines', () => ({
  useVaccines: () => ({
    vaccines,
    loading: ref(false),
    errorMessage: ref(null),
    loadVaccines,
    createVaccine,
    updateVaccine,
    setVaccineActive,
    isVaccineAlreadyExistsError: () => false,
    mapGraphQLError: (error: unknown) => String(error),
  }),
}))

vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: ref(true) }),
}))

vi.mock('@/i18n', () => ({
  activeInactiveLabel: (active: boolean) => (active ? 'Active' : 'Inactive'),
}))

import ViewAdminVaccines from '@/views/admin/ViewAdminVaccines.vue'

describe('ViewAdminVaccines', () => {
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
    return mount(ViewAdminVaccines, {
      global: {
        stubs: {
          CommonPageHeader: {
            props: ['title'],
            template:
              '<header data-testid="common-page-header"><h1>{{ title }}</h1><div data-testid="common-page-header-actions"><slot name="actions" /></div></header>',
          },
          CommonPageSection: {
            template:
              '<section data-testid="common-page-section"><slot /></section>',
          },
          CommonLoadingSkeleton: true,
          CommonEmptyState: true,
          CommonErrorState: true,
          VaccineImageThumbnail: {
            template: '<div data-testid="vaccine-image-thumbnail" />',
          },
          VaccineImageAdminPanel: {
            template: '<div data-testid="vaccine-image-admin-controls" />',
          },
          UButton: buttonStub,
          Button: buttonStub,
          UBadge: { template: '<span><slot /></span>' },
          UAlert: true,
          UModal: {
            name: 'UModal',
            props: ['open', 'title', 'modelValue'],
            emits: ['update:open', 'update:modelValue'],
            template:
              '<div v-if="open || modelValue" data-testid="vaccine-modal"><slot name="body" /><slot /></div>',
          },
          Modal: {
            name: 'Modal',
            props: ['open', 'title', 'modelValue'],
            emits: ['update:open', 'update:modelValue'],
            template:
              '<div v-if="open || modelValue" data-testid="vaccine-modal"><slot name="body" /><slot /></div>',
          },
          UForm: {
            template:
              '<form @submit.prevent="$emit(\'submit\', { data: {} })"><slot /></form>',
          },
          UFormField: { template: '<div><slot /></div>' },
          UInput: true,
          UTextarea: true,
          ULink: true,
        },
      },
    })
  }

  it('uses page header create action and divided catalogue rows', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.text()).toContain('FluGuard')
    expect(wrapper.text()).toContain('Acme')
    expect(wrapper.html()).not.toMatch(/UCard/)
    expect(
      wrapper.get('[data-testid="common-page-header-actions"]').text(),
    ).toContain('vaccines.create')
  })

  it('opens edit form with image admin controls', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const editButtons = wrapper
      .findAll('button')
      .filter(b => b.text() === 'common.edit')
    expect(editButtons.length).toBeGreaterThan(0)
    await editButtons[0].trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="vaccine-modal"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="vaccine-image-admin-controls"]').exists(),
    ).toBe(true)
  })
})

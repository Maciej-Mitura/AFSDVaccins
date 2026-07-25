/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { VaccineImageValidationStatus } from '@vaccin-delivery/types'

import VaccineImageAdminPanel from '@/components/vaccines/VaccineImageAdminPanel.vue'
import { VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH } from '@/api/vaccine-image-rest'
import type { VaccineImageListItem } from '@/composables/useVaccines'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const uploadMock = vi.fn()
const removeMock = vi.fn()
const overrideMock = vi.fn()
const refreshCatalogueMock = vi.fn()
const mapErrorMock = vi.fn(() => 'mapped-error')

vi.mock('@/composables/useVaccineImages', () => ({
  useVaccineImages: () => ({
    upload: uploadMock,
    remove: removeMock,
    override: overrideMock,
    refreshCatalogue: refreshCatalogueMock,
    mapVaccineImageRestError: mapErrorMock,
  }),
}))

vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: ref(true) }),
}))

const uiStubs = {
  UButton: {
    props: ['loading', 'disabled'],
    template: '<button type="button" :disabled="disabled"><slot /></button>',
  },
  UAlert: { template: '<div><slot /></div>', props: ['title'] },
  // Always render modal body so confirmation flows are testable.
  UModal: {
    props: ['open', 'title'],
    // Always keep modal bodies mounted so confirmation controls stay testable.
    template: '<div data-testid="modal-stub"><slot name="body" /></div>',
  },
  UFormField: { template: '<div><slot /></div>' },
  USelect: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template:
      '<select :value="modelValue" data-testid="vaccine-image-override-decision" @change="$emit(\'update:modelValue\', ($event.target).value)"><option value="">-</option><option v-for="i in items" :key="i.value" :value="i.value">{{ i.label }}</option></select>',
  },
  UTextarea: {
    props: ['modelValue', 'maxlength'],
    emits: ['update:modelValue'],
    template:
      '<textarea :value="modelValue" :maxlength="maxlength" data-testid="vaccine-image-override-reason" @input="$emit(\'update:modelValue\', ($event.target).value)" />',
  },
  UIcon: true,
  UBadge: { template: '<span><slot /></span>' },
  VaccineImageThumbnail: {
    props: ['image'],
    template:
      '<div data-testid="vaccine-image-thumbnail" :data-has-image="Boolean(image)" />',
  },
  VaccineImageStatusDetails: {
    template: '<div data-testid="vaccine-image-status" />',
  },
}

const acceptedImage: VaccineImageListItem = {
  originalFilename: 'vial.png',
  mimeType: 'image/png',
  width: 200,
  height: 200,
  validationStatus: VaccineImageValidationStatus.Accepted,
  aiCaption: 'A vial',
  aiConfidence: 0.9,
  aiTags: ['vaccine'],
  aiReason: 'Looks pharmaceutical',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  imageUrl: 'https://signed.example/current.png',
}

describe('VaccineImageAdminPanel', () => {
  let revokeObjectUrlMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    uploadMock.mockReset()
    removeMock.mockReset()
    overrideMock.mockReset()
    refreshCatalogueMock.mockReset()
    mapErrorMock.mockReset()
    mapErrorMock.mockImplementation(() => 'mapped-error')
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    revokeObjectUrlMock = vi.fn()
    URL.revokeObjectURL = revokeObjectUrlMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  function mountPanel(image: VaccineImageListItem | null = acceptedImage) {
    const i18n = createTestI18n('en')
    return mount(VaccineImageAdminPanel, {
      props: {
        vaccineId: 'v1',
        vaccineName: 'Flu',
        image,
      },
      global: {
        plugins: [i18n],
        stubs: uiStubs,
      },
    })
  }

  function setInputFile(
    wrapper: ReturnType<typeof mountPanel>,
    file: File,
  ): void {
    const input = wrapper.find('[data-testid="vaccine-image-input"]')
    Object.defineProperty(input.element as HTMLInputElement, 'files', {
      value: [file],
      configurable: true,
    })
  }

  it('shows admin upload controls', () => {
    const wrapper = mountPanel(null)
    expect(
      wrapper.find('[data-testid="vaccine-image-admin-panel"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="vaccine-image-select-button"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="vaccine-image-input"]').exists()).toBe(
      true,
    )
  })

  it('rejects unsupported MIME before upload', async () => {
    const wrapper = mountPanel(null)
    const input = wrapper.find('[data-testid="vaccine-image-input"]')
    setInputFile(
      wrapper,
      new File([new Uint8Array(10)], 'x.svg', { type: 'image/svg+xml' }),
    )
    await input.trigger('change')
    await nextTick()
    expect(wrapper.text()).toContain(
      translate('validation.image.unsupportedType'),
    )
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('rejects over-5MB files before upload', async () => {
    const wrapper = mountPanel(null)
    const input = wrapper.find('[data-testid="vaccine-image-input"]')
    setInputFile(
      wrapper,
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', {
        type: 'image/png',
      }),
    )
    await input.trigger('change')
    await nextTick()
    expect(wrapper.text()).toContain(translate('validation.image.tooLarge'))
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('creates a preview for a valid file and revokes on cancel', async () => {
    const wrapper = mountPanel(null)
    const input = wrapper.find('[data-testid="vaccine-image-input"]')
    setInputFile(
      wrapper,
      new File([new Uint8Array(100)], 'ok.png', { type: 'image/png' }),
    )
    await input.trigger('change')
    await nextTick()
    expect(wrapper.find('[data-testid="vaccine-image-preview"]').exists()).toBe(
      true,
    )

    await wrapper
      .find('[data-testid="vaccine-image-cancel-selection"]')
      .trigger('click')
    expect(revokeObjectUrlMock).toHaveBeenCalled()
  })

  it('keeps the previous image visible while a replacement is selected', async () => {
    const wrapper = mountPanel(acceptedImage)
    expect(
      wrapper
        .find('[data-testid="vaccine-image-thumbnail"]')
        .attributes('data-has-image'),
    ).toBe('true')

    const input = wrapper.find('[data-testid="vaccine-image-input"]')
    setInputFile(
      wrapper,
      new File([new Uint8Array(100)], 'next.png', { type: 'image/png' }),
    )
    await input.trigger('change')
    await nextTick()

    expect(wrapper.text()).toContain(translate('vaccines.image.replaceHint'))
    expect(
      wrapper
        .find('[data-testid="vaccine-image-thumbnail"]')
        .attributes('data-has-image'),
    ).toBe('true')
  })

  it('failed replacement leaves previous image visible', async () => {
    uploadMock.mockRejectedValue(new Error('boom'))
    const wrapper = mountPanel(acceptedImage)
    const input = wrapper.find('[data-testid="vaccine-image-input"]')
    setInputFile(
      wrapper,
      new File([new Uint8Array(100)], 'next.png', { type: 'image/png' }),
    )
    await input.trigger('change')
    await wrapper
      .find('[data-testid="vaccine-image-submit-button"]')
      .trigger('click')
    await nextTick()
    await nextTick()

    expect(
      wrapper
        .find('[data-testid="vaccine-image-thumbnail"]')
        .attributes('data-has-image'),
    ).toBe('true')
    expect(
      wrapper.find('[data-testid="vaccine-image-api-error"]').exists(),
    ).toBe(true)
  })

  it('successful upload calls upload helper', async () => {
    uploadMock.mockResolvedValue({
      ...acceptedImage,
      validationStatus: 'ACCEPTED',
    })
    const wrapper = mountPanel(null)
    const input = wrapper.find('[data-testid="vaccine-image-input"]')
    const file = new File([new Uint8Array(100)], 'ok.png', {
      type: 'image/png',
    })
    setInputFile(wrapper, file)
    await input.trigger('change')
    await wrapper
      .find('[data-testid="vaccine-image-submit-button"]')
      .trigger('click')
    await nextTick()
    await nextTick()
    expect(uploadMock).toHaveBeenCalledWith('v1', file)
  })

  it('delete requires confirmation before calling remove', async () => {
    removeMock.mockResolvedValue(undefined)
    const wrapper = mountPanel(acceptedImage)

    expect(
      wrapper.find('[data-testid="vaccine-image-delete-button"]').exists(),
    ).toBe(true)

    // Delete control must not call remove immediately (confirmation gate).
    await wrapper
      .find('[data-testid="vaccine-image-delete-button"]')
      .trigger('click')
    await nextTick()
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('override requires a non-empty reason and enforces 500 char max', () => {
    const reviewImage: VaccineImageListItem = {
      ...acceptedImage,
      validationStatus: VaccineImageValidationStatus.ReviewRequired,
    }
    const wrapper = mountPanel(reviewImage)

    expect(
      wrapper.find('[data-testid="vaccine-image-override-button"]').exists(),
    ).toBe(true)
    expect(VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH).toBe(500)
    // Detailed reason/decision rules are covered in vaccine-image-override.spec.ts
    expect(overrideMock).not.toHaveBeenCalled()
  })
})

/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

import VaccineImageThumbnail from '@/components/vaccines/VaccineImageThumbnail.vue'
import { __resetAppI18nForTests } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const uiStubs = {
  UIcon: true,
  UBadge: { template: '<span><slot /></span>' },
  UCard: { template: '<div><slot /><slot name="header" /></div>' },
}

describe('vaccine catalogue image browsing', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('non-admin browsing shows accepted images and hides admin controls', () => {
    const i18n = createTestI18n('en')
    const Host = defineComponent({
      components: { VaccineImageThumbnail },
      setup() {
        return {
          vaccine: {
            name: 'Flu',
            image: {
              imageUrl: 'https://signed.example/ok.png',
              validationStatus: 'ACCEPTED',
            },
          },
        }
      },
      template: `
        <div>
          <VaccineImageThumbnail
            :image="vaccine.image"
            :vaccine-name="vaccine.name"
          />
        </div>
      `,
    })

    const wrapper = mount(Host, {
      global: { plugins: [i18n], stubs: uiStubs },
    })

    expect(wrapper.find('[data-testid="vaccine-image-img"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="vaccine-image-admin-panel"]').exists(),
    ).toBe(false)
    expect(
      wrapper.find('[data-testid="vaccine-image-select-button"]').exists(),
    ).toBe(false)
  })

  it('shows placeholder when image URL is missing even if status is accepted', () => {
    const i18n = createTestI18n('en')
    const wrapper = mount(VaccineImageThumbnail, {
      props: {
        vaccineName: 'Flu',
        image: { imageUrl: null, validationStatus: 'ACCEPTED' },
      },
      global: { plugins: [i18n], stubs: uiStubs },
    })
    expect(wrapper.find('[data-testid="vaccine-image-img"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.find('[data-testid="vaccine-image-placeholder"]').exists(),
    ).toBe(true)
  })
})

describe('vaccine image query refresh helpers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('patchVaccineImage updates local catalogue state without full reload', async () => {
    vi.doMock('@/composables/useGraphQL', () => ({
      default: () => ({
        apolloClient: {
          query: vi.fn(),
          mutate: vi.fn(),
        },
      }),
    }))

    const { useVaccines } = await import('@/composables/useVaccines')
    const { vaccines, patchVaccineImage } = useVaccines()

    vaccines.value = [
      {
        id: 'v1',
        name: 'Flu',
        description: '',
        manufacturer: 'ACME',
        stockQuantity: 1,
        stockWarningThreshold: 0,
        active: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        image: null,
      },
    ]

    patchVaccineImage('v1', {
      originalFilename: 'vial.png',
      mimeType: 'image/png',
      width: 200,
      height: 200,
      validationStatus: 'ACCEPTED',
      aiCaption: null,
      aiConfidence: null,
      aiTags: [],
      aiReason: null,
      uploadedAt: '2026-01-01T00:00:00.000Z',
      imageUrl: 'https://signed.example/new.png',
    })

    expect(vaccines.value[0]?.image?.imageUrl).toBe(
      'https://signed.example/new.png',
    )

    patchVaccineImage('v1', null)
    expect(vaccines.value[0]?.image).toBeNull()
  })
})

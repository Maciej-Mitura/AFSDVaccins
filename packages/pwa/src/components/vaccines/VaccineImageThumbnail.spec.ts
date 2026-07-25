/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { mount, type ComponentMountingOptions } from '@vue/test-utils'

import VaccineImageThumbnail, {
  type VaccineImageThumbnailSource,
} from '@/components/vaccines/VaccineImageThumbnail.vue'
import { __resetAppI18nForTests } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const uiStubs = {
  UIcon: true,
  UBadge: { template: '<span><slot /></span>' },
}

type ThumbProps = {
  image?: VaccineImageThumbnailSource
  vaccineName: string
  showReviewIndicator?: boolean
  onUrlExpired?: () => void | Promise<void>
}

describe('VaccineImageThumbnail', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  function mountThumb(props: ThumbProps) {
    const i18n = createTestI18n('en')
    const options: ComponentMountingOptions<typeof VaccineImageThumbnail> = {
      props,
      global: { plugins: [i18n], stubs: uiStubs },
    }
    return mount(VaccineImageThumbnail, options)
  }

  it('shows accepted images for catalogue browsing', () => {
    const wrapper = mountThumb({
      vaccineName: 'Flu',
      image: {
        imageUrl: 'https://signed.example/ok.png',
        validationStatus: 'ACCEPTED',
      },
    })
    const img = wrapper.find('[data-testid="vaccine-image-img"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://signed.example/ok.png')
    expect(img.attributes('alt')).toContain('Flu')
  })

  it('shows placeholder when no image', () => {
    const wrapper = mountThumb({
      vaccineName: 'Flu',
      image: null,
    })
    expect(wrapper.find('[data-testid="vaccine-image-img"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.find('[data-testid="vaccine-image-placeholder"]').exists(),
    ).toBe(true)
  })

  it('shows placeholder for rejected and analysis-failed images', () => {
    for (const status of ['REJECTED', 'ANALYSIS_FAILED'] as const) {
      const wrapper = mountThumb({
        vaccineName: 'Flu',
        image: {
          imageUrl: 'https://signed.example/hidden.png',
          validationStatus: status,
        },
      })
      expect(wrapper.find('[data-testid="vaccine-image-img"]').exists()).toBe(
        false,
      )
      expect(
        wrapper.find('[data-testid="vaccine-image-placeholder"]').exists(),
      ).toBe(true)
    }
  })

  it('displays review-required images per browseability policy', () => {
    const wrapper = mountThumb({
      vaccineName: 'Flu',
      image: {
        imageUrl: 'https://signed.example/review.png',
        validationStatus: 'REVIEW_REQUIRED',
      },
      showReviewIndicator: true,
    })
    expect(wrapper.find('[data-testid="vaccine-image-img"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="vaccine-image-review-indicator"]').exists(),
    ).toBe(true)
  })

  it('refetches at most once on expired URL then shows placeholder', async () => {
    const onUrlExpired = vi.fn(() => Promise.resolve())

    const image = ref({
      imageUrl: 'https://signed.example/expired.png',
      validationStatus: 'ACCEPTED',
    })

    const Host = defineComponent({
      components: { VaccineImageThumbnail },
      setup() {
        return { image, onUrlExpired }
      },
      template: `
        <VaccineImageThumbnail
          :image="image"
          vaccine-name="Flu"
          :on-url-expired="onUrlExpired"
        />
      `,
    })

    const i18n = createTestI18n('en')
    const wrapper = mount(Host, {
      global: { plugins: [i18n], stubs: uiStubs },
    })

    const img = wrapper.find('[data-testid="vaccine-image-img"]')
    await img.trigger('error')
    await nextTick()
    expect(onUrlExpired).toHaveBeenCalledTimes(1)

    await img.trigger('error')
    await nextTick()
    expect(onUrlExpired).toHaveBeenCalledTimes(1)
    expect(
      wrapper.find('[data-testid="vaccine-image-placeholder"]').exists(),
    ).toBe(true)
  })
})

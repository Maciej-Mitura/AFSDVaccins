/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createVaccineImagePreviewController,
  validateVaccineImageFile,
} from '@/composables/vaccine-image-file'
import { VACCINE_IMAGE_MAX_BYTES } from '@/api/vaccine-image-rest'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

function fileOf(type: string, size: number, name = 'file.bin'): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('vaccine-image-file', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('rejects missing file', () => {
    const result = validateVaccineImageFile(null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('NO_FILE')
      expect(result.message).toBe(translate('validation.image.required'))
    }
  })

  it('rejects unsupported MIME types', () => {
    const result = validateVaccineImageFile(
      fileOf('image/svg+xml', 100, 'x.svg'),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('UNSUPPORTED_TYPE')
      expect(result.message).toBe(translate('validation.image.unsupportedType'))
    }
  })

  it('rejects files over 5 MB', () => {
    const result = validateVaccineImageFile(
      fileOf('image/png', VACCINE_IMAGE_MAX_BYTES + 1, 'big.png'),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('TOO_LARGE')
      expect(result.message).toBe(translate('validation.image.tooLarge'))
    }
  })

  it('accepts JPEG, PNG and WebP under the size limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp'] as const) {
      const result = validateVaccineImageFile(fileOf(type, 2048, 'ok.bin'))
      expect(result.ok).toBe(true)
    }
  })

  it('creates a preview object URL and revokes the previous one', () => {
    const createSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:preview-1')
      .mockReturnValueOnce('blob:preview-2')
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})

    const controller = createVaccineImagePreviewController()
    const first = controller.select(fileOf('image/png', 10, 'a.png'))
    expect(first).toBe('blob:preview-1')
    expect(revokeSpy).not.toHaveBeenCalled()

    const second = controller.select(fileOf('image/jpeg', 10, 'b.jpg'))
    expect(second).toBe('blob:preview-2')
    expect(revokeSpy).toHaveBeenCalledWith('blob:preview-1')

    controller.revoke()
    expect(revokeSpy).toHaveBeenCalledWith('blob:preview-2')
    expect(controller.current()).toBeNull()

    createSpy.mockRestore()
    revokeSpy.mockRestore()
  })
})

import {
  createMinimalJpegHeaderOnly,
  createSvgBytes,
  createTestPng,
} from './__tests__/test-image.fixtures'
import {
  generateVaccineImageStorageKey,
  sanitizeDisplayFilename,
  validateVaccineImageUpload,
} from './vaccine-image-file.validation'
import { InvalidVaccineImageException } from './vaccine-image.validation'
import { VACCINE_IMAGE_MAX_BYTES } from './vaccine-image-upload.exceptions'

describe('validateVaccineImageUpload', () => {
  it('accepts a valid PNG with sufficient dimensions', () => {
    const bytes = createTestPng(200, 200)
    const result = validateVaccineImageUpload({
      bytes,
      originalFilename: 'vial.PNG',
      declaredMimeType: 'image/png',
    })

    expect(result.mimeType).toBe('image/png')
    expect(result.width).toBe(200)
    expect(result.height).toBe(200)
    expect(result.extension).toBe('png')
    expect(result.displayFilename).toBe('vial.PNG')
  })

  it('rejects zero-byte files', () => {
    expect(() =>
      validateVaccineImageUpload({ bytes: Buffer.alloc(0) }),
    ).toThrow(InvalidVaccineImageException)
  })

  it('rejects oversized files', () => {
    const bytes = Buffer.alloc(VACCINE_IMAGE_MAX_BYTES + 1, 0xff)
    bytes[0] = 0xff
    bytes[1] = 0xd8
    bytes[2] = 0xff
    expect(() => validateVaccineImageUpload({ bytes })).toThrow(
      InvalidVaccineImageException,
    )
  })

  it('rejects SVG', () => {
    expect(() =>
      validateVaccineImageUpload({
        bytes: createSvgBytes(),
        originalFilename: 'image.png',
        declaredMimeType: 'image/png',
      }),
    ).toThrow(InvalidVaccineImageException)
  })

  it('rejects fake extension with wrong magic bytes', () => {
    expect(() =>
      validateVaccineImageUpload({
        bytes: Buffer.from('not-an-image'),
        originalFilename: 'photo.jpg',
        declaredMimeType: 'image/jpeg',
      }),
    ).toThrow(InvalidVaccineImageException)
  })

  it('rejects corrupt/truncated JPEG', () => {
    expect(() =>
      validateVaccineImageUpload({
        bytes: createMinimalJpegHeaderOnly(),
        originalFilename: 'broken.jpg',
      }),
    ).toThrow(InvalidVaccineImageException)
  })

  it('rejects dimensions below minimum', () => {
    expect(() =>
      validateVaccineImageUpload({
        bytes: createTestPng(199, 200),
        originalFilename: 'small.png',
      }),
    ).toThrow(/at least 200x200/i)
  })

  it('rejects dimensions above maximum', () => {
    expect(() =>
      validateVaccineImageUpload({
        bytes: createTestPng(6001, 200),
        originalFilename: 'huge.png',
      }),
    ).toThrow(/at most 6000x6000/i)
  })

  it('rejects mismatched declared MIME type', () => {
    expect(() =>
      validateVaccineImageUpload({
        bytes: createTestPng(200, 200),
        declaredMimeType: 'image/jpeg',
      }),
    ).toThrow(/Content-Type/i)
  })
})

describe('generateVaccineImageStorageKey', () => {
  it('is server-generated and ignores original filename', () => {
    const vaccineId = '507f1f77bcf86cd799439011'
    const key = generateVaccineImageStorageKey(vaccineId, 'png')
    expect(key).toMatch(
      /^vaccines\/507f1f77bcf86cd799439011\/[0-9a-f-]{36}\.png$/,
    )
    expect(key).not.toContain('..')
    expect(key).not.toContain('evil')
  })

  it('sanitizes display filenames without affecting storage keys', () => {
    expect(sanitizeDisplayFilename('../../evil.jpg', 'jpg')).toBe('evil.jpg')
    const key = generateVaccineImageStorageKey(
      '507f1f77bcf86cd799439011',
      'jpg',
    )
    expect(key).not.toContain('evil')
  })
})

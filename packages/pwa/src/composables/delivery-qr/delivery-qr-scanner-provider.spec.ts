/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'

import {
  classifyMediaDevicesError,
  DELIVERY_QR_DEFAULT_CONSTRAINTS,
  stopMediaStreamTracks,
  vueQrcodeReaderScannerProvider,
} from '@/composables/delivery-qr/delivery-qr-scanner-provider'

describe('delivery-qr-scanner-provider', () => {
  it('prefers rear-facing camera constraints', () => {
    expect(DELIVERY_QR_DEFAULT_CONSTRAINTS).toEqual({
      facingMode: { ideal: 'environment' },
    })
    expect(vueQrcodeReaderScannerProvider.getConstraints()).toEqual(
      DELIVERY_QR_DEFAULT_CONSTRAINTS,
    )
  })

  it('classifies common media errors', () => {
    expect(
      classifyMediaDevicesError(
        Object.assign(new Error('x'), { name: 'NotAllowedError' }),
      ),
    ).toBe('permission-denied')
    expect(
      classifyMediaDevicesError(
        Object.assign(new Error('x'), { name: 'NotFoundError' }),
      ),
    ).toBe('no-camera')
    expect(
      classifyMediaDevicesError(
        Object.assign(new Error('x'), { name: 'NotReadableError' }),
      ),
    ).toBe('camera-in-use')
  })

  it('stops all media tracks safely', () => {
    const stop = vi.fn()
    stopMediaStreamTracks({
      getTracks: () => [{ stop }, { stop }],
    } as unknown as MediaStream)
    expect(stop).toHaveBeenCalledTimes(2)
    expect(() => stopMediaStreamTracks(null)).not.toThrow()
  })
})

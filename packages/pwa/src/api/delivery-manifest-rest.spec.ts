/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveAuthBearerToken = vi.fn()
const resolveBackendRestOrigin = vi.fn(() => 'http://localhost:3000')

vi.mock('@/firebase/auth-session', () => ({
  resolveAuthBearerToken: (...args: unknown[]) =>
    resolveAuthBearerToken(...args),
}))

vi.mock('@/api/vaccine-image-rest', () => ({
  resolveBackendRestOrigin: () => resolveBackendRestOrigin(),
}))

import {
  buildRouteManifestFallbackFilename,
  buildStopManifestFallbackFilename,
  DeliveryManifestRestError,
  downloadManifestPdf,
  fetchRouteManifestPdf,
  fetchStopManifestPdf,
} from '@/api/delivery-manifest-rest'

describe('delivery-manifest-rest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveAuthBearerToken.mockResolvedValue('token-1')
    resolveBackendRestOrigin.mockReturnValue('http://localhost:3000')
  })

  it('builds safe filenames without pharmacy names', () => {
    expect(
      buildRouteManifestFallbackFilename(
        '2026-07-26',
        '507f1f77bcf86cd799439011',
      ),
    ).toBe('delivery-manifest-2026-07-26-route-99439011.pdf')
    expect(
      buildStopManifestFallbackFilename(
        '2026-07-26',
        '507f1f77bcf86cd799439011',
        2,
      ),
    ).toBe('delivery-manifest-2026-07-26-route-99439011-stop-2.pdf')
  })

  it('fetches route PDF with bearer auth, no-store, and validates content-type', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          if (name === 'Content-Type') return 'application/pdf'
          if (name === 'Content-Disposition') {
            return 'attachment; filename="delivery-manifest-2026-07-26-route-99439011.pdf"'
          }
          return null
        },
      },
      blob: () => Promise.resolve(blob),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRouteManifestPdf(
      '507f1f77bcf86cd799439011',
      '2026-07-26',
    )

    expect(result.contentType).toBe('application/pdf')
    expect(result.filename).toContain('delivery-manifest-')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/delivery-routes/507f1f77bcf86cd799439011/manifest.pdf',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
      }),
    )
    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer token-1')
  })

  it('retries once on 401', async () => {
    resolveAuthBearerToken
      .mockResolvedValueOnce('stale')
      .mockResolvedValueOnce('fresh')

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: () => Promise.resolve({ error: 'UNAUTHENTICATED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === 'Content-Type' ? 'application/pdf' : null,
        },
        blob: () => Promise.resolve(blob),
      })
    vi.stubGlobal('fetch', fetchMock)

    await fetchStopManifestPdf('route1', 'stop1', '2026-07-26', 1)
    expect(resolveAuthBearerToken).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects non-PDF content types', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => 'text/html',
      },
      blob: () => Promise.resolve(new Blob(['nope'])),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchRouteManifestPdf('route1', '2026-07-26'),
    ).rejects.toBeInstanceOf(DeliveryManifestRestError)
  })

  it('downloadManifestPdf revokes object URL and does not persist offline', () => {
    const revoke = vi.fn()
    const create = vi.fn(() => 'blob:manifest')
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: create,
      revokeObjectURL: revoke,
    })

    downloadManifestPdf(
      new Blob(['%PDF'], { type: 'application/pdf' }),
      'delivery-manifest-test.pdf',
    )

    expect(create).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:manifest')
  })
})

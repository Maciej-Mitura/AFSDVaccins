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
  COURIER_ANALYTICS_CSV_FALLBACK_FILENAME,
  CourierAnalyticsRestError,
  downloadCourierAnalyticsCsv,
  fetchCourierPerformanceCsv,
  filenameFromContentDisposition,
} from '@/api/courier-analytics-rest'

describe('courier-analytics-rest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveAuthBearerToken.mockResolvedValue('token-1')
    resolveBackendRestOrigin.mockReturnValue('http://localhost:3000')
  })

  it('fetches CSV with bearer auth and no-store', async () => {
    const blob = new Blob(['rank,courier\n1,Ada'], { type: 'text/csv' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          if (name === 'Content-Type') return 'text/csv; charset=utf-8'
          if (name === 'Content-Disposition') {
            return 'attachment; filename="courier-performance-all-time.csv"'
          }
          return null
        },
      },
      blob: () => Promise.resolve(blob),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchCourierPerformanceCsv()
    expect(result.contentType).toBe('text/csv')
    expect(result.filename).toBe('courier-performance-all-time.csv')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/analytics/couriers/export.csv',
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

    const blob = new Blob(['ok'], { type: 'text/csv' })
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
          get: (name: string) => (name === 'Content-Type' ? 'text/csv' : null),
        },
        blob: () => Promise.resolve(blob),
      })
    vi.stubGlobal('fetch', fetchMock)

    await fetchCourierPerformanceCsv()
    expect(resolveAuthBearerToken).toHaveBeenCalledTimes(2)
    expect(resolveAuthBearerToken).toHaveBeenNthCalledWith(2, true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects non-CSV content types', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      blob: () => Promise.resolve(new Blob(['{}'])),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCourierPerformanceCsv()).rejects.toBeInstanceOf(
      CourierAnalyticsRestError,
    )
  })

  it('uses safe Content-Disposition filename or fallback', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="courier-performance-all-time.csv"',
        COURIER_ANALYTICS_CSV_FALLBACK_FILENAME,
      ),
    ).toBe('courier-performance-all-time.csv')
    expect(
      filenameFromContentDisposition(
        'attachment; filename="../evil.csv"',
        COURIER_ANALYTICS_CSV_FALLBACK_FILENAME,
      ),
    ).toBe(COURIER_ANALYTICS_CSV_FALLBACK_FILENAME)
  })

  it('revokes Blob URL after download', () => {
    const revoke = vi.fn()
    const create = vi.fn(() => 'blob:csv')
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: create,
      revokeObjectURL: revoke,
    })

    downloadCourierAnalyticsCsv(
      new Blob(['a,b'], { type: 'text/csv' }),
      'courier-performance-all-time.csv',
    )

    expect(create).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:csv')
  })
})

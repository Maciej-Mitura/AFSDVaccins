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
  fetchRouteVoiceReportAudio,
  isAllowedPlaybackContentType,
  retryRouteVoiceReportTranscription,
  ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES,
  uploadRouteVoiceReport,
} from '@/api/route-voice-report-rest'
import { RouteVoiceReportRestError } from '@/api/route-voice-report-errors'

describe('route-voice-report-rest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveAuthBearerToken.mockResolvedValue('token-1')
    resolveBackendRestOrigin.mockReturnValue('http://localhost:3000')
  })

  it('uploads FormData with exact required fields and actual Blob MIME', async () => {
    const audio = new Blob(['opus'], { type: 'audio/webm;codecs=opus' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: 'r1',
          routeId: 'route-1',
          sequenceNumber: 1,
          status: 'AVAILABLE',
          mimeType: 'audio/webm',
          sizeBytes: 4,
          durationSeconds: 2,
          clientRecordedAt: '2026-07-27T10:00:00.000Z',
          uploadedAt: '2026-07-27T10:01:00.000Z',
          selectedLocale: 'nl-NL',
          canPlayAudio: true,
          transcriptionStatus: 'PENDING',
          requestedLocale: 'NL_NL',
          effectiveDurationSeconds: 2,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await uploadRouteVoiceReport('route-1', {
      audio,
      stopId: 'stop-1',
      clientRecordedAt: '2026-07-27T10:00:00.000Z',
      durationSeconds: 2.1,
      selectedLocale: 'nl-NL',
      clientUploadId: 'upload-id-stable-01',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/delivery-routes/route-1/voice-reports',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
      }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer token-1')
    expect(headers.get('Content-Type')).toBeNull()
    const form = init.body as FormData
    expect(form.get('stopId')).toBe('stop-1')
    expect(form.get('clientRecordedAt')).toBe('2026-07-27T10:00:00.000Z')
    expect(form.get('durationSeconds')).toBe('2.1')
    expect(form.get('selectedLocale')).toBe('nl-NL')
    expect(form.get('clientUploadId')).toBe('upload-id-stable-01')
    const file = form.get('audio') as File
    expect(file).toBeTruthy()
    expect(file.type).toContain('webm')
  })

  it('retries bearer token once after 401 on upload', async () => {
    resolveAuthBearerToken
      .mockResolvedValueOnce('stale')
      .mockResolvedValueOnce('fresh')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'UNAUTHENTICATED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: 'r1',
            routeId: 'route-1',
            sequenceNumber: 1,
            status: 'AVAILABLE',
            mimeType: 'audio/webm',
            sizeBytes: 4,
            durationSeconds: 2,
            clientRecordedAt: '2026-07-27T10:00:00.000Z',
            uploadedAt: '2026-07-27T10:01:00.000Z',
            selectedLocale: null,
            canPlayAudio: true,
            transcriptionStatus: 'PENDING',
            requestedLocale: null,
            effectiveDurationSeconds: 2,
          }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await uploadRouteVoiceReport('route-1', {
      audio: new Blob(['x'], { type: 'audio/webm' }),
      stopId: 'stop-1',
      clientRecordedAt: '2026-07-27T10:00:00.000Z',
      durationSeconds: 2,
      selectedLocale: 'AUTO',
      clientUploadId: 'upload-id-stable-02',
    })

    expect(resolveAuthBearerToken).toHaveBeenCalledWith(false)
    expect(resolveAuthBearerToken).toHaveBeenCalledWith(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fetches audio with auth and rejects unsupported Content-Type', async () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name === 'Content-Type' ? 'audio/webm; codecs=opus' : null,
      },
      blob: () => Promise.resolve(blob),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRouteVoiceReportAudio('route-1', 'report-1')
    expect(result.contentType).toBe('audio/webm')
    expect(isAllowedPlaybackContentType('text/html')).toBe(false)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      blob: () => Promise.resolve(blob),
    })
    await expect(
      fetchRouteVoiceReportAudio('route-1', 'report-2'),
    ).rejects.toBeInstanceOf(RouteVoiceReportRestError)
  })

  it('retries transcription with authenticated POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          reportId: 'report-1',
          transcriptionStatus: 'PENDING',
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await retryRouteVoiceReportTranscription(
      'route-1',
      'report-1',
    )
    expect(result.transcriptionStatus).toBe('PENDING')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/delivery-routes/route-1/voice-reports/report-1/retry-transcription',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    )
  })

  it('exposes the 10 MiB client size constant', () => {
    expect(ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES).toBe(10 * 1024 * 1024)
  })
})

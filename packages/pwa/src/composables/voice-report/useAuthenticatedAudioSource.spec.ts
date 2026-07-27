/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchRouteVoiceReportAudio = vi.fn()

vi.mock('@/api/route-voice-report-rest', () => ({
  fetchRouteVoiceReportAudio: (...args: unknown[]) =>
    fetchRouteVoiceReportAudio(...args),
}))

vi.mock('@/api/route-voice-report-errors', () => ({
  RouteVoiceReportRestError: class RouteVoiceReportRestError extends Error {
    status: number
    code: string
    constructor(status: number, code: string) {
      super(code)
      this.status = status
      this.code = code
    }
  },
  mapRouteVoiceReportErrorCode: (code: string) => `mapped:${code}`,
}))

import { useAuthenticatedAudioSource } from '@/composables/voice-report/useAuthenticatedAudioSource'

describe('useAuthenticatedAudioSource', () => {
  let createSpy: ReturnType<typeof vi.fn>
  let revokeSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    createSpy = vi.fn(() => 'blob:audio-1')
    revokeSpy = vi.fn()
    URL.createObjectURL = createSpy
    URL.revokeObjectURL = revokeSpy
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a Blob URL after authenticated fetch and revokes on clear', async () => {
    fetchRouteVoiceReportAudio.mockResolvedValue({
      blob: new Blob(['a'], { type: 'audio/webm' }),
      contentType: 'audio/webm',
    })

    const source = useAuthenticatedAudioSource()
    const url = await source.load('route-1', 'report-1')
    expect(url).toBe('blob:audio-1')
    expect(source.loadedReportId.value).toBe('report-1')
    expect(createSpy).toHaveBeenCalled()

    source.clear()
    expect(revokeSpy).toHaveBeenCalledWith('blob:audio-1')
    expect(source.objectUrl.value).toBeNull()
  })

  it('revokes previous URL when loading another report', async () => {
    fetchRouteVoiceReportAudio.mockResolvedValue({
      blob: new Blob(['a'], { type: 'audio/webm' }),
      contentType: 'audio/webm',
    })
    createSpy
      .mockReturnValueOnce('blob:audio-1')
      .mockReturnValueOnce('blob:audio-2')

    const source = useAuthenticatedAudioSource()
    await source.load('route-1', 'report-1')
    await source.load('route-1', 'report-2')
    expect(revokeSpy).toHaveBeenCalledWith('blob:audio-1')
    expect(source.objectUrl.value).toBe('blob:audio-2')
  })

  it('maps playback errors safely', async () => {
    const { RouteVoiceReportRestError } =
      await import('@/api/route-voice-report-errors')
    fetchRouteVoiceReportAudio.mockRejectedValue(
      new RouteVoiceReportRestError(403, 'ROUTE_VOICE_REPORT_FORBIDDEN'),
    )

    const source = useAuthenticatedAudioSource()
    const url = await source.load('route-1', 'report-1')
    expect(url).toBeNull()
    expect(source.errorMessage.value).toBe(
      'mapped:ROUTE_VOICE_REPORT_FORBIDDEN',
    )
  })
})

/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  classifyMicrophoneError,
  defaultSelectedLocaleFromUi,
  errorKindToMessageKey,
  formatDurationSeconds,
  formatFileSizeBytes,
  generateClientUploadId,
  isMediaRecorderSupported,
  PREFERRED_RECORDER_MIME_TYPES,
  selectRecorderMimeType,
  stopMediaStreamTracks,
} from '@/composables/voice-report/voice-recorder-types'
import { useVoiceRecorder } from '@/composables/voice-report/useVoiceRecorder'

function createMockTrack() {
  return {
    stop: vi.fn(),
    onended: null as ((this: MediaStreamTrack, ev: Event) => void) | null,
  }
}

function createMockStream(tracks = [createMockTrack()]) {
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream
}

type RecorderHandlers = {
  ondataavailable: ((ev: BlobEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  onstop: ((ev: Event) => void) | null
}

function installMediaRecorderMock(options?: {
  supportedTypes?: string[]
  mimeType?: string
  pauseResume?: boolean
}) {
  const supported = new Set(
    options?.supportedTypes ?? ['audio/webm;codecs=opus', 'audio/webm'],
  )
  const instances: Array<{
    state: string
    mimeType: string
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    resume: ReturnType<typeof vi.fn>
    handlers: RecorderHandlers
  }> = []

  class MockMediaRecorder {
    state = 'inactive'
    mimeType: string
    ondataavailable: RecorderHandlers['ondataavailable'] = null
    onerror: RecorderHandlers['onerror'] = null
    onstop: RecorderHandlers['onstop'] = null
    start = vi.fn(() => {
      this.state = 'recording'
    })
    stop = vi.fn(() => {
      this.state = 'inactive'
      const chunk = new Blob(['audio-bytes'], { type: this.mimeType })
      this.ondataavailable?.({ data: chunk } as BlobEvent)
      this.onstop?.(new Event('stop'))
    })
    pause =
      options?.pauseResume === false
        ? undefined
        : vi.fn(() => {
            this.state = 'paused'
          })
    resume =
      options?.pauseResume === false
        ? undefined
        : vi.fn(() => {
            this.state = 'recording'
          })

    constructor(_stream: MediaStream, init?: { mimeType?: string }) {
      this.mimeType =
        options?.mimeType ?? init?.mimeType ?? 'audio/webm;codecs=opus'
      instances.push(this as never)
    }

    static isTypeSupported(type: string): boolean {
      return supported.has(type)
    }
  }

  vi.stubGlobal('MediaRecorder', MockMediaRecorder)
  return { instances, MockMediaRecorder }
}

describe('voice-recorder-types', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('detects MediaRecorder support', () => {
    installMediaRecorderMock()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    })
    expect(isMediaRecorderSupported()).toBe(true)
  })

  it('chooses WebM Opus first when supported', () => {
    expect(
      selectRecorderMimeType(type => type === 'audio/webm;codecs=opus'),
    ).toBe('audio/webm;codecs=opus')
  })

  it('falls back to Ogg then MP4 then WebM', () => {
    expect(
      selectRecorderMimeType(type => type === 'audio/ogg;codecs=opus'),
    ).toBe('audio/ogg;codecs=opus')
    expect(selectRecorderMimeType(type => type === 'audio/mp4')).toBe(
      'audio/mp4',
    )
    expect(selectRecorderMimeType(type => type === 'audio/webm')).toBe(
      'audio/webm',
    )
    expect(selectRecorderMimeType(() => false)).toBeNull()
  })

  it('prefers the documented MIME order', () => {
    expect(PREFERRED_RECORDER_MIME_TYPES[0]).toContain('webm')
    expect(PREFERRED_RECORDER_MIME_TYPES[1]).toContain('ogg')
    expect(PREFERRED_RECORDER_MIME_TYPES[2]).toContain('mp4')
  })

  it('maps microphone errors safely', () => {
    expect(classifyMicrophoneError({ name: 'NotAllowedError' })).toBe(
      'permission-denied',
    )
    expect(classifyMicrophoneError({ name: 'NotFoundError' })).toBe(
      'no-microphone',
    )
    expect(classifyMicrophoneError({ name: 'NotReadableError' })).toBe(
      'device-busy',
    )
    expect(errorKindToMessageKey('permission-denied')).toContain(
      'permissionDenied',
    )
  })

  it('defaults selected locale from UI locale', () => {
    expect(defaultSelectedLocaleFromUi('en')).toBe('en-GB')
    expect(defaultSelectedLocaleFromUi('nl')).toBe('nl-NL')
    expect(defaultSelectedLocaleFromUi('pl')).toBe('pl-PL')
    expect(defaultSelectedLocaleFromUi('es')).toBe('AUTO')
  })

  it('formats duration and size', () => {
    expect(formatDurationSeconds(65)).toBe('01:05')
    expect(formatFileSizeBytes(2048)).toContain('KiB')
  })

  it('generates client upload ids', () => {
    const id = generateClientUploadId()
    expect(id.length).toBeGreaterThanOrEqual(8)
  })

  it('stops all media stream tracks', () => {
    const track = createMockTrack()
    stopMediaStreamTracks(createMockStream([track]))
    expect(track.stop).toHaveBeenCalled()
  })
})

describe('useVoiceRecorder', () => {
  let revokeSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    })
    URL.createObjectURL = vi.fn(() => 'blob:preview-1')
    revokeSpy = vi.fn()
    URL.revokeObjectURL = revokeSpy
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('enters RECORDING after permission and requests audio-only stream', async () => {
    const { instances } = installMediaRecorderMock()
    const stream = createMockStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })

    const recorder = useVoiceRecorder()
    const ok = await recorder.startRecording()

    expect(ok).toBe(true)
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(recorder.state.value).toBe('RECORDING')
    expect(instances).toHaveLength(1)
    expect(recorder.clientRecordedAt.value).toBeTruthy()
    expect(recorder.clientUploadId.value).toBeTruthy()
  })

  it('maps permission denied', async () => {
    installMediaRecorderMock()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue({ name: 'NotAllowedError' }),
      },
    })

    const recorder = useVoiceRecorder()
    const ok = await recorder.startRecording()
    expect(ok).toBe(false)
    expect(recorder.state.value).toBe('ERROR')
    expect(recorder.error.value?.kind).toBe('permission-denied')
  })

  it('maps missing microphone device', async () => {
    installMediaRecorderMock()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue({ name: 'NotFoundError' }),
      },
    })

    const recorder = useVoiceRecorder()
    await recorder.startRecording()
    expect(recorder.error.value?.kind).toBe('no-microphone')
  })

  it('handles no MediaRecorder', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    })
    const recorder = useVoiceRecorder()
    expect(recorder.isSupported.value).toBe(false)
    const ok = await recorder.startRecording()
    expect(ok).toBe(false)
    expect(recorder.error.value?.kind).toBe('unsupported')
  })

  it('pause and resume update state and exclude paused time', async () => {
    installMediaRecorderMock({ pauseResume: true })
    const stream = createMockStream()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })

    const recorder = useVoiceRecorder()
    await recorder.startRecording()
    vi.advanceTimersByTime(2000)
    recorder.pauseRecording()
    expect(recorder.state.value).toBe('PAUSED')
    const elapsedAtPause = recorder.elapsedSeconds.value
    vi.advanceTimersByTime(5000)
    expect(recorder.elapsedSeconds.value).toBe(elapsedAtPause)
    recorder.resumeRecording()
    expect(recorder.state.value).toBe('RECORDING')
  })

  it('stop creates preview Blob and URL; cancel stops tracks', async () => {
    installMediaRecorderMock()
    const track = createMockTrack()
    const stream = createMockStream([track])
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })

    const recorder = useVoiceRecorder()
    await recorder.startRecording()
    vi.advanceTimersByTime(1500)
    const stopped = await recorder.stopRecording()
    expect(stopped).toBe(true)
    expect(recorder.state.value).toBe('PREVIEW')
    expect(recorder.previewBlob.value).toBeTruthy()
    expect(recorder.previewUrl.value).toBe('blob:preview-1')
    expect(track.stop).toHaveBeenCalled()

    recorder.discardPreview()
    expect(revokeSpy).toHaveBeenCalledWith('blob:preview-1')
    expect(recorder.state.value).toBe('IDLE')
  })

  it('rejects recordings below 1 second', async () => {
    installMediaRecorderMock()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(createMockStream()),
      },
    })

    const recorder = useVoiceRecorder()
    await recorder.startRecording()
    vi.advanceTimersByTime(200)
    const stopped = await recorder.stopRecording()
    expect(stopped).toBe(false)
    expect(recorder.error.value?.kind).toBe('too-short')
  })

  it('keeps clientUploadId stable until discard / upload', async () => {
    installMediaRecorderMock()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(createMockStream()),
      },
    })

    const recorder = useVoiceRecorder()
    await recorder.startRecording()
    const firstId = recorder.clientUploadId.value
    vi.advanceTimersByTime(1500)
    await recorder.stopRecording()
    expect(recorder.ensureClientUploadId()).toBe(firstId)
    recorder.markUploading()
    recorder.markUploadFailed()
    expect(recorder.ensureClientUploadId()).toBe(firstId)
    recorder.discardPreview()

    await recorder.startRecording()
    expect(recorder.clientUploadId.value).not.toBe(firstId)
  })

  it('auto-stops at 180 seconds and warns near limit', async () => {
    installMediaRecorderMock()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(createMockStream()),
      },
    })

    const recorder = useVoiceRecorder()
    await recorder.startRecording()
    vi.advanceTimersByTime(150_000)
    expect(recorder.nearLimit.value).toBe(true)
    vi.advanceTimersByTime(30_000)
    await vi.runAllTimersAsync()
    expect(recorder.maxDurationReached.value).toBe(true)
    expect(recorder.state.value).toBe('PREVIEW')
  })
})

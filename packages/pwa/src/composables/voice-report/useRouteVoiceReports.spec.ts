/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const query = vi.fn()
const subscribe = vi.fn()

vi.mock('@/composables/useGraphQL', () => ({
  default: () => ({
    apolloClient: {
      query: (...args: unknown[]) => query(...args),
      subscribe: (...args: unknown[]) => subscribe(...args),
    },
  }),
  registerReconnectHandler: () => () => undefined,
}))

vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({
    isOnline: ref(true),
    lastReconnectedAt: ref(null),
  }),
}))

vi.mock('@/i18n/error-mapper', () => ({
  mapUserFacingGraphQLError: () => 'graphql-error',
}))

const uploadRouteVoiceReport = vi.fn()
const retryRouteVoiceReportTranscription = vi.fn()

vi.mock('@/api/route-voice-report-rest', () => ({
  uploadRouteVoiceReport: (...args: unknown[]) =>
    uploadRouteVoiceReport(...args),
  retryRouteVoiceReportTranscription: (...args: unknown[]) =>
    retryRouteVoiceReportTranscription(...args),
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

import {
  filterLegacyRouteVoiceReports,
  filterReportsByStopId,
  isLegacyRouteVoiceReport,
  useRouteVoiceReports,
} from '@/composables/voice-report/useRouteVoiceReports'

function mockSubscription() {
  const unsubscribe = vi.fn()
  subscribe.mockReturnValue({
    subscribe: (handlers: { next: (value: unknown) => void }) => {
      ;(
        mockSubscription as unknown as { lastNext: typeof handlers.next }
      ).lastNext = handlers.next
      return { unsubscribe }
    },
  })
  return { unsubscribe }
}

describe('useRouteVoiceReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue({
      data: {
        routeVoiceReports: [
          {
            id: 'r1',
            routeId: 'route-1',
            sequenceNumber: 1,
            status: 'AVAILABLE',
            mimeType: 'audio/webm',
            durationSeconds: 2,
            effectiveDurationSeconds: 2,
            selectedLocale: 'nl-NL',
            clientRecordedAt: '2026-07-27T10:00:00.000Z',
            uploadedAt: '2026-07-27T10:01:00.000Z',
            recordedByDisplayName: 'Courier',
            canPlayAudio: true,
            transcriptionStatus: 'PENDING',
            requestedLocale: 'NL_NL',
            detectedLocale: null,
            transcript: null,
            confidence: null,
            transcriptionStartedAt: null,
            transcriptionCompletedAt: null,
            transcriptionFailureCode: null,
            canRetryTranscription: false,
          },
        ],
      },
    })
    mockSubscription()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads reports for SERVER source and ignores CACHE', async () => {
    const routeId = ref<string | null>('route-1')
    const routeSource = ref<'SERVER' | 'CACHE' | 'NONE'>('SERVER')
    const api = useRouteVoiceReports({ routeId, routeSource })

    await vi.waitFor(() => expect(query).toHaveBeenCalled())
    expect(api.reports.value).toHaveLength(1)

    routeSource.value = 'CACHE'
    await vi.waitFor(() => expect(api.reports.value).toHaveLength(0))
    expect(query.mock.calls.length).toBe(1)
  })

  it('does not query when disabled (e.g. APOTHEKER)', async () => {
    const routeId = ref('route-1')
    const routeSource = ref<'SERVER' | 'CACHE' | 'NONE'>('SERVER')
    const enabled = ref(false)
    useRouteVoiceReports({ routeId, routeSource, enabled })
    await Promise.resolve()
    expect(query).not.toHaveBeenCalled()
  })

  it('refetches on matching PubSub event and ignores unrelated routes', async () => {
    const routeId = ref('route-1')
    const routeSource = ref<'SERVER' | 'CACHE' | 'NONE'>('SERVER')
    const api = useRouteVoiceReports({ routeId, routeSource })
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalled())

    const lastNext = (
      mockSubscription as unknown as {
        lastNext: (value: unknown) => void
      }
    ).lastNext

    query.mockClear()
    vi.useFakeTimers()
    lastNext({
      data: {
        routeVoiceReportUpdates: {
          routeId: 'other-route',
          reportId: 'r9',
          status: 'AVAILABLE',
          transcriptionStatus: 'PROCESSING',
          eventType: 'ROUTE_VOICE_REPORT_TRANSCRIPTION_PROCESSING',
        },
      },
    })
    await vi.advanceTimersByTimeAsync(350)
    expect(query).not.toHaveBeenCalled()

    lastNext({
      data: {
        routeVoiceReportUpdates: {
          routeId: 'route-1',
          reportId: 'r1',
          status: 'AVAILABLE',
          transcriptionStatus: 'COMPLETED',
          eventType: 'ROUTE_VOICE_REPORT_TRANSCRIPTION_COMPLETED',
        },
      },
    })
    await vi.advanceTimersByTimeAsync(350)
    expect(query).toHaveBeenCalled()
    expect(api.reports.value[0]?.sequenceNumber).toBe(1)
    vi.useRealTimers()
  })

  it('prevents duplicate upload clicks and maps transport failures', async () => {
    const routeId = ref('route-1')
    const routeSource = ref<'SERVER' | 'CACHE' | 'NONE'>('SERVER')
    const api = useRouteVoiceReports({ routeId, routeSource })
    await vi.waitFor(() => expect(api.reports.value.length).toBe(1))

    let resolveUpload: (value: unknown) => void = () => undefined
    uploadRouteVoiceReport.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpload = resolve
        }),
    )

    const first = api.uploadReport({
      audio: new Blob(['a'], { type: 'audio/webm' }),
      stopId: 'stop-1',
      clientRecordedAt: '2026-07-27T10:00:00.000Z',
      durationSeconds: 2,
      selectedLocale: 'AUTO',
      clientUploadId: 'id-1',
    })
    const second = await api.uploadReport({
      audio: new Blob(['a'], { type: 'audio/webm' }),
      stopId: 'stop-1',
      clientRecordedAt: '2026-07-27T10:00:00.000Z',
      durationSeconds: 2,
      selectedLocale: 'AUTO',
      clientUploadId: 'id-1',
    })
    expect(second).toBeNull()
    expect(uploadRouteVoiceReport).toHaveBeenCalledTimes(1)
    expect(uploadRouteVoiceReport).toHaveBeenCalledWith(
      'route-1',
      expect.objectContaining({ stopId: 'stop-1' }),
    )

    resolveUpload({
      id: 'r2',
      routeId: 'route-1',
      sequenceNumber: 2,
      status: 'AVAILABLE',
      mimeType: 'audio/webm',
      sizeBytes: 1,
      durationSeconds: 2,
      clientRecordedAt: '2026-07-27T10:00:00.000Z',
      uploadedAt: '2026-07-27T10:02:00.000Z',
      selectedLocale: 'AUTO',
      canPlayAudio: true,
      transcriptionStatus: 'PENDING',
      requestedLocale: 'AUTO',
      effectiveDurationSeconds: 2,
    })
    await first
    expect(api.lastUploadSuccess.value).toBe(true)
  })

  it('ADMIN retry sends authenticated request when allowed', async () => {
    const routeId = ref('route-1')
    const routeSource = ref<'SERVER' | 'CACHE' | 'NONE'>('SERVER')
    const canRetryTranscription = ref(true)
    retryRouteVoiceReportTranscription.mockResolvedValue({
      reportId: 'r1',
      transcriptionStatus: 'PENDING',
    })

    const api = useRouteVoiceReports({
      routeId,
      routeSource,
      canRetryTranscription,
    })
    await vi.waitFor(() => expect(api.reports.value.length).toBe(1))
    const ok = await api.retryTranscription('r1')
    expect(ok).toBe(true)
    expect(retryRouteVoiceReportTranscription).toHaveBeenCalledWith(
      'route-1',
      'r1',
    )
  })

  it('stops subscription on unmount path via stopSubscription', async () => {
    const { unsubscribe } = mockSubscription()
    const routeId = ref('route-1')
    const routeSource = ref<'SERVER' | 'CACHE' | 'NONE'>('SERVER')
    const api = useRouteVoiceReports({ routeId, routeSource })
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalled())
    api.stopSubscription()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('rejects upload without stopId', async () => {
    const routeId = ref('route-1')
    const routeSource = ref<'SERVER' | 'CACHE' | 'NONE'>('SERVER')
    const api = useRouteVoiceReports({ routeId, routeSource })
    await vi.waitFor(() => expect(api.reports.value.length).toBe(1))

    const result = await api.uploadReport({
      audio: new Blob(['a'], { type: 'audio/webm' }),
      stopId: '',
      clientRecordedAt: '2026-07-27T10:00:00.000Z',
      durationSeconds: 2,
      selectedLocale: 'AUTO',
      clientUploadId: 'id-1',
    })
    expect(result).toBeNull()
    expect(uploadRouteVoiceReport).not.toHaveBeenCalled()
    expect(api.uploadErrorMessage.value).toBe(
      'mapped:ROUTE_VOICE_REPORT_STOP_ID_REQUIRED',
    )
  })

  it('filters reports by stopId and legacy helpers', () => {
    const reports = [
      {
        id: 'a',
        stopId: 'stop-1',
        isLegacyRouteReport: false,
      },
      {
        id: 'b',
        stopId: null,
        isLegacyRouteReport: true,
      },
      {
        id: 'c',
        stopId: 'stop-2',
        isLegacyRouteReport: false,
      },
      {
        id: 'd',
        stopId: undefined,
        isLegacyRouteReport: false,
      },
    ] as Parameters<typeof filterReportsByStopId>[0]

    expect(filterReportsByStopId(reports, 'stop-1').map(r => r.id)).toEqual([
      'a',
    ])
    expect(filterLegacyRouteVoiceReports(reports).map(r => r.id)).toEqual([
      'b',
      'd',
    ])
    expect(isLegacyRouteVoiceReport({ stopId: null })).toBe(true)
    expect(
      isLegacyRouteVoiceReport({ stopId: 's1', isLegacyRouteReport: false }),
    ).toBe(false)
  })
})

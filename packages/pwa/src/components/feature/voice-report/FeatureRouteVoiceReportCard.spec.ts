/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

import FeatureRouteVoiceReportCard from '@/components/feature/voice-report/FeatureRouteVoiceReportCard.vue'
import type { RouteVoiceReportItem } from '@/composables/voice-report/useRouteVoiceReports'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

vi.mock('@/composables/voice-report/useAuthenticatedAudioSource', () => ({
  useAuthenticatedAudioSource: () => ({
    objectUrl: ref(null),
    loading: ref(false),
    errorMessage: ref(null),
    load: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('@/api/route-voice-report-errors', () => ({
  mapTranscriptionFailureCode: () => 'Mapped failure',
}))

const uiStubs = {
  UButton: {
    props: ['loading', 'disabled', 'size', 'color', 'variant'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" :aria-label="$attrs[\'aria-label\']" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
  },
  UAlert: {
    props: ['title', 'description', 'color'],
    template:
      '<div :data-testid="$attrs[\'data-testid\']"><p>{{ title }}</p><p>{{ description }}</p></div>',
  },
  UBadge: {
    props: ['color', 'variant'],
    template: '<span :data-testid="$attrs[\'data-testid\']"><slot /></span>',
  },
}

type TestReportOverrides = Omit<
  Partial<RouteVoiceReportItem>,
  'transcriptionStatus'
> & {
  transcriptionStatus?: string | null
}

function baseReport(
  overrides: TestReportOverrides = {},
): RouteVoiceReportItem {
  return {
    id: 'rep-1',
    routeId: 'route-1',
    sequenceNumber: 1,
    status: 'AVAILABLE',
    mimeType: 'audio/webm',
    clientRecordedAt: '2026-07-28T10:00:00.000Z',
    uploadedAt: '2026-07-28T10:01:00.000Z',
    effectiveDurationSeconds: 15,
    durationSeconds: 15,
    selectedLocale: 'AUTO',
    requestedLocale: 'AUTO',
    detectedLocale: null,
    transcriptionStatus: 'PENDING',
    transcript: null,
    confidence: null,
    transcriptionStartedAt: null,
    transcriptionCompletedAt: null,
    transcriptionFailureCode: null,
    canRetryTranscription: false,
    canPlayAudio: true,
    recordedByDisplayName: 'Courier One',
    ...overrides,
  } as RouteVoiceReportItem
}

function mountCard(
  report: RouteVoiceReportItem,
  opts: { canRetryTranscription?: boolean; showCourierName?: boolean } = {},
) {
  return mount(FeatureRouteVoiceReportCard, {
    props: {
      report,
      routeId: 'route-1',
      showCourierName: opts.showCourierName === true,
      canRetryTranscription: opts.canRetryTranscription === true,
      retrying: false,
    },
    global: {
      plugins: [createTestI18n('en')],
      stubs: uiStubs,
    },
  })
}

describe('FeatureRouteVoiceReportCard', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('shows queued transcription state for PENDING', () => {
    const wrapper = mountCard(baseReport({ transcriptionStatus: 'PENDING' }))
    expect(
      wrapper.find('[data-testid="route-voice-transcription-badge"]').text(),
    ).toBe(translate('routeVoiceReports.transcription.pending'))
    expect(wrapper.find('[data-testid="route-voice-transcription"]').text()).toContain(
      translate('routeVoiceReports.transcription.pending'),
    )
  })

  it('shows processing transcription state', () => {
    const wrapper = mountCard(
      baseReport({ transcriptionStatus: 'PROCESSING' }),
    )
    expect(
      wrapper.find('[data-testid="route-voice-transcription-badge"]').text(),
    ).toBe(translate('routeVoiceReports.transcription.processing'))
  })

  it('shows completed transcript and playback affordance', () => {
    const wrapper = mountCard(
      baseReport({
        transcriptionStatus: 'COMPLETED',
        transcript: 'Delay at stop 2',
        confidence: 0.91,
        detectedLocale: 'nl-NL',
        transcriptionCompletedAt: '2026-07-28T10:02:00.000Z',
      }),
    )
    expect(
      wrapper.find('[data-testid="route-voice-transcription-badge"]').text(),
    ).toBe(translate('routeVoiceReports.transcription.completed'))
    expect(
      wrapper.find('[data-testid="route-voice-transcript-text"]').text(),
    ).toBe('Delay at stop 2')
    expect(wrapper.find('[data-testid="route-voice-playback"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="route-voice-load-recording"]').attributes(
        'aria-label',
      ),
    ).toBe(
      translate('routeVoiceReports.playback.loadAria', { number: 1 }),
    )
  })

  it('shows failed transcription without courier retry by default', () => {
    const wrapper = mountCard(
      baseReport({
        transcriptionStatus: 'FAILED',
        canRetryTranscription: true,
        transcriptionFailureCode: 'PROVIDER_ERROR',
      }),
      { canRetryTranscription: false },
    )
    expect(
      wrapper.find('[data-testid="route-voice-transcription-failed"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="route-voice-retry-transcription"]').exists(),
    ).toBe(false)
  })

  it('shows retry only when admin retry is allowed and status is FAILED', () => {
    const wrapper = mountCard(
      baseReport({
        transcriptionStatus: 'FAILED',
        canRetryTranscription: true,
      }),
      { canRetryTranscription: true },
    )
    const retry = wrapper.find('[data-testid="route-voice-retry-transcription"]')
    expect(retry.exists()).toBe(true)
    expect(retry.attributes('aria-label')).toBe(
      translate('routeVoiceReports.transcription.retryAria', { number: 1 }),
    )
  })

  it('does not show retry for completed reports even for admin', () => {
    const wrapper = mountCard(
      baseReport({
        transcriptionStatus: 'COMPLETED',
        canRetryTranscription: true,
        transcript: 'ok',
      }),
      { canRetryTranscription: true },
    )
    expect(
      wrapper.find('[data-testid="route-voice-retry-transcription"]').exists(),
    ).toBe(false)
  })
})

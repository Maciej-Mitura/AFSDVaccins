/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import FeatureRouteVoiceReportList from '@/components/feature/voice-report/FeatureRouteVoiceReportList.vue'
import type { RouteVoiceReportItem } from '@/composables/voice-report/useRouteVoiceReports'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

function baseReport(
  overrides: Partial<RouteVoiceReportItem> = {},
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
    transcriptionStatus: 'COMPLETED',
    transcript: 'ok',
    confidence: 0.9,
    transcriptionStartedAt: null,
    transcriptionCompletedAt: '2026-07-28T10:02:00.000Z',
    transcriptionFailureCode: null,
    canRetryTranscription: false,
    canPlayAudio: true,
    recordedByDisplayName: 'Courier One',
    stopId: 'stop-1',
    stopSequence: 1,
    pharmacyDisplayName: 'Apotheek Centrum',
    isLegacyRouteReport: false,
    ...overrides,
  } as RouteVoiceReportItem
}

describe('FeatureRouteVoiceReportList Phase 36E grouping', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('groups stop reports separately and keeps legacy in its own section', () => {
    const wrapper = mount(FeatureRouteVoiceReportList, {
      props: {
        reports: [
          baseReport({
            id: 'stop-a',
            stopId: 'stop-1',
            stopSequence: 1,
            pharmacyDisplayName: 'Apotheek Centrum',
          }),
          baseReport({
            id: 'stop-b',
            stopId: 'stop-2',
            stopSequence: 2,
            pharmacyDisplayName: 'Apotheek Noord',
            sequenceNumber: 2,
          }),
          baseReport({
            id: 'legacy-1',
            stopId: null,
            stopSequence: null,
            pharmacyDisplayName: null,
            isLegacyRouteReport: true,
            sequenceNumber: 3,
          }),
        ],
        loading: false,
        errorMessage: null,
        routeId: 'route-1',
        showCourierName: true,
        canRetryTranscription: true,
        retryingReportId: null,
        retryErrorMessage: null,
        showStopContext: true,
        groupByStop: true,
      },
      global: {
        plugins: [createTestI18n('en')],
        stubs: {
          FeatureRouteVoiceReportCard: {
            props: ['report'],
            template:
              '<div data-testid="route-voice-report-card-stub" :data-report-id="report.id" :data-stop-id="report.stopId ?? \'\'" />',
          },
          CommonEmptyState: true,
          CommonErrorState: true,
          CommonLoadingSkeleton: true,
        },
      },
    })

    expect(
      wrapper.find('[data-testid="route-voice-report-group-legacy"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="route-voice-report-group-legacy"]').text(),
    ).toContain(translate('routeVoiceReports.stop.legacyTitle'))

    const cards = wrapper.findAll(
      '[data-testid="route-voice-report-card-stub"]',
    )
    expect(cards).toHaveLength(3)
    expect(cards[0].attributes('data-report-id')).toBe('stop-a')
    expect(cards[0].attributes('data-stop-id')).toBe('stop-1')
    expect(cards[1].attributes('data-report-id')).toBe('stop-b')
    expect(cards[1].attributes('data-stop-id')).toBe('stop-2')
    expect(cards[2].attributes('data-report-id')).toBe('legacy-1')
    expect(cards[2].attributes('data-stop-id')).toBe('')

    // Legacy must not appear under a stop group key.
    expect(
      wrapper
        .find('[data-testid="route-voice-report-group-legacy"]')
        .find('[data-report-id="legacy-1"]')
        .exists(),
    ).toBe(true)
    expect(
      wrapper
        .find('[data-testid="route-voice-report-group-legacy"]')
        .find('[data-report-id="stop-a"]')
        .exists(),
    ).toBe(false)
  })
})

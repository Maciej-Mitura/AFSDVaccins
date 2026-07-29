/**
 * @vitest-environment happy-dom
 *
 * Phase 36E smoke: stop-scoped voice report UI mounts with mocked APIs
 * (no physical microphone).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'

import FeatureRouteVoiceRecorder from '@/components/feature/voice-report/FeatureRouteVoiceRecorder.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import { __resetVoiceRecorderMutexForTests } from '@/composables/voice-report/voice-recorder-mutex'

vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({
    isOnline: ref(true),
    lastReconnectedAt: ref(null),
  }),
}))

vi.mock('@/composables/voice-report/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    state: ref('IDLE'),
    isSupported: computed(() => true),
    supportsPauseResume: computed(() => true),
    elapsedSeconds: ref(0),
    remainingSeconds: computed(() => 180),
    nearLimit: computed(() => false),
    maxDurationReached: ref(false),
    previewUrl: ref(null),
    previewBlob: ref(null),
    previewMimeType: ref(null),
    previewSizeBytes: computed(() => 0),
    clientRecordedAt: ref(null),
    clientUploadId: ref(null),
    durationSeconds: ref(0),
    error: ref(null),
    hasUnsentRecording: computed(() => false),
    startRecording: vi.fn(() => Promise.resolve(true)),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    discardPreview: vi.fn(),
    markUploading: vi.fn(),
    markUploaded: vi.fn(),
    markUploadFailed: vi.fn(),
    reset: vi.fn(),
    ensureClientUploadId: () => 'upload-smoke',
  }),
}))

vi.mock('@/composables/voice-report/useRouteVoiceReports', async () => {
  const actual = await vi.importActual<
    typeof import('@/composables/voice-report/useRouteVoiceReports')
  >('@/composables/voice-report/useRouteVoiceReports')
  return {
    ...actual,
    useRouteVoiceReports: () => ({
      reports: ref([]),
      loading: ref(false),
      errorMessage: ref(null),
      uploading: ref(false),
      uploadErrorMessage: ref(null),
      retryingReportId: ref(null),
      retryErrorMessage: ref(null),
      lastUploadSuccess: ref(false),
      uploadReport: vi.fn(),
      retryTranscription: vi.fn(),
      clearUploadFeedback: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useLanguage', () => ({
  useLanguage: () => ({ currentLocale: ref('en') }),
}))

vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    onBeforeRouteLeave: vi.fn(),
  }
})

describe('phase36e stop voice reports smoke', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    __resetVoiceRecorderMutexForTests()
  })

  afterEach(() => {
    __resetVoiceRecorderMutexForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('mounts stop-scoped recorder UI without real media devices', async () => {
    const wrapper = mount(FeatureRouteVoiceRecorder, {
      props: {
        routeId: 'route-1',
        routeStatus: 'IN_PROGRESS',
        routeSource: 'SERVER',
        allowRecording: true,
        mode: 'stop',
        stopId: 'stop-1',
        stopSequence: 1,
        pharmacyName: 'Apotheek Smoke',
      },
      global: {
        plugins: [createTestI18n('en')],
        stubs: {
          UButton: {
            template:
              '<button type="button" :data-testid="$attrs[\'data-testid\']"><slot /></button>',
          },
          UAlert: { template: '<div><slot /></div>' },
          UFormField: { template: '<div><slot /></div>' },
          USelect: { template: '<select />' },
          FeatureRouteVoiceReportList: {
            template: '<div data-testid="route-voice-report-list-stub" />',
          },
        },
      },
    })
    await nextTick()
    expect(
      wrapper.find('[data-testid="route-voice-reports-section"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="route-voice-start"]').text()).toContain(
      translate('routeVoiceReports.stop.record'),
    )
    expect(
      wrapper.find('[data-testid="route-voice-stop-context"]').text(),
    ).toContain('Apotheek Smoke')
  })
})

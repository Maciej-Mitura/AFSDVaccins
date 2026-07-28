/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'

import FeatureRouteVoiceRecorder from '@/components/feature/voice-report/FeatureRouteVoiceRecorder.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const isOnline = ref(true)

vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({
    isOnline,
    lastReconnectedAt: ref(null),
  }),
}))

const recorderState = ref('IDLE')
const recorderError = ref<{ messageKey: string } | null>(null)
const isSupported = ref(true)
const previewUrl = ref<string | null>(null)
const previewBlob = ref<Blob | null>(null)
const hasUnsentRecording = ref(false)

const startRecording = vi.fn()
const stopRecording = vi.fn()
const cancelRecording = vi.fn()
const discardPreview = vi.fn()
const resetRecorder = vi.fn()

vi.mock('@/composables/voice-report/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    state: recorderState,
    isSupported: computed(() => isSupported.value),
    supportsPauseResume: computed(() => true),
    elapsedSeconds: ref(12),
    remainingSeconds: computed(() => 288),
    nearLimit: computed(() => false),
    maxDurationReached: ref(false),
    previewUrl,
    previewBlob,
    previewMimeType: ref('audio/webm'),
    previewSizeBytes: computed(() => 2048),
    clientRecordedAt: ref('2026-07-28T10:00:00.000Z'),
    clientUploadId: ref(null),
    durationSeconds: ref(12),
    error: recorderError,
    hasUnsentRecording: computed(() => hasUnsentRecording.value),
    startRecording,
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording,
    cancelRecording,
    discardPreview,
    markUploading: vi.fn(),
    markUploaded: vi.fn(),
    markUploadFailed: vi.fn(),
    reset: resetRecorder,
    ensureClientUploadId: () => 'upload-1',
  }),
}))

const reports = ref<unknown[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const uploading = ref(false)
const uploadErrorMessage = ref<string | null>(null)
const retryingReportId = ref<string | null>(null)
const retryErrorMessage = ref<string | null>(null)
const lastUploadSuccess = ref(false)
const uploadReport = vi.fn()
const retryTranscription = vi.fn()
const clearUploadFeedback = vi.fn()

vi.mock('@/composables/voice-report/useRouteVoiceReports', () => ({
  useRouteVoiceReports: () => ({
    reports,
    loading,
    errorMessage,
    uploading,
    uploadErrorMessage,
    retryingReportId,
    retryErrorMessage,
    lastUploadSuccess,
    uploadReport,
    retryTranscription,
    clearUploadFeedback,
  }),
}))

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

const uiStubs = {
  UButton: {
    props: [
      'loading',
      'disabled',
      'block',
      'size',
      'color',
      'variant',
      'title',
    ],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" :aria-label="$attrs[\'aria-label\']" :aria-disabled="$attrs[\'aria-disabled\']" :data-testid="$attrs[\'data-testid\']" :title="title" @click="$emit(\'click\')"><slot /></button>',
  },
  UAlert: {
    props: ['title', 'description', 'color'],
    template:
      '<div :data-testid="$attrs[\'data-testid\']" role="status"><p>{{ title }}</p><p>{{ description }}</p></div>',
  },
  UFormField: {
    props: ['label', 'name'],
    template: '<div><label>{{ label }}</label><slot /></div>',
  },
  USelect: {
    props: ['modelValue', 'items', 'disabled'],
    template: '<select :data-testid="$attrs[\'data-testid\']" />',
  },
  FeatureRouteVoiceReportList: {
    props: [
      'reports',
      'loading',
      'errorMessage',
      'routeId',
      'showCourierName',
      'canRetryTranscription',
      'retryingReportId',
      'retryErrorMessage',
    ],
    template:
      '<div data-testid="route-voice-report-list-stub" :data-can-retry="String(canRetryTranscription)" :data-report-count="reports.length" />',
  },
}

function mountRecorder(
  props: Partial<InstanceType<typeof FeatureRouteVoiceRecorder>['$props']> = {},
) {
  return mount(FeatureRouteVoiceRecorder, {
    props: {
      routeId: 'route-1',
      routeStatus: 'IN_PROGRESS',
      routeSource: 'SERVER',
      allowRecording: true,
      showCourierName: false,
      canRetryTranscription: false,
      ...props,
    },
    global: {
      plugins: [createTestI18n('en')],
      stubs: uiStubs,
    },
  })
}

describe('FeatureRouteVoiceRecorder', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    isOnline.value = true

    recorderState.value = 'IDLE'
    recorderError.value = null
    isSupported.value = true
    previewUrl.value = null
    previewBlob.value = null
    hasUnsentRecording.value = false
    reports.value = []
    loading.value = false
    errorMessage.value = null
    uploading.value = false
    uploadErrorMessage.value = null
    retryingReportId.value = null
    retryErrorMessage.value = null
    lastUploadSuccess.value = false
    vi.clearAllMocks()
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('renders a clearly labelled Voice report section for active recording', () => {
    const wrapper = mountRecorder()
    const section = wrapper.find('[data-testid="route-voice-reports-section"]')
    expect(section.exists()).toBe(true)
    expect(section.classes()).not.toContain('hidden')
    expect(section.classes()).not.toContain('sr-only')
    expect(section.classes()).not.toContain('md:hidden')
    expect(section.text()).toContain(translate('routeVoiceReports.voiceReport'))
    expect(wrapper.find('[data-testid="route-voice-start"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="route-voice-start"]').attributes('aria-label'),
    ).toBe(translate('routeVoiceReports.recording.start'))
  })

  it('defaults enabled to true when the prop is omitted (Vue boolean cast)', () => {
    const wrapper = mount(FeatureRouteVoiceRecorder, {
      props: {
        routeId: 'route-1',
        routeStatus: 'IN_PROGRESS',
        routeSource: 'SERVER',
        allowRecording: true,
      },
      global: {
        plugins: [createTestI18n('en')],
        stubs: uiStubs,
      },
    })
    expect(
      wrapper.find('[data-testid="route-voice-reports-section"]').exists(),
    ).toBe(true)
  })

  it('hides the entire section when enabled is false', () => {
    const wrapper = mountRecorder({ enabled: false })
    expect(
      wrapper.find('[data-testid="route-voice-reports-section"]').exists(),
    ).toBe(false)
  })

  it('shows assigned hint and hides recorder when recording is not allowed', () => {
    const wrapper = mountRecorder({
      allowRecording: false,
      routeStatus: 'ASSIGNED',
    })
    expect(
      wrapper.find('[data-testid="route-voice-reports-assigned-hint"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="route-voice-recorder"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="route-voice-start"]').exists()).toBe(
      false,
    )
  })

  it('keeps section visible but without start controls for completed routes', () => {
    const wrapper = mountRecorder({
      allowRecording: false,
      routeStatus: 'COMPLETED',
    })
    expect(
      wrapper.find('[data-testid="route-voice-reports-section"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="route-voice-recorder"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.find('[data-testid="route-voice-reports-assigned-hint"]').exists(),
    ).toBe(false)
  })

  it('disables start and shows unsupported browser message when MediaRecorder is unavailable', async () => {
    isSupported.value = false
    const wrapper = mountRecorder()
    await nextTick()
    const start = wrapper.find('[data-testid="route-voice-start"]')
    expect(start.attributes('disabled')).toBeDefined()
    expect(
      wrapper.find('[data-testid="route-voice-recording-disabled"]').text(),
    ).toContain(translate('routeVoiceReports.recording.unsupportedBrowser'))
  })

  it('renders recording controls with text status (not colour alone)', async () => {
    recorderState.value = 'RECORDING'
    const wrapper = mountRecorder()
    await nextTick()
    expect(wrapper.find('[data-testid="route-voice-stop"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="route-voice-cancel"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="route-voice-recording-label"]').text(),
    ).toBe(translate('routeVoiceReports.recording.recording'))
    expect(
      wrapper
        .find('[data-testid="route-voice-recording-label"]')
        .attributes('role'),
    ).toBe('status')
    expect(
      wrapper
        .find('[data-testid="route-voice-live-status"]')
        .attributes('aria-live'),
    ).toBe('polite')
  })

  it('renders preview with play, discard, and upload actions', async () => {
    recorderState.value = 'PREVIEW'
    previewUrl.value = 'blob:preview'
    previewBlob.value = new Blob(['x'], { type: 'audio/webm' })
    const wrapper = mountRecorder()
    await nextTick()
    expect(wrapper.find('[data-testid="route-voice-preview"]').exists()).toBe(
      true,
    )
    expect(
      wrapper.find('[data-testid="route-voice-preview-audio"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="route-voice-upload"]').text()).toContain(
      translate('routeVoiceReports.upload.upload'),
    )
    expect(
      wrapper
        .find('[data-testid="route-voice-discard"]')
        .attributes('aria-label'),
    ).toBe(translate('routeVoiceReports.upload.discard'))
  })

  it('shows retry upload when upload failed', async () => {
    recorderState.value = 'PREVIEW'
    previewUrl.value = 'blob:preview'
    previewBlob.value = new Blob(['x'], { type: 'audio/webm' })
    uploadErrorMessage.value = 'Upload failed'
    const wrapper = mountRecorder()
    await nextTick()
    expect(wrapper.find('[data-testid="route-voice-upload"]').text()).toContain(
      translate('routeVoiceReports.upload.retry'),
    )
  })

  it('does not pass admin retry transcription to courier list', () => {
    const wrapper = mountRecorder({ canRetryTranscription: false })
    expect(
      wrapper
        .find('[data-testid="route-voice-report-list-stub"]')
        .attributes('data-can-retry'),
    ).toBe('false')
  })

  it('shows offline unavailable message without recorder list query UI path', () => {
    const wrapper = mountRecorder({ routeSource: 'CACHE' })
    expect(
      wrapper.find('[data-testid="route-voice-reports-offline"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-testid="route-voice-recorder"]').exists()).toBe(
      false,
    )
  })
})

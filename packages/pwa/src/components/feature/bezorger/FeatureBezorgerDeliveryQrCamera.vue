<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { QrcodeStream } from 'vue-qrcode-reader'

import {
  getDeliveryQrScannerProvider,
  stopMediaStreamTracks,
} from '@/composables/delivery-qr/delivery-qr-scanner-provider'
import {
  deliveryQrCameraErrorI18nKey,
  type DeliveryQrScanPhase,
  type DeliveryQrScanError,
} from '@/composables/delivery-qr/useDeliveryQrScanSession'
import { DELIVERY_QR_TOKEN_MAX_LENGTH } from '@/api/delivery-qr-rest'

const props = defineProps<{
  phase: DeliveryQrScanPhase
  error: DeliveryQrScanError | null
  cameraActive: boolean
}>()

const emit = defineEmits<{
  close: []
  'camera-preparing': []
  'camera-permission-requested': []
  'camera-started': []
  'camera-error': [error: unknown]
  detect: [rawValue: string]
  'manual-submit': [rawValue: string]
  retry: []
}>()

const { t } = useI18n()

const provider = getDeliveryQrScannerProvider()
const constraints = provider.getConstraints()
const paused = ref(false)
const manualOpen = ref(false)
const manualToken = ref('')
const scannerRoot = ref<HTMLElement | null>(null)
const streamRef = ref<MediaStream | null>(null)

const showCamera = computed(
  () =>
    props.phase === 'preparing' ||
    props.phase === 'requesting-permission' ||
    props.phase === 'scanning',
)

const statusText = computed(() => {
  switch (props.phase) {
    case 'preparing':
      return t('bezorger.route.qr.status.preparing')
    case 'requesting-permission':
      return t('bezorger.route.qr.status.requestingPermission')
    case 'scanning':
      return t('bezorger.route.qr.status.scanning')
    case 'decoded':
      return t('bezorger.route.qr.status.detected')
    case 'loading-preview':
      return t('bezorger.route.qr.status.loadingPreview')
    case 'offline':
      return t('bezorger.route.qr.offline')
    case 'recoverable-error':
    case 'fatal-error':
      if (props.error?.cameraKind) {
        return t(deliveryQrCameraErrorI18nKey(props.error.cameraKind))
      }
      return props.error?.message ?? t('errors.deliveryQr.generic')
    default:
      return t('bezorger.route.qr.status.preparing')
  }
})

const cameraErrorKey = computed(() =>
  props.error?.cameraKind
    ? deliveryQrCameraErrorI18nKey(props.error.cameraKind)
    : null,
)

function stopTrackedStream(): void {
  stopMediaStreamTracks(streamRef.value)
  streamRef.value = null

  const video = scannerRoot.value?.querySelector('video')
  if (video?.srcObject instanceof MediaStream) {
    stopMediaStreamTracks(video.srcObject)
    video.srcObject = null
  }
}

function onCameraOn(): void {
  const video = scannerRoot.value?.querySelector('video')
  if (video?.srcObject instanceof MediaStream) {
    streamRef.value = video.srcObject
  }
  emit('camera-started')
}

/** Test helper — record an active stream for cleanup assertions. */
function onCameraOnForTests(stream: MediaStream): void {
  streamRef.value = stream
  emit('camera-started')
}

function onDetect(detectedCodes: Array<{ rawValue?: string }>): void {
  if (paused.value) {
    return
  }

  const first = detectedCodes.find(
    code =>
      typeof code.rawValue === 'string' && code.rawValue.trim().length > 0,
  )
  if (!first?.rawValue) {
    return
  }

  paused.value = true
  stopTrackedStream()
  emit('detect', first.rawValue)
}

function onError(error: unknown): void {
  stopTrackedStream()
  emit('camera-error', error)
}

function onManualSubmit(): void {
  const value = manualToken.value
  manualToken.value = ''
  emit('manual-submit', value)
}

/** Test / integration helper — same path as the manual form submit. */
function submitDecodedToken(rawValue: string): void {
  emit('manual-submit', rawValue)
}

watch(
  () => props.phase,
  phase => {
    if (phase === 'preparing') {
      paused.value = false
      emit('camera-preparing')
      emit('camera-permission-requested')
    }
    if (
      phase === 'decoded' ||
      phase === 'loading-preview' ||
      phase === 'preview-ready' ||
      phase === 'confirming' ||
      phase === 'success' ||
      phase === 'closed' ||
      phase === 'offline' ||
      phase === 'recoverable-error' ||
      phase === 'fatal-error'
    ) {
      paused.value = true
      stopTrackedStream()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopTrackedStream()
})

defineExpose({
  stopTrackedStream,
  onCameraOn: onCameraOnForTests,
  submitDecodedToken,
})
</script>

<template>
  <div
    ref="scannerRoot"
    class="delivery-qr-scanner flex flex-col gap-3"
    data-testid="delivery-qr-scanner"
  >
    <p class="text-sm text-muted" data-testid="delivery-qr-camera-explanation">
      {{ t('bezorger.route.qr.camera.explanation') }}
    </p>

    <p
      class="text-sm font-medium"
      role="status"
      aria-live="polite"
      data-testid="delivery-qr-camera-status"
    >
      {{ statusText }}
    </p>

    <div
      v-if="showCamera"
      class="delivery-qr-scanner__viewport relative mx-auto w-full overflow-hidden rounded-lg bg-black"
      data-testid="delivery-qr-camera-viewport"
    >
      <QrcodeStream
        :constraints="constraints"
        :paused="paused"
        :formats="['qr_code']"
        class="delivery-qr-scanner__stream h-full w-full"
        @camera-on="onCameraOn"
        @detect="onDetect"
        @error="onError"
      >
        <div class="sr-only">
          {{ t('bezorger.route.qr.camera.previewDescription') }}
        </div>
      </QrcodeStream>
    </div>

    <UAlert
      v-if="phase === 'offline'"
      color="warning"
      variant="subtle"
      :title="t('bezorger.route.qr.offline')"
      data-testid="delivery-qr-offline"
    />

    <UAlert
      v-else-if="cameraErrorKey"
      color="error"
      variant="subtle"
      :title="t(cameraErrorKey)"
      data-testid="delivery-qr-camera-error"
    />

    <UAlert
      v-else-if="error?.message && !error.cameraKind"
      color="error"
      variant="subtle"
      :title="error.message"
      data-testid="delivery-qr-scan-error"
    />

    <div class="flex flex-col gap-2">
      <UButton
        v-if="
          phase === 'recoverable-error' ||
          phase === 'fatal-error' ||
          phase === 'offline'
        "
        block
        size="lg"
        class="min-h-12"
        data-testid="delivery-qr-retry"
        :disabled="phase === 'offline'"
        @click="emit('retry')"
      >
        {{ t('common.retry') }}
      </UButton>

      <UButton
        block
        size="lg"
        variant="ghost"
        class="min-h-12"
        data-testid="delivery-qr-close-scanner"
        @click="emit('close')"
      >
        {{ t('common.close') }}
      </UButton>
    </div>

    <details
      class="rounded-md bg-elevated/60 px-3 py-2 text-sm"
      data-testid="delivery-qr-manual-details"
      :open="manualOpen"
      @toggle="manualOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary class="cursor-pointer min-h-11 py-2 text-toned">
        {{ t('bezorger.route.qr.manual.toggle') }}
      </summary>
      <div class="mt-3 space-y-2">
        <label class="block text-sm" for="delivery-qr-manual-token">
          {{ t('bezorger.route.qr.manual.label') }}
        </label>
        <UInput
          id="delivery-qr-manual-token"
          v-model="manualToken"
          type="password"
          autocomplete="off"
          :maxlength="DELIVERY_QR_TOKEN_MAX_LENGTH"
          data-testid="delivery-qr-manual-input"
          :placeholder="t('bezorger.route.qr.manual.placeholder')"
        />
        <UButton
          block
          size="md"
          data-testid="delivery-qr-manual-submit"
          :disabled="!manualToken.trim()"
          @click="onManualSubmit"
        >
          {{ t('bezorger.route.qr.manual.submit') }}
        </UButton>
      </div>
    </details>
  </div>
</template>

<style scoped>
.delivery-qr-scanner__viewport {
  aspect-ratio: 3 / 4;
  max-height: min(55vh, 28rem);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

@media (min-width: 640px) {
  .delivery-qr-scanner__viewport {
    max-height: 22rem;
    aspect-ratio: 4 / 3;
  }
}

.delivery-qr-scanner__stream :deep(video) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>

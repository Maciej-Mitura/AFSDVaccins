<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave } from 'vue-router'

import FeatureBezorgerDeliveryQrCamera from '@/components/feature/bezorger/FeatureBezorgerDeliveryQrCamera.vue'
import FeatureBezorgerDeliveryQrPreviewModal from '@/components/feature/bezorger/FeatureBezorgerDeliveryQrPreviewModal.vue'
import { useDeliveryQrScanSession } from '@/composables/delivery-qr/useDeliveryQrScanSession'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const props = defineProps<{
  /** Authenticated courier with an IN_PROGRESS assigned route. */
  enabled: boolean
  /** Cached/offline read-only mode — never request camera. */
  readOnlyOffline?: boolean
  onRefreshRoute: () => Promise<void> | void
}>()

const { t } = useI18n()
const { isOnline } = useOnlineStatus()

const scanButtonRef = ref<{ $el?: HTMLElement } | null>(null)
const cameraRef = ref<{ stopTrackedStream?: () => void } | null>(null)

const isMutationAllowed = computed(
  () => props.enabled && isOnline.value && !props.readOnlyOffline,
)

const {
  phase,
  preview,
  confirmResult,
  error,
  awaitingFinalConfirm,
  cameraActive,
  openScanner,
  closeScanner,
  markOffline,
  markOnline,
  onCameraPreparing,
  onCameraPermissionRequested,
  onCameraStarted,
  onCameraError,
  onDecoded,
  submitManualToken,
  requestMarkDelivered,
  cancelFinalConfirm,
  confirmDelivery,
  checkConfirmationAgain,
  retryAfterError,
  acknowledgeSuccess,
  clearTransientToken,
} = useDeliveryQrScanSession({
  canOpen: () => isMutationAllowed.value,
  isOnline: () => isOnline.value && !props.readOnlyOffline,
  onRefreshRoute: () => props.onRefreshRoute(),
})

const scannerOpen = computed(() => phase.value !== 'closed')

const previewModalOpen = computed(
  () =>
    phase.value === 'preview-ready' ||
    phase.value === 'confirming' ||
    phase.value === 'success' ||
    (phase.value === 'recoverable-error' && preview.value !== null),
)

const showCameraPanel = computed(
  () =>
    scannerOpen.value && !previewModalOpen.value && phase.value !== 'success',
)

const canShowScanAction = computed(
  () => isMutationAllowed.value && phase.value === 'closed',
)

const scanDisabledReason = computed(() => {
  if (!props.enabled) {
    return null
  }
  if (props.readOnlyOffline || !isOnline.value) {
    return t('offline.action.requiresConnection')
  }
  return null
})

function focusScanButton(): void {
  const el = scanButtonRef.value?.$el
  if (el && typeof el.focus === 'function') {
    el.focus()
  }
}

function closeEverything(): void {
  cameraRef.value?.stopTrackedStream?.()
  closeScanner()
  focusScanButton()
}

watch(isOnline, online => {
  if (!online || props.readOnlyOffline) {
    cameraRef.value?.stopTrackedStream?.()
    markOffline()
  } else {
    markOnline()
  }
})

watch(
  () => props.readOnlyOffline,
  readOnly => {
    if (readOnly) {
      cameraRef.value?.stopTrackedStream?.()
      markOffline()
      if (scannerOpen.value) {
        closeEverything()
      }
    }
  },
)

watch(
  () => props.enabled,
  enabled => {
    if (!enabled && scannerOpen.value) {
      closeEverything()
    }
  },
)

onBeforeRouteLeave(() => {
  cameraRef.value?.stopTrackedStream?.()
  closeScanner()
})

onBeforeUnmount(() => {
  cameraRef.value?.stopTrackedStream?.()
  clearTransientToken()
  closeScanner()
})

async function onDetect(rawValue: string): Promise<void> {
  cameraRef.value?.stopTrackedStream?.()
  await onDecoded(rawValue)
}

async function onManualSubmit(rawValue: string): Promise<void> {
  cameraRef.value?.stopTrackedStream?.()
  await submitManualToken(rawValue)
}

function onAcknowledge(): void {
  acknowledgeSuccess()
  focusScanButton()
}

function onPreviewCancel(): void {
  closeScanner()
  focusScanButton()
}
</script>

<template>
  <div class="space-y-3" data-testid="delivery-qr-workflow">
    <p
      v-if="enabled && (readOnlyOffline || !isOnline)"
      class="text-sm text-warning"
      role="status"
      data-testid="delivery-qr-offline-hint"
    >
      {{ t('offline.action.requiresConnection') }}
    </p>

    <UButton
      v-if="enabled && !readOnlyOffline"
      ref="scanButtonRef"
      block
      size="xl"
      class="min-h-14 text-base"
      color="primary"
      variant="soft"
      data-testid="delivery-qr-scan-action"
      :disabled="!canShowScanAction"
      :aria-label="t('bezorger.route.qr.scan')"
      @click="openScanner()"
    >
      {{ t('bezorger.route.qr.scan') }}
    </UButton>

    <p
      v-if="scanDisabledReason && phase === 'closed'"
      class="text-xs text-muted"
    >
      {{ scanDisabledReason }}
    </p>

    <div
      v-if="showCameraPanel"
      class="rounded-md bg-muted p-3"
      data-testid="delivery-qr-scanner-panel"
    >
      <FeatureBezorgerDeliveryQrCamera
        ref="cameraRef"
        :phase="phase"
        :error="error"
        :camera-active="cameraActive"
        @close="closeEverything"
        @camera-preparing="onCameraPreparing()"
        @camera-permission-requested="onCameraPermissionRequested()"
        @camera-started="onCameraStarted()"
        @camera-error="onCameraError($event)"
        @detect="onDetect"
        @manual-submit="onManualSubmit"
        @retry="retryAfterError()"
      />
    </div>

    <FeatureBezorgerDeliveryQrPreviewModal
      :open="previewModalOpen"
      :preview="preview"
      :confirm-result="confirmResult"
      :error="error"
      :awaiting-final-confirm="awaitingFinalConfirm"
      :confirming="phase === 'confirming'"
      :success="phase === 'success'"
      @update:open="
        open => {
          if (!open) onPreviewCancel()
        }
      "
      @cancel="onPreviewCancel"
      @request-mark-delivered="requestMarkDelivered()"
      @cancel-final-confirm="cancelFinalConfirm()"
      @confirm="confirmDelivery()"
      @check-again="checkConfirmationAgain()"
      @acknowledge="onAcknowledge"
      @retry="confirmDelivery()"
    />
  </div>
</template>

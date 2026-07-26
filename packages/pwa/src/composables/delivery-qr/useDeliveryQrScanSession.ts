import { computed, ref, type Ref } from 'vue'

import {
  confirmDeliveryQr,
  normalizeDeliveryQrToken,
  previewDeliveryQr,
  type DeliveryQrConfirmResult,
  type DeliveryQrPreviewResult,
} from '@/api/delivery-qr-rest'
import {
  DeliveryQrRestError,
  isDeliveryQrConfirmationInProgress,
  isDeliveryQrIntegrityError,
  isDeliveryQrRouteClosedError,
  isDeliveryQrStaleTokenError,
  mapDeliveryQrRestError,
} from '@/api/delivery-qr-errors'
import {
  getDeliveryQrScannerProvider,
  type DeliveryQrCameraErrorKind,
} from '@/composables/delivery-qr/delivery-qr-scanner-provider'

/**
 * Explicit scanner workflow states — avoid multiple independent booleans.
 */
export type DeliveryQrScanPhase =
  | 'closed'
  | 'preparing'
  | 'requesting-permission'
  | 'scanning'
  | 'decoded'
  | 'loading-preview'
  | 'preview-ready'
  | 'confirming'
  | 'success'
  | 'recoverable-error'
  | 'fatal-error'
  | 'offline'

export type DeliveryQrScanError = {
  message: string
  code: string | null
  cameraKind: DeliveryQrCameraErrorKind | null
  /** When true, confirmation must not retry without a fresh scan. */
  blockConfirmRetry: boolean
  /** When true, show “Check again” for in-progress confirmation. */
  confirmationInProgress: boolean
  /** When true, refresh route and clear token. */
  refreshRoute: boolean
  /** When true, close confirmation actions. */
  closeConfirmation: boolean
}

export type DeliveryQrScanSession = {
  phase: Ref<DeliveryQrScanPhase>
  preview: Ref<DeliveryQrPreviewResult | null>
  confirmResult: Ref<DeliveryQrConfirmResult | null>
  error: Ref<DeliveryQrScanError | null>
  awaitingFinalConfirm: Ref<boolean>
  cameraActive: Ref<boolean>
  canOpenScanner: Readonly<Ref<boolean>>
  hasTransientToken: Readonly<Ref<boolean>>
  openScanner: () => void
  closeScanner: () => void
  markOffline: () => void
  markOnline: () => void
  onCameraPreparing: () => void
  onCameraPermissionRequested: () => void
  onCameraStarted: () => void
  onCameraError: (error: unknown) => void
  onDecoded: (rawValue: string) => Promise<void>
  submitManualToken: (rawValue: string) => Promise<void>
  requestMarkDelivered: () => void
  cancelFinalConfirm: () => void
  confirmDelivery: () => Promise<void>
  checkConfirmationAgain: () => Promise<void>
  retryAfterError: () => void
  acknowledgeSuccess: () => void
  clearTransientToken: () => void
  /** Test helper — never expose token outside the session. */
  __peekTransientTokenForTests: () => string | null
}

export type UseDeliveryQrScanSessionOptions = {
  /** Whether the courier may open the scanner (role + route + online). */
  canOpen: () => boolean
  isOnline: () => boolean
  /** Called after successful confirm or stale-token errors. */
  onRefreshRoute?: () => Promise<void> | void
}

function cameraErrorMessage(kind: DeliveryQrCameraErrorKind): string {
  switch (kind) {
    case 'permission-denied':
      return 'bezorger.route.qr.camera.permissionDenied'
    case 'no-camera':
      return 'bezorger.route.qr.camera.noCamera'
    case 'camera-in-use':
      return 'bezorger.route.qr.camera.inUse'
    case 'insecure-context':
      return 'bezorger.route.qr.camera.insecureContext'
    case 'unsupported':
      return 'bezorger.route.qr.camera.unsupported'
    case 'start-failed':
    default:
      return 'bezorger.route.qr.camera.startFailed'
  }
}

function mapRestFailure(error: unknown): DeliveryQrScanError {
  const code =
    error instanceof DeliveryQrRestError ? error.code : 'NETWORK_ERROR'

  return {
    message: mapDeliveryQrRestError(error),
    code,
    cameraKind: null,
    blockConfirmRetry: isDeliveryQrIntegrityError(code),
    confirmationInProgress: isDeliveryQrConfirmationInProgress(code),
    refreshRoute:
      isDeliveryQrStaleTokenError(code) || isDeliveryQrRouteClosedError(code),
    closeConfirmation: isDeliveryQrRouteClosedError(code),
  }
}

/**
 * Courier delivery QR scanner session (state-machine style).
 * Holds the decoded token only in transient memory — never storage / Apollo / URL.
 */
export function useDeliveryQrScanSession(
  options: UseDeliveryQrScanSessionOptions,
): DeliveryQrScanSession {
  const phase = ref<DeliveryQrScanPhase>('closed')
  const preview = ref<DeliveryQrPreviewResult | null>(null)
  const confirmResult = ref<DeliveryQrConfirmResult | null>(null)
  const error = ref<DeliveryQrScanError | null>(null)
  const awaitingFinalConfirm = ref(false)
  const cameraActive = ref(false)

  /** Transient only — cleared on close / success / stale errors / unmount. */
  let transientToken: string | null = null
  let previewInFlight = false
  let confirmInFlight = false
  let lastDecodedValue: string | null = null

  const canOpenScanner = computed(
    () => options.canOpen() && options.isOnline() && phase.value === 'closed',
  )

  const hasTransientToken = computed(() => transientToken !== null)

  function clearTransientToken(): void {
    transientToken = null
    lastDecodedValue = null
  }

  function resetWorkflow(next: DeliveryQrScanPhase = 'closed'): void {
    previewInFlight = false
    confirmInFlight = false
    awaitingFinalConfirm.value = false
    cameraActive.value = false
    preview.value = null
    confirmResult.value = null
    error.value = null
    clearTransientToken()
    phase.value = next
  }

  function openScanner(): void {
    if (!options.canOpen()) {
      return
    }

    if (!options.isOnline()) {
      phase.value = 'offline'
      error.value = {
        message: '',
        code: 'OFFLINE',
        cameraKind: null,
        blockConfirmRetry: false,
        confirmationInProgress: false,
        refreshRoute: false,
        closeConfirmation: false,
      }
      return
    }

    const provider = getDeliveryQrScannerProvider()
    if (!provider.isSupported()) {
      phase.value = 'fatal-error'
      error.value = {
        message: '',
        code: null,
        cameraKind: 'unsupported',
        blockConfirmRetry: false,
        confirmationInProgress: false,
        refreshRoute: false,
        closeConfirmation: false,
      }
      return
    }

    clearTransientToken()
    preview.value = null
    confirmResult.value = null
    error.value = null
    awaitingFinalConfirm.value = false
    previewInFlight = false
    confirmInFlight = false
    phase.value = 'preparing'
  }

  function closeScanner(): void {
    resetWorkflow('closed')
  }

  function markOffline(): void {
    if (phase.value === 'closed') {
      return
    }

    // Do not open camera / queue tokens when offline.
    cameraActive.value = false
    if (
      phase.value === 'preparing' ||
      phase.value === 'requesting-permission' ||
      phase.value === 'scanning'
    ) {
      phase.value = 'offline'
      error.value = {
        message: '',
        code: 'OFFLINE',
        cameraKind: null,
        blockConfirmRetry: false,
        confirmationInProgress: false,
        refreshRoute: false,
        closeConfirmation: false,
      }
    }
  }

  function markOnline(): void {
    if (phase.value === 'offline') {
      error.value = null
      phase.value = 'preparing'
    }
  }

  function onCameraPreparing(): void {
    if (
      phase.value === 'preparing' ||
      phase.value === 'requesting-permission'
    ) {
      phase.value = 'requesting-permission'
    }
  }

  function onCameraPermissionRequested(): void {
    if (
      phase.value === 'preparing' ||
      phase.value === 'requesting-permission' ||
      phase.value === 'scanning'
    ) {
      phase.value = 'requesting-permission'
    }
  }

  function onCameraStarted(): void {
    if (
      phase.value === 'preparing' ||
      phase.value === 'requesting-permission' ||
      phase.value === 'scanning'
    ) {
      cameraActive.value = true
      phase.value = 'scanning'
      error.value = null
    }
  }

  function onCameraError(rawError: unknown): void {
    cameraActive.value = false
    const kind = getDeliveryQrScannerProvider().classifyError(rawError)
    phase.value = kind === 'unsupported' ? 'fatal-error' : 'recoverable-error'
    error.value = {
      message: '',
      code: null,
      cameraKind: kind,
      blockConfirmRetry: false,
      confirmationInProgress: false,
      refreshRoute: false,
      closeConfirmation: false,
    }
  }

  async function loadPreview(token: string): Promise<void> {
    if (!options.isOnline()) {
      phase.value = 'offline'
      error.value = {
        message: '',
        code: 'OFFLINE',
        cameraKind: null,
        blockConfirmRetry: false,
        confirmationInProgress: false,
        refreshRoute: false,
        closeConfirmation: false,
      }
      return
    }

    if (previewInFlight) {
      return
    }

    previewInFlight = true
    cameraActive.value = false
    phase.value = 'loading-preview'
    error.value = null
    preview.value = null
    transientToken = token

    try {
      const result = await previewDeliveryQr(token)
      preview.value = result
      phase.value = 'preview-ready'
    } catch (err: unknown) {
      const mapped = mapRestFailure(err)
      error.value = mapped
      if (mapped.refreshRoute) {
        clearTransientToken()
        await options.onRefreshRoute?.()
      }
      phase.value = 'recoverable-error'
    } finally {
      previewInFlight = false
    }
  }

  async function onDecoded(rawValue: string): Promise<void> {
    if (previewInFlight || confirmInFlight) {
      return
    }

    // Ignore duplicate frames once preview/confirm is underway.
    if (
      phase.value === 'loading-preview' ||
      phase.value === 'preview-ready' ||
      phase.value === 'confirming' ||
      phase.value === 'success'
    ) {
      return
    }

    // Accept decode while camera is starting or already scanning.
    if (
      phase.value !== 'preparing' &&
      phase.value !== 'requesting-permission' &&
      phase.value !== 'scanning' &&
      phase.value !== 'decoded' &&
      phase.value !== 'recoverable-error' &&
      phase.value !== 'offline' &&
      phase.value !== 'fatal-error'
    ) {
      // closed / confirming already handled
      if (phase.value === 'closed') {
        return
      }
    }

    const normalised = normalizeDeliveryQrToken(rawValue)
    if (!normalised) {
      phase.value = 'recoverable-error'
      error.value = {
        message: mapDeliveryQrRestError(
          new DeliveryQrRestError(400, 'DELIVERY_QR_TOKEN_INVALID'),
        ),
        code: 'DELIVERY_QR_TOKEN_INVALID',
        cameraKind: null,
        blockConfirmRetry: false,
        confirmationInProgress: false,
        refreshRoute: false,
        closeConfirmation: false,
      }
      cameraActive.value = false
      return
    }

    if (lastDecodedValue === normalised && previewInFlight) {
      return
    }

    lastDecodedValue = normalised
    phase.value = 'decoded'
    cameraActive.value = false
    await loadPreview(normalised)
  }

  async function submitManualToken(rawValue: string): Promise<void> {
    await onDecoded(rawValue)
  }

  function requestMarkDelivered(): void {
    if (phase.value !== 'preview-ready' || !transientToken || !preview.value) {
      return
    }
    if (!preview.value.canConfirmDelivery) {
      return
    }
    awaitingFinalConfirm.value = true
  }

  function cancelFinalConfirm(): void {
    awaitingFinalConfirm.value = false
  }

  async function runConfirm(): Promise<void> {
    if (!transientToken || confirmInFlight) {
      return
    }

    if (!options.isOnline()) {
      phase.value = 'offline'
      return
    }

    confirmInFlight = true
    awaitingFinalConfirm.value = false
    phase.value = 'confirming'
    error.value = null

    const token = transientToken

    try {
      const result = await confirmDeliveryQr(token)
      confirmResult.value = result
      clearTransientToken()
      phase.value = 'success'
      await options.onRefreshRoute?.()
    } catch (err: unknown) {
      const mapped = mapRestFailure(err)
      error.value = mapped

      if (mapped.confirmationInProgress) {
        phase.value = 'recoverable-error'
        await options.onRefreshRoute?.()
      } else if (mapped.refreshRoute) {
        clearTransientToken()
        await options.onRefreshRoute?.()
        phase.value = 'recoverable-error'
      } else if (mapped.blockConfirmRetry) {
        clearTransientToken()
        phase.value = 'recoverable-error'
      } else if (mapped.closeConfirmation) {
        clearTransientToken()
        await options.onRefreshRoute?.()
        phase.value = 'recoverable-error'
      } else {
        // Keep preview + token for recoverable network / conflict retries.
        phase.value = 'preview-ready'
      }
    } finally {
      confirmInFlight = false
    }
  }

  async function confirmDelivery(): Promise<void> {
    await runConfirm()
  }

  async function checkConfirmationAgain(): Promise<void> {
    await runConfirm()
  }

  function retryAfterError(): void {
    const previous = error.value
    const blocked = previous?.blockConfirmRetry === true
    const hadPreview =
      preview.value !== null && transientToken !== null && !blocked

    error.value = null
    confirmResult.value = null
    awaitingFinalConfirm.value = false

    if (!options.isOnline()) {
      phase.value = 'offline'
      return
    }

    if (hadPreview) {
      phase.value = 'preview-ready'
      return
    }

    clearTransientToken()
    preview.value = null
    phase.value = 'preparing'
  }

  function acknowledgeSuccess(): void {
    resetWorkflow('closed')
  }

  return {
    phase,
    preview,
    confirmResult,
    error,
    awaitingFinalConfirm,
    cameraActive,
    canOpenScanner,
    hasTransientToken,
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
    __peekTransientTokenForTests: () => transientToken,
  }
}

/** i18n key helper for camera errors (used by UI). */
export function deliveryQrCameraErrorI18nKey(
  kind: DeliveryQrCameraErrorKind | null,
): string {
  if (!kind) {
    return 'errors.deliveryQr.generic'
  }
  return cameraErrorMessage(kind)
}

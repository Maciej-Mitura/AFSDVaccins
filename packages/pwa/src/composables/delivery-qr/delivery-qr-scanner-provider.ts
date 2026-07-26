/**
 * Replaceable camera / QR decode provider for courier delivery scanning.
 * Default implementation uses vue-qrcode-reader (BarcodeDetector + ZXing fallback).
 * Camera frames never leave the device.
 */

export type DeliveryQrCameraConstraints = MediaTrackConstraints

export type DeliveryQrDecodedBarcode = {
  rawValue: string
}

export type DeliveryQrCameraErrorKind =
  | 'permission-denied'
  | 'no-camera'
  | 'camera-in-use'
  | 'insecure-context'
  | 'unsupported'
  | 'start-failed'

export class DeliveryQrCameraError extends Error {
  readonly kind: DeliveryQrCameraErrorKind

  constructor(kind: DeliveryQrCameraErrorKind, message?: string) {
    super(message ?? kind)
    this.name = 'DeliveryQrCameraError'
    this.kind = kind
  }
}

/** Prefer rear-facing camera when the device supports facingMode. */
export const DELIVERY_QR_DEFAULT_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
}

export type DeliveryQrScannerProvider = {
  readonly id: string
  /** Whether getUserMedia + secure context appear available. */
  isSupported(): boolean
  /** Default camera track constraints (rear-facing preferred). */
  getConstraints(): MediaTrackConstraints
  /**
   * Map a thrown camera / library error to a stable kind.
   * Does not include token values.
   */
  classifyError(error: unknown): DeliveryQrCameraErrorKind
}

/**
 * Stop every track on a MediaStream. Safe to call with null/undefined.
 */
export function stopMediaStreamTracks(
  stream: MediaStream | null | undefined,
): void {
  if (!stream) {
    return
  }

  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      // Ignore already-stopped tracks.
    }
  }
}

function isDomExceptionName(error: unknown, name: string): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return false
  }
  return Reflect.get(error, 'name') === name
}

/**
 * Map a thrown camera / library error to a stable kind.
 * Prefer concrete DOMException names over ambient secure-context checks so
 * unit tests and permission failures stay precise.
 */
export function classifyMediaDevicesError(
  error: unknown,
): DeliveryQrCameraErrorKind {
  if (error instanceof DeliveryQrCameraError) {
    return error.kind
  }

  if (
    isDomExceptionName(error, 'NotAllowedError') ||
    isDomExceptionName(error, 'PermissionDeniedError') ||
    isDomExceptionName(error, 'SecurityError')
  ) {
    return 'permission-denied'
  }

  if (
    isDomExceptionName(error, 'NotFoundError') ||
    isDomExceptionName(error, 'DevicesNotFoundError') ||
    isDomExceptionName(error, 'OverconstrainedError')
  ) {
    return 'no-camera'
  }

  if (
    isDomExceptionName(error, 'NotReadableError') ||
    isDomExceptionName(error, 'TrackStartError') ||
    isDomExceptionName(error, 'AbortError')
  ) {
    return 'camera-in-use'
  }

  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'insecure-context'
  }

  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return 'unsupported'
  }

  return 'start-failed'
}

export const vueQrcodeReaderScannerProvider: DeliveryQrScannerProvider = {
  id: 'vue-qrcode-reader',
  isSupported(): boolean {
    if (typeof window === 'undefined') {
      return false
    }
    // Allow localhost / secure contexts; treat missing flag (some test DOM) as ok.
    if (window.isSecureContext === false) {
      return false
    }
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    )
  },
  getConstraints(): MediaTrackConstraints {
    return DELIVERY_QR_DEFAULT_CONSTRAINTS
  },
  classifyError(error: unknown): DeliveryQrCameraErrorKind {
    return classifyMediaDevicesError(error)
  },
}

let activeProvider: DeliveryQrScannerProvider = vueQrcodeReaderScannerProvider

export function getDeliveryQrScannerProvider(): DeliveryQrScannerProvider {
  return activeProvider
}

/** Test / swap hook — replace the camera library without rewriting callers. */
export function setDeliveryQrScannerProvider(
  provider: DeliveryQrScannerProvider,
): void {
  activeProvider = provider
}

export function __resetDeliveryQrScannerProviderForTests(): void {
  activeProvider = vueQrcodeReaderScannerProvider
}

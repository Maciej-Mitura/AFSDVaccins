import { Throttle } from '@nestjs/throttler'

import { THROTTLER_STRICT } from './throttling.constants'

/**
 * Marks the handler for the `strict` named throttler.
 * Pair with `StrictIdentityThrottlerGuard` AFTER `AuthorizationGuard`:
 *
 * `@UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)`
 * `@StrictThrottle()`
 */
export function StrictThrottle(): MethodDecorator {
  return Throttle({
    [THROTTLER_STRICT]: {},
  })
}

/**
 * Vaccine image upload / analysis throttle: 5 requests per 10 minutes per identity.
 * Stricter than the default GraphQL mutation strict budget.
 */
export const VACCINE_IMAGE_UPLOAD_THROTTLE_LIMIT = 5
export const VACCINE_IMAGE_UPLOAD_THROTTLE_TTL_MS = 600_000

export function VaccineImageUploadThrottle(): MethodDecorator {
  return Throttle({
    [THROTTLER_STRICT]: {
      limit: VACCINE_IMAGE_UPLOAD_THROTTLE_LIMIT,
      ttl: VACCINE_IMAGE_UPLOAD_THROTTLE_TTL_MS,
    },
  })
}

/**
 * Courier QR scan-preview throttle: 20 attempts per 10 minutes per identity.
 * Stricter sustained budget than ordinary route reads; repeated legitimate
 * scans before confirmation remain practical. Never key on token contents.
 */
export const DELIVERY_QR_PREVIEW_THROTTLE_LIMIT = 20
export const DELIVERY_QR_PREVIEW_THROTTLE_TTL_MS = 600_000

export function DeliveryQrPreviewThrottle(): MethodDecorator {
  return Throttle({
    [THROTTLER_STRICT]: {
      limit: DELIVERY_QR_PREVIEW_THROTTLE_LIMIT,
      ttl: DELIVERY_QR_PREVIEW_THROTTLE_TTL_MS,
    },
  })
}

/**
 * Courier QR confirmation throttle: 10 attempts per 10 minutes per identity.
 * Stricter than preview. Never key on token contents.
 */
export const DELIVERY_QR_CONFIRM_THROTTLE_LIMIT = 10
export const DELIVERY_QR_CONFIRM_THROTTLE_TTL_MS = 600_000

export function DeliveryQrConfirmThrottle(): MethodDecorator {
  return Throttle({
    [THROTTLER_STRICT]: {
      limit: DELIVERY_QR_CONFIRM_THROTTLE_LIMIT,
      ttl: DELIVERY_QR_CONFIRM_THROTTLE_TTL_MS,
    },
  })
}

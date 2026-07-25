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

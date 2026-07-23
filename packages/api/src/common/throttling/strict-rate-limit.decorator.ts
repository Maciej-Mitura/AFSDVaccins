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

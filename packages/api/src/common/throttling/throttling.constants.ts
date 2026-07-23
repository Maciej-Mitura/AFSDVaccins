/**
 * Named throttler policies (TTL values are milliseconds — @nestjs/throttler v6).
 *
 * Guard order (HTTP GraphQL):
 * 1. APP_GUARD GraphqlThrottlerGuard — applies `default` (and `strict` metadata
 *    when present on the handler). At this point AuthorizationGuard has NOT run,
 *    so the tracker normally only has the request IP (or a Firebase UID already
 *    attached without re-verification, e.g. graphql-ws connection auth).
 * 2. Method @UseGuards(AuthorizationGuard, RolesGuard, …)
 * 3. Optional method-level StrictIdentityThrottlerGuard AFTER AuthorizationGuard
 *    for identity-keyed strict limits when applicationUser/Firebase UID is present.
 */
export const THROTTLER_DEFAULT = 'default'
export const THROTTLER_STRICT = 'strict'

export const RATE_LIMITED_ERROR_CODE = 'RATE_LIMITED'
export const RATE_LIMITED_MESSAGE =
  'Too many requests. Please try again later.'

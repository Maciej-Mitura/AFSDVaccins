import { translate } from './translate'
import { extractGraphQLErrorCode } from './graphql-error-code'

/** Known Firebase Auth error codes mapped to translation keys. */
const FIREBASE_AUTH_ERROR_KEYS: Record<string, string> = {
  'auth/email-already-in-use': 'auth.error.emailInUse',
  'auth/invalid-email': 'validation.email.invalid',
  'auth/invalid-credential': 'auth.error.invalidCredential',
  'auth/too-many-requests': 'auth.error.tooManyRequests',
  'auth/user-disabled': 'auth.error.userDisabled',
  'auth/user-not-found': 'auth.error.userNotFound',
  'auth/weak-password': 'auth.error.weakPassword',
  'auth/network-request-failed': 'auth.error.network',
}

/** Known GraphQL extension codes mapped to translation keys. */
const GRAPHQL_ERROR_KEYS: Record<string, string> = {
  INSUFFICIENT_STOCK: 'errors.stock.insufficient',
  INVALID_ORDER_STATUS_TRANSITION: 'errors.order.invalidStatusTransition',
  ORDER_CANNOT_BE_CANCELLED: 'errors.order.cancelNotAllowed',
  ROUTE_TEMPLATE_NOT_ASSIGNED: 'errors.routeTemplate.notAssigned',
  ROUTE_TEMPLATE_MULTIPLE_ACTIVE_FOR_COURIER:
    'errors.routeTemplate.multipleActiveForCourier',
  MULTIPLE_ACTIVE_ROUTE_TEMPLATES:
    'errors.routeTemplate.multipleActiveForCourier',
}

function logTechnicalError(scope: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[${scope}]`, error)
  }
}

/**
 * Map Firebase Auth errors to translated user-facing messages.
 * Unknown codes → errors.generic. Technical detail stays in the console.
 */
function readErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    if (typeof code === 'string') {
      return code
    }
  }
  return 'auth/unknown'
}

export function mapFirebaseAuthError(error: unknown): string {
  const code = readErrorCode(error)
  const key = FIREBASE_AUTH_ERROR_KEYS[code]
  if (!key) {
    logTechnicalError('firebase-auth', error)
    return translate('errors.generic')
  }
  return translate(key)
}

/**
 * Map known GraphQL error codes to translated messages.
 * Does not surface raw backend messages or stack traces to users.
 */
export function mapUserFacingGraphQLError(error: unknown): string {
  const code = extractGraphQLErrorCode(error)
  if (code && GRAPHQL_ERROR_KEYS[code]) {
    return translate(GRAPHQL_ERROR_KEYS[code])
  }

  logTechnicalError('graphql-user', error)
  return translate('errors.generic')
}

/**
 * @deprecated Prefer mapUserFacingGraphQLError — kept as alias for call-site migration.
 */
export function mapGraphQLError(error: unknown): string {
  return mapUserFacingGraphQLError(error)
}

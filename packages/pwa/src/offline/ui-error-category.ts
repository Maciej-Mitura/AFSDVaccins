import { ApolloError } from '@apollo/client/core'

/**
 * Bounded UI-facing error categories for offline route/notification UX.
 * Never surface raw IndexedDB, Apollo, or browser exception text.
 */
export type OfflineUiErrorCategory =
  | 'OFFLINE_NO_CACHE'
  | 'OFFLINE_CACHE_EXPIRED'
  | 'NETWORK_UNAVAILABLE'
  | 'CACHE_UNAVAILABLE'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'SERVER_ERROR'

export type RouteDataSource = 'SERVER' | 'CACHE' | 'NONE'

export type NotificationDataSource = 'SERVER' | 'CACHE' | 'NONE'

function readExtensionCode(error: {
  extensions?: Record<string, unknown>
}): string | null {
  const code = error.extensions?.code
  return typeof code === 'string' ? code : null
}

function readOriginalErrorCode(error: {
  extensions?: Record<string, unknown>
}): string | null {
  const original = error.extensions?.originalError as
    { error?: string } | undefined
  return typeof original?.error === 'string' ? original.error : null
}

function networkStatusCode(error: ApolloError): number | undefined {
  const networkError = error.networkError as { statusCode?: number } | null
  return networkError?.statusCode
}

/**
 * Classify an Apollo/request failure for offline fallback decisions.
 *
 * Domain GraphQL errors must NOT trigger cache fallback.
 * Only unreachable/network failures (and browser offline) may.
 */
export function classifyRequestFailure(error: unknown): OfflineUiErrorCategory {
  if (error instanceof ApolloError) {
    const status = networkStatusCode(error)

    if (status === 401) {
      return 'AUTH_REQUIRED'
    }
    if (status === 403) {
      return 'FORBIDDEN'
    }

    for (const graphQLError of error.graphQLErrors) {
      const code =
        readExtensionCode(graphQLError) ?? readOriginalErrorCode(graphQLError)
      if (code === 'UNAUTHENTICATED') {
        return 'AUTH_REQUIRED'
      }
      if (code === 'FORBIDDEN') {
        return 'FORBIDDEN'
      }
    }

    // Domain GraphQL payload — server answered; do not use offline cache.
    if (error.graphQLErrors.length > 0) {
      return 'SERVER_ERROR'
    }

    if (error.networkError) {
      return 'NETWORK_UNAVAILABLE'
    }

    return 'SERVER_ERROR'
  }

  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'NETWORK_UNAVAILABLE'
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    /Failed to fetch|NetworkError|Network request failed/i.test(error.message)
  ) {
    return 'NETWORK_UNAVAILABLE'
  }

  return 'SERVER_ERROR'
}

/** True when the failure means the API was unreachable (cache may be used). */
export function isNetworkUnavailableFailure(error: unknown): boolean {
  return classifyRequestFailure(error) === 'NETWORK_UNAVAILABLE'
}

/** True when cached private data must not be exposed. */
export function isAuthBarrierFailure(error: unknown): boolean {
  const category = classifyRequestFailure(error)
  return category === 'AUTH_REQUIRED' || category === 'FORBIDDEN'
}

export function offlineUiErrorMessageKey(
  category: OfflineUiErrorCategory,
  scope: 'route' | 'notifications' = 'route',
): string {
  if (scope === 'notifications') {
    switch (category) {
      case 'OFFLINE_NO_CACHE':
        return 'offline.notifications.unavailable'
      case 'OFFLINE_CACHE_EXPIRED':
        return 'offline.notifications.cacheExpired'
      case 'NETWORK_UNAVAILABLE':
        return 'offline.error.networkUnavailable'
      case 'CACHE_UNAVAILABLE':
        return 'offline.error.cacheUnavailable'
      case 'AUTH_REQUIRED':
        return 'offline.error.authRequired'
      case 'FORBIDDEN':
        return 'offline.error.forbidden'
      case 'SERVER_ERROR':
        return 'offline.error.server'
    }
  }

  switch (category) {
    case 'OFFLINE_NO_CACHE':
      return 'offline.route.unavailable'
    case 'OFFLINE_CACHE_EXPIRED':
      return 'offline.route.cacheExpired'
    case 'NETWORK_UNAVAILABLE':
      return 'offline.error.networkUnavailable'
    case 'CACHE_UNAVAILABLE':
      return 'offline.error.cacheUnavailable'
    case 'AUTH_REQUIRED':
      return 'offline.error.authRequired'
    case 'FORBIDDEN':
      return 'offline.error.forbidden'
    case 'SERVER_ERROR':
      return 'offline.error.server'
  }
}

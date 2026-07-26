/**
 * Validates notification action paths so producers cannot emit external URLs.
 * Only same-origin relative paths starting with `/` are accepted.
 */

export const MAX_NOTIFICATION_ACTION_PATH_LENGTH = 200

export function isInternalActionPath(
  actionPath: string | null | undefined,
): actionPath is string {
  if (actionPath == null || typeof actionPath !== 'string') {
    return false
  }

  const trimmed = actionPath.trim()

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return false
  }

  if (trimmed.includes('://') || trimmed.includes('\\')) {
    return false
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed.slice(1))) {
    return false
  }

  return trimmed.length <= MAX_NOTIFICATION_ACTION_PATH_LENGTH
}

/**
 * Returns a safe internal path or null when the value is external/invalid.
 */
export function sanitizeInternalActionPath(
  actionPath: string | null | undefined,
): string | null {
  return isInternalActionPath(actionPath) ? actionPath.trim() : null
}

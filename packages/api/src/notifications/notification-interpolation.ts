import {
  getNotificationTaxonomy,
  type NotificationInterpolationData,
  type NotificationInterpolationKey,
  NOTIFICATION_INTERPOLATION_KEYS,
} from './notification-taxonomy'
import { NotificationType } from './notification-type.enum'

export const MAX_INTERPOLATION_ENTRIES = 8
export const MAX_INTERPOLATION_KEY_LENGTH = 32
export const MAX_INTERPOLATION_STRING_VALUE_LENGTH = 120
export const MAX_INTERPOLATION_JSON_BYTES = 1024

const ALLOWED_KEY_SET = new Set<string>(NOTIFICATION_INTERPOLATION_KEYS)

function isPlainJsonSafeValue(value: unknown): value is string | number {
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }

  if (typeof value === 'string') {
    return value.length <= MAX_INTERPOLATION_STRING_VALUE_LENGTH
  }

  return false
}

/**
 * Validates and returns a bounded, JSON-safe interpolation payload.
 * Rejects unknown keys, nested objects, secrets-shaped values, and oversized payloads.
 */
export function sanitizeInterpolationData(
  type: NotificationType,
  raw: Record<string, unknown> | null | undefined,
): NotificationInterpolationData | null {
  if (raw == null) {
    return null
  }

  const entries = Object.entries(raw)

  if (entries.length === 0) {
    return null
  }

  if (entries.length > MAX_INTERPOLATION_ENTRIES) {
    throw new Error(
      `interpolationData exceeds max entries (${MAX_INTERPOLATION_ENTRIES})`,
    )
  }

  const taxonomy = getNotificationTaxonomy(type)
  const allowedForType = taxonomy
    ? new Set<string>(taxonomy.allowedInterpolationKeys)
    : ALLOWED_KEY_SET

  const sanitized: NotificationInterpolationData = {}

  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > MAX_INTERPOLATION_KEY_LENGTH) {
      throw new Error('interpolationData key length out of bounds')
    }

    if (!ALLOWED_KEY_SET.has(key) || !allowedForType.has(key)) {
      throw new Error(`interpolationData key "${key}" is not allowed`)
    }

    if (!isPlainJsonSafeValue(value)) {
      throw new Error(
        `interpolationData value for "${key}" must be a finite number or short string`,
      )
    }

    sanitized[key as NotificationInterpolationKey] = value
  }

  const json = JSON.stringify(sanitized)

  if (Buffer.byteLength(json, 'utf8') > MAX_INTERPOLATION_JSON_BYTES) {
    throw new Error(
      `interpolationData exceeds max JSON size (${MAX_INTERPOLATION_JSON_BYTES} bytes)`,
    )
  }

  return sanitized
}

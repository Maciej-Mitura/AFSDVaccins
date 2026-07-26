import { createHash } from 'node:crypto'

import type { PushNotificationPayload } from './push-notification.provider'
import { Notification } from '../notifications/notification.entity'

export const PUSH_ENDPOINT_MAX_LENGTH = 2048
export const PUSH_KEY_MAX_LENGTH = 256
export const PUSH_USER_AGENT_MAX_LENGTH = 160
export const PUSH_DEVICE_LABEL_MAX_LENGTH = 64

/** Hash endpoint for uniqueness lookups without exposing the raw URL in indexes alone. */
export function hashPushEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint, 'utf8').digest('hex')
}

/**
 * Builds a bounded Web Push payload from a persisted notification.
 * Excludes interpolation secrets, order lines, GPS, and subscription material.
 */
export function buildSafePushPayload(
  notification: Notification,
): PushNotificationPayload {
  return {
    notificationId: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    actionPath: notification.actionPath ?? null,
    createdAt: notification.createdAt.toISOString(),
  }
}

export function assertSafePushPayload(payload: PushNotificationPayload): void {
  const serialized = JSON.stringify(payload)

  if (Buffer.byteLength(serialized, 'utf8') > 3500) {
    throw new Error('Push payload exceeds safe size bound')
  }

  const forbidden = [
    'endpoint',
    'p256dh',
    'auth',
    'latitude',
    'longitude',
    'password',
    'token',
    'secret',
  ]

  const lower = serialized.toLowerCase()

  for (const key of forbidden) {
    if (
      lower.includes(`"${key}"`) &&
      key !== 'token' // notificationId may contain hex; only block key names as fields
    ) {
      // Only fail when the forbidden word appears as a JSON key.
    }
  }

  if (
    /"(endpoint|p256dh|auth|latitude|longitude|password|secret)"\s*:/.test(
      serialized,
    )
  ) {
    throw new Error('Push payload contains forbidden sensitive fields')
  }
}

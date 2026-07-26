import * as z from 'zod'

import {
  PENDING_ACTION_PAYLOAD_MAX_KEYS,
  PENDING_ACTION_PAYLOAD_MAX_STRING_LENGTH,
} from '@/offline/constants'
import {
  ForbiddenPendingActionType,
  PendingActionType,
  type PendingActionPayload,
} from '@/offline/types'

const pendingActionPayloadSchema = z
  .object({
    routeId: z.string().min(1).max(PENDING_ACTION_PAYLOAD_MAX_STRING_LENGTH),
    stopId: z.string().min(1).max(PENDING_ACTION_PAYLOAD_MAX_STRING_LENGTH),
    clientArrivedAt: z
      .string()
      .min(1)
      .max(PENDING_ACTION_PAYLOAD_MAX_STRING_LENGTH),
  })
  .strict()

const FORBIDDEN_PAYLOAD_KEYS = [
  'token',
  'qrToken',
  'encodedQrToken',
  'nonce',
  'nonceHash',
  'authorization',
  'bearer',
  'idToken',
  'refreshToken',
  'endpoint',
  'p256dh',
  'auth',
  'vapidPrivateKey',
  'sasUrl',
] as const

export function isForbiddenPendingActionType(type: string): boolean {
  return Object.values(ForbiddenPendingActionType).includes(
    type as ForbiddenPendingActionType,
  )
}

export function isAllowedPendingActionType(
  type: string,
): type is PendingActionType {
  return Object.values(PendingActionType).includes(type as PendingActionType)
}

/**
 * Validates a pending-action payload. Rejects secrets and unknown keys.
 */
export function parsePendingActionPayload(
  type: PendingActionType,
  payload: unknown,
): PendingActionPayload {
  if (type !== PendingActionType.CourierStopArrived) {
    throw new Error('PENDING_ACTION_TYPE_UNSUPPORTED')
  }

  if (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload)
  ) {
    const keys = Object.keys(payload)
    if (keys.length > PENDING_ACTION_PAYLOAD_MAX_KEYS) {
      throw new Error('PENDING_ACTION_PAYLOAD_TOO_LARGE')
    }
    for (const key of keys) {
      const lower = key.toLowerCase()
      if (
        FORBIDDEN_PAYLOAD_KEYS.some(
          forbidden =>
            lower === forbidden.toLowerCase() ||
            lower.includes(forbidden.toLowerCase()),
        )
      ) {
        throw new Error('PENDING_ACTION_PAYLOAD_FORBIDDEN_KEY')
      }
    }
  }

  return pendingActionPayloadSchema.parse(payload)
}

export function assertPendingActionTypeAllowed(
  type: string,
): PendingActionType {
  if (isForbiddenPendingActionType(type)) {
    throw new Error('PENDING_ACTION_TYPE_FORBIDDEN')
  }
  if (!isAllowedPendingActionType(type)) {
    throw new Error('PENDING_ACTION_TYPE_UNSUPPORTED')
  }
  return type
}

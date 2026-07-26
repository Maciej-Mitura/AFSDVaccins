/**
 * Provider-neutral push send result.
 * Permanent failures should disable/remove the subscription.
 * Transient failures leave the subscription active.
 */
export type PushFailureKind = 'permanent' | 'transient'

export type PushSendResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false
      failureKind: PushFailureKind
      failureCode: string
      statusCode?: number
    }

/** Bounded push payload — never includes secrets or full domain objects. */
export type PushNotificationPayload = {
  notificationId: string
  type: string
  title: string
  body: string
  actionPath?: string | null
  createdAt: string
}

export type PushSubscriptionTarget = {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushNotificationProvider {
  readonly providerName: string

  send(
    subscription: PushSubscriptionTarget,
    payload: PushNotificationPayload,
  ): Promise<PushSendResult>
}

export const PUSH_NOTIFICATION_PROVIDER = Symbol('PUSH_NOTIFICATION_PROVIDER')

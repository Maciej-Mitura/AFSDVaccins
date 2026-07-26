import webpush from 'web-push'

import type {
  PushNotificationPayload,
  PushNotificationProvider,
  PushSendResult,
  PushSubscriptionTarget,
} from './push-notification.provider'

export type WebPushProviderConfig = {
  vapidPublicKey: string
  vapidPrivateKey: string
  subject: string
}

/**
 * Standard Web Push (VAPID) adapter foundation.
 * No send calls at module construction / app startup.
 */
export class WebPushNotificationProvider implements PushNotificationProvider {
  readonly providerName = 'webpush'

  constructor(private readonly config: WebPushProviderConfig) {
    webpush.setVapidDetails(
      config.subject,
      config.vapidPublicKey,
      config.vapidPrivateKey,
    )
  }

  static fromConfig(config: WebPushProviderConfig): WebPushNotificationProvider {
    return new WebPushNotificationProvider(config)
  }

  async send(
    subscription: PushSubscriptionTarget,
    payload: PushNotificationPayload,
  ): Promise<PushSendResult> {
    try {
      const result = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload),
        {
          TTL: 60 * 60,
          urgency: 'normal',
        },
      )

      return {
        ok: true,
        providerMessageId: String(result.statusCode),
      }
    } catch (error: unknown) {
      return classifyWebPushError(error)
    }
  }
}

export function classifyWebPushError(error: unknown): PushSendResult {
  const statusCode =
    error && typeof error === 'object' && 'statusCode' in error
      ? Number((error as { statusCode?: number }).statusCode)
      : undefined

  const body =
    error && typeof error === 'object' && 'body' in error
      ? String((error as { body?: string }).body ?? '')
      : ''

  // Never include endpoint/keys in failure codes or logs.
  if (statusCode === 404 || statusCode === 410) {
    return {
      ok: false,
      failureKind: 'permanent',
      failureCode: `GONE_${statusCode}`,
      statusCode,
    }
  }

  if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
    return {
      ok: false,
      failureKind: 'permanent',
      failureCode: `REJECTED_${statusCode}`,
      statusCode,
    }
  }

  if (statusCode === 429 || (statusCode != null && statusCode >= 500)) {
    return {
      ok: false,
      failureKind: 'transient',
      failureCode: `TRANSIENT_${statusCode}`,
      statusCode,
    }
  }

  const message =
    error instanceof Error ? error.message.slice(0, 80) : 'UNKNOWN'

  return {
    ok: false,
    failureKind: statusCode != null && statusCode < 500 ? 'permanent' : 'transient',
    failureCode: `WEB_PUSH_${message.replace(/\s+/g, '_').toUpperCase()}`,
    statusCode,
    // body intentionally unused in returned code to avoid leaking provider details
    ...(body.length === 0 ? {} : {}),
  }
}

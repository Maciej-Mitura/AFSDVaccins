import { Injectable } from '@nestjs/common'

import { Notification } from '../notifications/notification.entity'
import { NotificationService } from '../notifications/notification.service'
import {
  assertSafePushPayload,
  buildSafePushPayload,
} from './push-payload'
import {
  PUSH_NOTIFICATION_PROVIDER,
  type PushNotificationProvider,
} from './push-notification.provider'
import { PushSubscriptionService } from './push-subscription.service'
import { Inject } from '@nestjs/common'

/**
 * Foreground/background delivery policy foundation.
 *
 * Selected mechanism (documented):
 * - Backend always persists + publishes GraphQL realtime on create.
 * - OS push is requested only via this policy (explicit invoke).
 * - Service worker checks for visible window clients before showing OS UI.
 * - Visible app shows one in-app toast from the realtime event.
 * - This prevents ordinary duplicate toast + OS push for the same event.
 *
 * Presence heartbeat is not required for Phase 27A when the SW visibility
 * approach is used; the backend may still request push whenever the user has
 * active subscriptions — the SW suppresses display if a client is visible.
 */
@Injectable()
export class NotificationDeliveryPolicyService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushSubscriptionService: PushSubscriptionService,
    @Inject(PUSH_NOTIFICATION_PROVIDER)
    private readonly pushProvider: PushNotificationProvider,
  ) {}

  /**
   * Request OS push for a persisted notification to the recipient's devices.
   * Does not re-publish realtime (create already did). Safe to call repeatedly;
   * deliveryState records the latest attempt.
   */
  async requestPushDelivery(notification: Notification): Promise<{
    attempted: number
    delivered: number
    permanentFailures: number
    transientFailures: number
  }> {
    const payload = buildSafePushPayload(notification)
    assertSafePushPayload(payload)

    await this.notificationService.recordPushRequested(notification.id)

    const subscriptions =
      await this.pushSubscriptionService.findActiveSubscriptionsForUser(
        notification.recipientUserId.toString(),
      )

    let delivered = 0
    let permanentFailures = 0
    let transientFailures = 0

    for (const subscription of subscriptions) {
      const result = await this.pushProvider.send(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        payload,
      )

      await this.pushSubscriptionService.applyPushResult(subscription, result)

      if (result.ok) {
        delivered += 1
      } else if (result.failureKind === 'permanent') {
        permanentFailures += 1
      } else {
        transientFailures += 1
      }
    }

    if (delivered > 0) {
      await this.notificationService.recordPushOutcome(notification.id, {
        delivered: true,
      })
    } else if (permanentFailures + transientFailures > 0) {
      await this.notificationService.recordPushOutcome(notification.id, {
        delivered: false,
        failureCode:
          permanentFailures > 0 ? 'PUSH_PERMANENT_FAILURE' : 'PUSH_TRANSIENT_FAILURE',
      })
    }

    return {
      attempted: subscriptions.length,
      delivered,
      permanentFailures,
      transientFailures,
    }
  }
}

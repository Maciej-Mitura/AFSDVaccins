import type {
  PushNotificationPayload,
  PushNotificationProvider,
  PushSendResult,
  PushSubscriptionTarget,
} from './push-notification.provider'

/**
 * In-memory fake provider for unit/e2e tests.
 * Records sends; never performs network I/O.
 * Must never be selected when NODE_ENV=production.
 */
export class FakePushNotificationProvider implements PushNotificationProvider {
  readonly providerName = 'fake'

  readonly sent: Array<{
    subscription: PushSubscriptionTarget
    payload: PushNotificationPayload
  }> = []

  private nextResult: PushSendResult = { ok: true, providerMessageId: 'fake-1' }

  setNextResult(result: PushSendResult): void {
    this.nextResult = result
  }

  clear(): void {
    this.sent.length = 0
    this.nextResult = { ok: true, providerMessageId: 'fake-1' }
  }

  send(
    subscription: PushSubscriptionTarget,
    payload: PushNotificationPayload,
  ): Promise<PushSendResult> {
    this.sent.push({ subscription, payload })
    return Promise.resolve(this.nextResult)
  }
}

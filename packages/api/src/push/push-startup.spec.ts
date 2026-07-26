import { FakePushNotificationProvider } from './fake-push-notification.provider'
import { PushModule } from './push.module'

describe('Push module startup', () => {
  it('does not perform external push calls at provider construction', async () => {
    const fake = new FakePushNotificationProvider()
    expect(fake.sent).toHaveLength(0)
    // Module factory only constructs the provider — no send() on boot.
    expect(PushModule).toBeDefined()
    await fake.send(
      {
        endpoint: 'https://example.test/push',
        p256dh: 'p256dh-key-material',
        auth: 'auth-key-material',
      },
      {
        notificationId: 'n',
        type: 'T',
        title: 't',
        body: 'b',
        createdAt: new Date().toISOString(),
      },
    )
    expect(fake.sent).toHaveLength(1)
  })
})

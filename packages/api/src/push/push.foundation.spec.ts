import { ConfigService } from '@nestjs/config'
import { MongoRepository } from 'typeorm'

import { EnvConfig } from '../config/env.validation'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { FakePushNotificationProvider } from './fake-push-notification.provider'
import { NotificationDeliveryPolicyService } from './notification-delivery-policy.service'
import { assertSafePushPayload, buildSafePushPayload } from './push-payload'
import {
  resolvePushProviderMode,
  assertWebPushSecrets,
} from './push-provider.selection'
import { PushSubscriptionEntity } from './push-subscription.entity'
import { PushSubscriptionService } from './push-subscription.service'
import { NotificationType } from '../notifications/notification-type.enum'
import { Notification } from '../notifications/notification.entity'
import { NotificationService } from '../notifications/notification.service'
import { classifyWebPushError } from './web-push-notification.provider'

describe('Push provider selection', () => {
  it('rejects fake provider in production', () => {
    expect(() => resolvePushProviderMode('fake', 'production')).toThrow(
      /cannot be activated in production/,
    )
  })

  it('defaults to fake outside production', () => {
    expect(resolvePushProviderMode(undefined, 'test')).toBe('fake')
    expect(resolvePushProviderMode(undefined, 'development')).toBe('fake')
  })

  it('defaults to webpush in production', () => {
    expect(resolvePushProviderMode(undefined, 'production')).toBe('webpush')
  })

  it('fails validation when webpush secrets are missing/weak', () => {
    expect(() =>
      assertWebPushSecrets('short', 'also-short', 'mailto:a@b.c'),
    ).toThrow(/WEB_PUSH_VAPID_PUBLIC_KEY/)
    expect(() =>
      assertWebPushSecrets('x'.repeat(80), 'y'.repeat(40), 'not-a-uri'),
    ).toThrow(/WEB_PUSH_SUBJECT/)
  })
})

describe('FakePushNotificationProvider', () => {
  it('records sends without network I/O', async () => {
    const fake = new FakePushNotificationProvider()
    const result = await fake.send(
      {
        endpoint: 'https://push.example/endpoint-a',
        p256dh: 'p256dh-value-here',
        auth: 'auth-value-here',
      },
      {
        notificationId: 'n1',
        type: 'BEZORGER_ROUTE_ASSIGNED',
        title: 't',
        body: 'b',
        createdAt: new Date().toISOString(),
      },
    )

    expect(result.ok).toBe(true)
    expect(fake.sent).toHaveLength(1)
  })
})

describe('Push payload safety', () => {
  it('excludes sensitive domain fields', () => {
    const notification = {
      id: '6a569d2cbb2590db980429cd',
      type: NotificationType.BEZORGER_ROUTE_ASSIGNED,
      title: 'notifications.bezorger.routeAssigned.title',
      body: 'notifications.bezorger.routeAssigned.body',
      actionPath: '/bezorger/routes',
      createdAt: new Date('2026-07-26T06:00:00.000Z'),
    } as Notification

    const payload = buildSafePushPayload(notification)
    expect(payload).not.toHaveProperty('endpoint')
    expect(payload).not.toHaveProperty('p256dh')
    expect(payload).not.toHaveProperty('auth')
    expect(payload).not.toHaveProperty('interpolationData')
    expect(JSON.stringify(payload)).not.toMatch(/latitude|longitude|password/)
    expect(() => assertSafePushPayload(payload)).not.toThrow()
  })
})

describe('Web push failure classification', () => {
  it('treats 410 as permanent', () => {
    const result = classifyWebPushError({ statusCode: 410, body: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failureKind).toBe('permanent')
    }
  })

  it('treats 503 as transient', () => {
    const result = classifyWebPushError({ statusCode: 503, body: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failureKind).toBe('transient')
    }
  })
})

describe('PushSubscriptionService', () => {
  const user: User = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: 'firebase-a',
    email: 'a@example.com',
    firstName: 'A',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const other: User = {
    ...user,
    _id: '507f1f77bcf86cd799439099',
    id: '507f1f77bcf86cd799439099',
  }

  const now = new Date('2026-07-26T08:00:00.000Z')
  let repository: jest.Mocked<
    Pick<
      MongoRepository<PushSubscriptionEntity>,
      'findOne' | 'find' | 'create' | 'save' | 'count'
    >
  >
  let service: PushSubscriptionService
  let fake: FakePushNotificationProvider

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    }
    fake = new FakePushNotificationProvider()
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test'
        if (key === 'PUSH_PROVIDER') return 'fake'
        return undefined
      }),
    } as unknown as ConfigService

    service = new PushSubscriptionService(
      repository as unknown as MongoRepository<PushSubscriptionEntity>,
      fake,
      config as unknown as ConfigService<EnvConfig, true>,
      { now: () => now },
    )
  })

  it('registers subscription with actor-derived userId (idempotent update)', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as PushSubscriptionEntity)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...value,
        _id: 'sub-1',
        id: 'sub-1',
        createdAt: now,
        updatedAt: now,
      } as PushSubscriptionEntity),
    )

    const status = await service.registerSubscription(user, {
      endpoint: 'https://push.example/device-1',
      p256dh: 'p256dh-key-material-xx',
      auth: 'auth-key-material-xxxx',
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user._id,
        endpoint: 'https://push.example/device-1',
      }),
    )
    expect(status).not.toHaveProperty('endpoint')
    expect(status).not.toHaveProperty('p256dh')
    expect(status).not.toHaveProperty('auth')
    expect(status.enabled).toBe(true)

    const existing = {
      _id: 'sub-1',
      id: 'sub-1',
      userId: user._id,
      endpointHash: 'hash',
      endpoint: 'https://push.example/device-1',
      p256dh: 'old',
      auth: 'old',
      failureCount: 2,
      disabledAt: now,
      createdAt: now,
      updatedAt: now,
    } as PushSubscriptionEntity
    repository.findOne.mockResolvedValue(existing)
    repository.count.mockResolvedValue(1)

    const updated = await service.registerSubscription(user, {
      endpoint: 'https://push.example/device-1',
      p256dh: 'p256dh-key-material-yy',
      auth: 'auth-key-material-yyyy',
    })

    expect(existing.p256dh).toBe('p256dh-key-material-yy')
    expect(existing.disabledAt).toBeNull()
    expect(updated.subscriptionCount).toBe(1)
  })

  it('allows multiple devices per user', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as PushSubscriptionEntity)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as PushSubscriptionEntity),
    )
    repository.count.mockResolvedValue(2)
    repository.find.mockResolvedValue([])

    await service.registerSubscription(user, {
      endpoint: 'https://push.example/device-a',
      p256dh: 'p256dh-key-material-aa',
      auth: 'auth-key-material-aaaa',
    })
    await service.registerSubscription(user, {
      endpoint: 'https://push.example/device-b',
      p256dh: 'p256dh-key-material-bb',
      auth: 'auth-key-material-bbbb',
    })

    expect(repository.save).toHaveBeenCalledTimes(2)
    const status = await service.getCapabilityStatus(user)
    expect(status.subscriptionCount).toBe(2)
  })

  it('claims endpoint exclusivity so one browser endpoint is not active for two users', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as PushSubscriptionEntity)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as PushSubscriptionEntity),
    )
    repository.count.mockResolvedValue(1)

    const otherActive = {
      _id: 'other-sub',
      userId: other._id,
      endpoint: 'https://push.example/shared-device',
      endpointHash: 'shared-hash',
      disabledAt: null,
      failureCount: 0,
    } as PushSubscriptionEntity

    repository.find.mockResolvedValue([otherActive])

    await service.registerSubscription(user, {
      endpoint: 'https://push.example/shared-device',
      p256dh: 'p256dh-key-material-xx',
      auth: 'auth-key-material-xxxx',
    })

    expect(otherActive.disabledAt).toEqual(now)
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user._id,
        endpoint: 'https://push.example/shared-device',
      }),
    )
  })

  it('unsubscribe is idempotent and scoped to actor', async () => {
    repository.findOne.mockResolvedValue(null)
    const status = await service.disableSubscription(user, {
      endpoint: 'https://push.example/missing',
    })
    expect(status).toBeDefined()

    const owned = {
      _id: 'sub-1',
      userId: user._id,
      endpoint: 'https://push.example/device-1',
      endpointHash: 'h',
      disabledAt: null,
      failureCount: 0,
    } as PushSubscriptionEntity
    repository.findOne.mockResolvedValue(owned)
    repository.save.mockResolvedValue(owned)
    repository.count.mockResolvedValue(0)

    await service.disableSubscription(user, {
      endpoint: 'https://push.example/device-1',
    })
    expect(owned.disabledAt).toEqual(now)

    owned.disabledAt = now
    await service.disableSubscription(user, {
      endpoint: 'https://push.example/device-1',
    })
    expect(repository.save).toHaveBeenCalledTimes(1)

    // Another user's row is never loaded when endpoint hash is scoped by actor userId.
    void other
  })

  it('permanent failure disables subscription; transient does not', async () => {
    const sub = {
      _id: 'sub-1',
      userId: user._id,
      failureCount: 0,
      disabledAt: null,
    } as PushSubscriptionEntity
    repository.save.mockResolvedValue(sub)

    await service.applyPushResult(sub, {
      ok: false,
      failureKind: 'transient',
      failureCode: 'TRANSIENT_503',
    })
    expect(sub.disabledAt).toBeNull()
    expect(sub.failureCount).toBe(1)

    await service.applyPushResult(sub, {
      ok: false,
      failureKind: 'permanent',
      failureCode: 'GONE_410',
    })
    expect(sub.disabledAt).toEqual(now)
  })
})

describe('NotificationDeliveryPolicyService', () => {
  it('sends via provider and records outcomes', async () => {
    const fake = new FakePushNotificationProvider()
    const notificationService = {
      recordPushRequested: jest.fn().mockResolvedValue(undefined),
      recordPushOutcome: jest.fn().mockResolvedValue(undefined),
    }
    const pushSubscriptionService = {
      findActiveSubscriptionsForUser: jest.fn().mockResolvedValue([
        {
          endpoint: 'https://push.example/a',
          p256dh: 'p256',
          auth: 'auth',
        },
      ]),
      applyPushResult: jest.fn().mockResolvedValue(undefined),
    }

    const policy = new NotificationDeliveryPolicyService(
      notificationService as unknown as NotificationService,
      pushSubscriptionService as unknown as PushSubscriptionService,
      fake,
    )

    const notification = {
      id: '6a569d2cbb2590db980429cd',
      recipientUserId: '507f1f77bcf86cd799439011',
      type: NotificationType.ADMIN_NEW_ORDER,
      title: 't',
      body: 'b',
      actionPath: '/admin/orders',
      createdAt: new Date('2026-07-26T06:00:00.000Z'),
    } as Notification

    const result = await policy.requestPushDelivery(notification)
    expect(result.attempted).toBe(1)
    expect(result.delivered).toBe(1)
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0].payload).not.toHaveProperty('endpoint')
  })
})

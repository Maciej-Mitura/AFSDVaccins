import { MongoRepository } from 'typeorm'

import { NotificationNotFoundException } from './exceptions/notification.exceptions'
import { NotificationEventsService } from './notification-events.service'
import { NotificationType } from './notification-type.enum'
import { NotificationService } from './notification.service'
import { Notification } from './notification.entity'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'

describe('NotificationService', () => {
  let service: NotificationService
  let repository: jest.Mocked<
    Pick<
      MongoRepository<Notification>,
      'findOne' | 'find' | 'create' | 'save' | 'count'
    >
  >
  let notificationEventsService: jest.Mocked<
    Pick<NotificationEventsService, 'publishNotificationReceived'>
  >

  const apotheker: User = {
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

  const otherApotheker: User = {
    ...apotheker,
    _id: '507f1f77bcf86cd799439012',
    id: '507f1f77bcf86cd799439012',
    firebaseUid: 'firebase-b',
    email: 'b@example.com',
  }

  const bezorger: User = {
    ...apotheker,
    _id: '507f1f77bcf86cd799439014',
    id: '507f1f77bcf86cd799439014',
    role: UserRole.BEZORGER,
    email: 'c@example.com',
    firebaseUid: 'firebase-c',
  }

  const now = new Date('2026-07-14T12:00:00.000Z')

  const notification: Notification = {
    _id: '6a569d2cbb2590db980429cd',
    id: '6a569d2cbb2590db980429cd',
    recipientUserId: apotheker._id,
    type: NotificationType.ORDER_CONFIRMATION,
    title: 'Bestelling geplaatst',
    body: 'Bestelling order-a met 10 dosissen wordt geleverd op 14/07/2026.',
    relatedOrderId: 'order-a',
    deduplicationKey: 'order-confirmation:order-a',
    eventId: 'order-confirmation:order-a',
    readAt: null,
    createdAt: now,
    read: false,
  }

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
    }

    notificationEventsService = {
      publishNotificationReceived: jest.fn().mockResolvedValue(undefined),
    }

    service = new NotificationService(
      repository as unknown as MongoRepository<Notification>,
      notificationEventsService as unknown as NotificationEventsService,
      { now: () => now },
    )
  })

  it('creates order confirmation for the owning user and publishes after persistence', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as Notification)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...notification,
        ...value,
      } as Notification),
    )

    const result = await service.createNotification({
      recipientUserId: apotheker._id,
      type: NotificationType.ORDER_CONFIRMATION,
      title: notification.title,
      body: notification.body,
      relatedOrderId: 'order-a',
      deduplicationKey: 'order-confirmation:order-a',
    })

    expect(result.body).toContain('14/07/2026')
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(
      notificationEventsService.publishNotificationReceived,
    ).toHaveBeenCalledTimes(1)
  })

  it('does not duplicate weekly warning notifications in the same ISO week', async () => {
    repository.findOne.mockResolvedValue({
      ...notification,
      type: NotificationType.WEEK_LIMIT_WARNING,
      deduplicationKey: 'weekly-warning:507f1f77bcf86cd799439011:2026:29:90',
      eventId: 'weekly-warning:507f1f77bcf86cd799439011:2026:29:90',
    } as Notification)

    const result = await service.createNotification({
      recipientUserId: apotheker._id,
      type: NotificationType.WEEK_LIMIT_WARNING,
      title: 'Weekwaarschuwing bereikt',
      body: 'Je hebt 90% bereikt.',
      deduplicationKey: 'weekly-warning:507f1f77bcf86cd799439011:2026:29:90',
    })

    expect(result.type).toBe(NotificationType.WEEK_LIMIT_WARNING)
    expect(repository.save).not.toHaveBeenCalled()
    expect(
      notificationEventsService.publishNotificationReceived,
    ).not.toHaveBeenCalled()
  })

  it('createTypedNotification persists one record with i18n keys (not required Dutch copy)', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as Notification)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...value,
        _id: '6a569d2cbb2590db980429ce',
        id: '6a569d2cbb2590db980429ce',
        createdAt: now,
        read: false,
      } as Notification),
    )

    const result = await service.createTypedNotification({
      recipientUserId: bezorger._id,
      recipientRole: UserRole.BEZORGER,
      type: NotificationType.BEZORGER_ROUTE_ASSIGNED,
      eventId: 'route-assigned:route-1:bezorger',
      interpolationData: { routeDate: '2026-07-26', city: 'Gent' },
    })

    expect(result.created).toBe(true)
    expect(result.notification.titleKey).toBe(
      'notifications.bezorger.routeAssigned.title',
    )
    expect(result.notification.bodyKey).toBe(
      'notifications.bezorger.routeAssigned.body',
    )
    expect(result.notification.title).toBe(result.notification.titleKey)
    expect(result.notification.eventId).toBe('route-assigned:route-1:bezorger')
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(
      notificationEventsService.publishNotificationReceived,
    ).toHaveBeenCalledTimes(1)
  })

  it('same recipient + eventId is idempotent for typed notifications', async () => {
    const existing = {
      ...notification,
      type: NotificationType.BEZORGER_ROUTE_ASSIGNED,
      eventId: 'route-assigned:route-1:bezorger',
      recipientUserId: bezorger._id,
      titleKey: 'notifications.bezorger.routeAssigned.title',
    } as Notification
    repository.findOne.mockResolvedValue(existing)

    const result = await service.createTypedNotification({
      recipientUserId: bezorger._id,
      recipientRole: UserRole.BEZORGER,
      type: NotificationType.BEZORGER_ROUTE_ASSIGNED,
      eventId: 'route-assigned:route-1:bezorger',
    })

    expect(result.created).toBe(false)
    expect(result.notification).toBe(existing)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('different recipients may share the same domain eventId', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as Notification)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...value,
        _id: 'id-' + (value as Notification).recipientUserId,
        id: 'id-' + (value as Notification).recipientUserId,
        createdAt: now,
        read: false,
      } as Notification),
    )

    const eventId = 'admin-new-order:order-99'
    const first = await service.createTypedNotification({
      recipientUserId: '507f1f77bcf86cd799439013',
      recipientRole: UserRole.ADMIN,
      type: NotificationType.ADMIN_NEW_ORDER,
      eventId,
      interpolationData: { orderReference: 'order-99', orderCount: 1 },
    })
    const second = await service.createTypedNotification({
      recipientUserId: '507f1f77bcf86cd799439015',
      recipientRole: UserRole.ADMIN,
      type: NotificationType.ADMIN_NEW_ORDER,
      eventId,
      interpolationData: { orderReference: 'order-99', orderCount: 1 },
    })

    expect(first.notification.recipientUserId).not.toBe(
      second.notification.recipientUserId,
    )
    expect(first.notification.eventId).toBe(second.notification.eventId)
    expect(repository.save).toHaveBeenCalledTimes(2)
  })

  it('enforces recipient-role compatibility for typed types', async () => {
    await expect(
      service.createTypedNotification({
        recipientUserId: apotheker._id,
        recipientRole: UserRole.APOTHEKER,
        type: NotificationType.BEZORGER_ROUTE_ASSIGNED,
        eventId: 'bad-role',
      }),
    ).rejects.toThrow(/requires role BEZORGER/)
  })

  it('rejects oversized / unknown interpolation data', async () => {
    await expect(
      service.createTypedNotification({
        recipientUserId: bezorger._id,
        recipientRole: UserRole.BEZORGER,
        type: NotificationType.BEZORGER_ROUTE_ASSIGNED,
        eventId: 'interp-bad',
        interpolationData: { secretToken: 'nope' },
      }),
    ).rejects.toThrow(/not allowed/)
  })

  it('lists only current user notifications newest first and supports unread-only', async () => {
    repository.find.mockResolvedValue([notification])

    await service.findMyNotifications(apotheker, true)

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        recipientUserId: apotheker._id,
        readAt: null,
      },
      order: { createdAt: 'DESC' },
      take: 50,
    })
  })

  it('returns unread count for the current user', async () => {
    repository.count.mockResolvedValue(2)

    await expect(service.countUnread(apotheker)).resolves.toBe(2)
  })

  it('marks a notification read and sets readAt (idempotent on second call)', async () => {
    const unread = { ...notification } as Notification
    repository.findOne.mockResolvedValue(unread)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as Notification),
    )

    const result = await service.markNotificationRead(
      apotheker,
      notification.id,
    )

    expect(result.readAt).toEqual(now)

    repository.findOne.mockResolvedValue(result)
    const again = await service.markNotificationRead(
      apotheker,
      notification.id,
    )
    expect(again.readAt).toEqual(now)
    expect(repository.save).toHaveBeenCalledTimes(1)
  })

  it('cannot mark another user notification', async () => {
    repository.findOne.mockResolvedValue({ ...notification } as Notification)

    await expect(
      service.markNotificationRead(otherApotheker, notification.id),
    ).rejects.toBeInstanceOf(NotificationNotFoundException)
  })

  it('returns safe not-found for malformed IDs', async () => {
    await expect(
      service.markNotificationRead(apotheker, 'invalid-id'),
    ).rejects.toBeInstanceOf(NotificationNotFoundException)
  })
})

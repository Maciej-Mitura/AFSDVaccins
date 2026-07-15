import { ObjectId } from 'mongodb'
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
    expect(notificationEventsService.publishNotificationReceived).toHaveBeenCalledTimes(1)
  })

  it('does not duplicate weekly warning notifications in the same ISO week', async () => {
    repository.findOne.mockResolvedValue({
      ...notification,
      type: NotificationType.WEEK_LIMIT_WARNING,
      deduplicationKey: 'weekly-warning:507f1f77bcf86cd799439011:2026:29:90',
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
    expect(notificationEventsService.publishNotificationReceived).not.toHaveBeenCalled()
  })

  it('lists only current user notifications and supports unread-only filtering', async () => {
    repository.find.mockResolvedValue([notification])

    await service.findMyNotifications(apotheker, true)

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        recipientUserId: apotheker._id,
        readAt: null,
      },
      order: { createdAt: 'DESC' },
    })
  })

  it('returns unread count for the current user', async () => {
    repository.count.mockResolvedValue(2)

    await expect(service.countUnread(apotheker)).resolves.toBe(2)
  })

  it('marks a notification read and sets readAt', async () => {
    repository.findOne.mockResolvedValue({ ...notification } as Notification)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as Notification),
    )

    const result = await service.markNotificationRead(
      apotheker,
      notification.id,
    )

    expect(result.readAt).toEqual(now)
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

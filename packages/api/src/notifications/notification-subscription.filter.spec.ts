import { NotificationType } from './notification-type.enum'
import {
  canReceiveNotification,
  filterNotificationReceivedEvent,
} from './notification-subscription.filter'
import { Notification } from './notification.entity'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'

describe('notification-subscription.filter', () => {
  const apothekerA: User = {
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

  const apothekerB: User = {
    ...apothekerA,
    _id: '507f1f77bcf86cd799439012',
    id: '507f1f77bcf86cd799439012',
    firebaseUid: 'firebase-b',
    email: 'b@example.com',
  }

  const admin: User = {
    ...apothekerA,
    _id: '507f1f77bcf86cd799439013',
    id: '507f1f77bcf86cd799439013',
    role: UserRole.ADMIN,
    email: 'admin@example.com',
  }

  const notification: Notification = {
    _id: 'notification-a',
    id: 'notification-a',
    recipientUserId: apothekerA._id,
    type: NotificationType.ORDER_CONFIRMATION,
    title: 'Bestelling geplaatst',
    body: 'Test',
    relatedOrderId: 'order-a',
    deduplicationKey: 'order-confirmation:order-a',
    readAt: null,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    read: false,
  }

  function contextFor(user: User | null) {
    return {
      req: {
        applicationUser: user ?? undefined,
      },
    }
  }

  it('allows APOTHEKER to receive own notifications', () => {
    expect(canReceiveNotification(apothekerA, notification)).toBe(true)
  })

  it('denies another APOTHEKER notification access', () => {
    expect(canReceiveNotification(apothekerB, notification)).toBe(false)
  })

  it('denies ADMIN pharmacist-private notifications', () => {
    expect(canReceiveNotification(admin, notification)).toBe(false)
  })

  it('filters notificationReceived for recipient ownership', () => {
    expect(
      filterNotificationReceivedEvent(
        { notificationReceived: notification },
        {},
        contextFor(apothekerA),
      ),
    ).toBe(true)

    expect(
      filterNotificationReceivedEvent(
        { notificationReceived: notification },
        {},
        contextFor(apothekerB),
      ),
    ).toBe(false)
  })
})

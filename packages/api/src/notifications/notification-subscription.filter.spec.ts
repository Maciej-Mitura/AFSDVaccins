import { buildNormalizedGraphqlRequest } from '../authentication/graphql-auth.context'
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

  const orderNotification: Notification = {
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

  const lowStockNotification: Notification = {
    ...orderNotification,
    _id: 'notification-b',
    id: 'notification-b',
    recipientUserId: admin._id,
    type: NotificationType.LOW_STOCK_WARNING,
    title: 'Lage voorraad',
    body: 'Influenza heeft nog 5 dosissen.',
    relatedOrderId: null,
    deduplicationKey: 'low-stock:vaccine-a:adjustment-a',
    read: false,
  }

  function contextFor(user: User | null) {
    return {
      req: {
        applicationUser: user ?? undefined,
      },
    }
  }

  function wsContextFor(user: User) {
    const wsAuth = buildNormalizedGraphqlRequest({
      user: {
        uid: user.firebaseUid,
        email: user.email,
        emailVerified: true,
      },
      applicationUser: user,
      headers: {
        authorization: 'Bearer ws-token',
      },
    })

    return {
      req: {},
      extra: {
        socket: {},
        request: {},
        wsAuth,
      },
    }
  }

  it('allows APOTHEKER to receive own order notifications', () => {
    expect(canReceiveNotification(apothekerA, orderNotification)).toBe(true)
  })

  it('denies another APOTHEKER notification access', () => {
    expect(canReceiveNotification(apothekerB, orderNotification)).toBe(false)
  })

  it('denies ADMIN pharmacist-private notifications', () => {
    expect(canReceiveNotification(admin, orderNotification)).toBe(false)
  })

  it('allows ADMIN to receive own low-stock notifications', () => {
    expect(canReceiveNotification(admin, lowStockNotification)).toBe(true)
  })

  it('denies APOTHEKER low-stock admin notifications', () => {
    expect(canReceiveNotification(apothekerA, lowStockNotification)).toBe(false)
  })

  it('allows BEZORGER to receive own Phase 27A route notifications', () => {
    const bezorger: User = {
      ...apothekerA,
      _id: '507f1f77bcf86cd799439014',
      id: '507f1f77bcf86cd799439014',
      role: UserRole.BEZORGER,
      email: 'c@example.com',
    }
    const routeNotification = {
      ...orderNotification,
      recipientUserId: bezorger._id,
      type: NotificationType.BEZORGER_ROUTE_ASSIGNED,
      recipientRole: UserRole.BEZORGER,
      titleKey: 'notifications.bezorger.routeAssigned.title',
      bodyKey: 'notifications.bezorger.routeAssigned.body',
      title: 'notifications.bezorger.routeAssigned.title',
      body: 'notifications.bezorger.routeAssigned.body',
    } as Notification

    expect(canReceiveNotification(bezorger, routeNotification)).toBe(true)
    expect(canReceiveNotification(apothekerA, routeNotification)).toBe(false)
  })

  it('filters notificationReceived for recipient ownership', () => {
    expect(
      filterNotificationReceivedEvent(
        { notificationReceived: orderNotification },
        {},
        contextFor(apothekerA),
      ),
    ).toBe(true)

    expect(
      filterNotificationReceivedEvent(
        { notificationReceived: orderNotification },
        {},
        contextFor(apothekerB),
      ),
    ).toBe(false)
  })

  it('filters admin low-stock notifications to admin recipients only', () => {
    expect(
      filterNotificationReceivedEvent(
        { notificationReceived: lowStockNotification },
        {},
        contextFor(admin),
      ),
    ).toBe(true)

    expect(
      filterNotificationReceivedEvent(
        { notificationReceived: lowStockNotification },
        {},
        contextFor(apothekerA),
      ),
    ).toBe(false)
  })

  it('filters notificationReceived using graphql-ws extra.wsAuth context', () => {
    expect(
      filterNotificationReceivedEvent(
        { notificationReceived: orderNotification },
        {},
        wsContextFor(apothekerA),
      ),
    ).toBe(true)

    expect(
      filterNotificationReceivedEvent(
        { notificationReceived: orderNotification },
        {},
        wsContextFor(admin),
      ),
    ).toBe(false)
  })
})

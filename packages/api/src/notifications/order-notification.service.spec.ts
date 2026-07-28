import { ApplicationSettings } from '../settings/settings.entity'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { OrderStatus } from '../order/order-status.enum'
import { Order } from '../order/order.entity'
import { NotificationType } from './notification-type.enum'
import { OrderNotificationService } from './order-notification.service'
import {
  CreateTypedNotificationInput,
  NotificationService,
} from './notification.service'

describe('OrderNotificationService', () => {
  let service: OrderNotificationService
  let notificationService: jest.Mocked<
    Pick<NotificationService, 'createTypedNotification'>
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

  const settings: ApplicationSettings = {
    _id: 'settings-id',
    id: 'settings-id',
    singletonKey: 'default',
    timezone: 'Europe/Brussels',
    orderingClosingTime: '14:00',
    weeklyWarningPercentage: 90,
    weeklyDoseCap: 200,
    dailyDoseCapPerType: 50,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const order: Order = {
    _id: 'order-a',
    id: 'order-a',
    apothekerId: apotheker._id,
    status: OrderStatus.PENDING,
    orderLines: [],
    totalQuantity: 10,
    isoWeek: 29,
    isoYear: 2026,
    submittedAt: new Date('2026-07-14T10:00:00.000Z'),
    deliveryDate: '2026-07-14',
    cancelledAt: null,
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
    updatedAt: new Date('2026-07-14T10:00:00.000Z'),
  }

  function typedCalls(): CreateTypedNotificationInput[] {
    return notificationService.createTypedNotification.mock.calls.map(
      call => call[0],
    )
  }

  beforeEach(() => {
    notificationService = {
      createTypedNotification: jest.fn().mockResolvedValue({
        notification: {},
        created: true,
      }),
    }

    service = new OrderNotificationService(
      notificationService as unknown as NotificationService,
    )
  })

  it('creates weekly warning only when threshold is crossed', async () => {
    await service.handleOrderCreated(apotheker, order, 170, settings)

    expect(notificationService.createTypedNotification).toHaveBeenCalledTimes(2)
    const weekCall = typedCalls().find(
      call => call.type === NotificationType.WEEK_LIMIT_WARNING,
    )
    expect(weekCall).toMatchObject({
      type: NotificationType.WEEK_LIMIT_WARNING,
      eventId: 'weekly-warning:507f1f77bcf86cd799439011:2026:29:90',
      interpolationData: {
        warningPercentage: 90,
        weeklyDoseCap: 200,
      },
      actionPath: '/apotheker/orders',
    })
  })

  it('does not create weekly warning when already above threshold', async () => {
    await service.handleOrderCreated(apotheker, order, 185, settings)

    expect(notificationService.createTypedNotification).toHaveBeenCalledTimes(1)
    expect(typedCalls()[0]).toMatchObject({
      type: NotificationType.ORDER_CONFIRMATION,
      interpolationData: {
        doseCount: 10,
        routeDate: '2026-07-14',
      },
      actionPath: '/apotheker/orders',
    })
  })

  it('creates cancellation notification with deterministic eventId', async () => {
    await service.createOrderCancelledNotification(apotheker, {
      ...order,
      status: OrderStatus.CANCELLED,
    } as Order)

    expect(typedCalls()[0]).toMatchObject({
      type: NotificationType.ORDER_CANCELLED,
      eventId: 'order-cancelled:order-a',
      actionPath: '/apotheker/orders',
    })
  })

  it('uses admin-cancelled body key when cancelled by administrator', async () => {
    await service.createAdminCancelledOrderNotification(order)

    expect(typedCalls()[0]).toMatchObject({
      type: NotificationType.ORDER_CANCELLED,
      bodyKey: 'notifications.apotheker.orderCancelledByAdmin.body',
      eventId: 'order-cancelled:order-a',
    })
  })

  it('creates delivered notification with structured keys', async () => {
    await service.createOrderDeliveredNotification(order)

    expect(typedCalls()[0]).toMatchObject({
      type: NotificationType.ORDER_DELIVERED,
      eventId: 'order-delivered:order-a',
      actionPath: '/apotheker/orders',
    })
  })
})

import { ApplicationSettings } from '../settings/settings.entity'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { OrderStatus } from '../order/order-status.enum'
import { Order } from '../order/order.entity'
import { NotificationType } from './notification-type.enum'
import { OrderNotificationService } from './order-notification.service'
import { NotificationService } from './notification.service'

describe('OrderNotificationService', () => {
  let service: OrderNotificationService
  let notificationService: jest.Mocked<
    Pick<NotificationService, 'createNotification'>
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

  beforeEach(() => {
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({}),
    }

    service = new OrderNotificationService(
      notificationService as unknown as NotificationService,
    )
  })

  it('creates weekly warning only when threshold is crossed', async () => {
    await service.handleOrderCreated(apotheker, order, 170, settings)

    expect(notificationService.createNotification).toHaveBeenCalledTimes(2)
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.WEEK_LIMIT_WARNING,
        deduplicationKey:
          'weekly-warning:507f1f77bcf86cd799439011:2026:29:90',
      }),
    )
  })

  it('does not create weekly warning when already above threshold', async () => {
    await service.handleOrderCreated(apotheker, order, 185, settings)

    expect(notificationService.createNotification).toHaveBeenCalledTimes(1)
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.ORDER_CONFIRMATION,
      }),
    )
  })

  it('creates cancellation notification with deterministic deduplication key', async () => {
    await service.createOrderCancelledNotification(apotheker, {
      ...order,
      status: OrderStatus.CANCELLED,
    } as Order)

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.ORDER_CANCELLED,
        deduplicationKey: 'order-cancelled:order-a',
      }),
    )
  })

  it('creates delivered notification once with deterministic deduplication key', async () => {
    await service.createOrderDeliveredNotification({
      ...order,
      status: OrderStatus.DELIVERED,
    } as Order)

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.ORDER_DELIVERED,
        deduplicationKey: 'order-delivered:order-a',
      }),
    )
  })
})

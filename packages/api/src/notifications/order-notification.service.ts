import { Injectable } from '@nestjs/common'

import { ApplicationSettings } from '../settings/settings.entity'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { Order } from '../order/order.entity'
import { sanitizeInternalActionPath } from './notification-action-path'
import { NotificationType } from './notification-type.enum'
import { NotificationService } from './notification.service'

const ACTION_APOTHEKER_ORDERS = '/apotheker/orders'

@Injectable()
export class OrderNotificationService {
  constructor(private readonly notificationService: NotificationService) {}

  buildWeeklyWarningDeduplicationKey(
    userId: string,
    isoYear: number,
    isoWeek: number,
    threshold: number,
  ): string {
    return `weekly-warning:${userId}:${isoYear}:${isoWeek}:${threshold}`
  }

  hasCrossedWeeklyWarningThreshold(
    weeklyQuantityBefore: number,
    weeklyQuantityAfter: number,
    weeklyLimit: number,
    warningPercentage: number,
  ): boolean {
    const beforePercentage = Math.round(
      (weeklyQuantityBefore / weeklyLimit) * 100,
    )
    const afterPercentage = Math.round(
      (weeklyQuantityAfter / weeklyLimit) * 100,
    )

    return (
      beforePercentage < warningPercentage &&
      afterPercentage >= warningPercentage
    )
  }

  async createOrderConfirmationNotification(
    user: User,
    order: Order,
  ): Promise<void> {
    await this.notificationService.createTypedNotification({
      recipientUserId: user._id.toString(),
      recipientRole: UserRole.APOTHEKER,
      type: NotificationType.ORDER_CONFIRMATION,
      eventId: `order-confirmation:${order.id}`,
      interpolationData: {
        routeDate: order.deliveryDate,
        doseCount: order.totalQuantity,
        orderReference: String(order.id),
      },
      sourceEntityType: 'order',
      sourceEntityId: String(order.id),
      actionPath: this.requireInternalPath(ACTION_APOTHEKER_ORDERS),
    })
  }

  async createWeeklyWarningNotificationIfCrossed(
    user: User,
    order: Order,
    weeklyQuantityBefore: number,
    settings: ApplicationSettings,
  ): Promise<void> {
    const weeklyQuantityAfter = weeklyQuantityBefore + order.totalQuantity

    if (
      !this.hasCrossedWeeklyWarningThreshold(
        weeklyQuantityBefore,
        weeklyQuantityAfter,
        settings.weeklyDoseCap,
        settings.weeklyWarningPercentage,
      )
    ) {
      return
    }

    const afterPercentage = Math.min(
      100,
      Math.round((weeklyQuantityAfter / settings.weeklyDoseCap) * 100),
    )

    await this.notificationService.createTypedNotification({
      recipientUserId: user._id.toString(),
      recipientRole: UserRole.APOTHEKER,
      type: NotificationType.WEEK_LIMIT_WARNING,
      eventId: this.buildWeeklyWarningDeduplicationKey(
        user._id.toString(),
        order.isoYear,
        order.isoWeek,
        settings.weeklyWarningPercentage,
      ),
      interpolationData: {
        warningPercentage: afterPercentage,
        weeklyDoseCap: settings.weeklyDoseCap,
        orderReference: String(order.id),
      },
      sourceEntityType: 'order',
      sourceEntityId: String(order.id),
      actionPath: this.requireInternalPath(ACTION_APOTHEKER_ORDERS),
    })
  }

  async createOrderCancelledNotification(
    user: User,
    order: Order,
  ): Promise<void> {
    await this.notificationService.createTypedNotification({
      recipientUserId: user._id.toString(),
      recipientRole: UserRole.APOTHEKER,
      type: NotificationType.ORDER_CANCELLED,
      eventId: `order-cancelled:${order.id}`,
      interpolationData: {
        routeDate: order.deliveryDate,
        orderReference: String(order.id),
      },
      sourceEntityType: 'order',
      sourceEntityId: String(order.id),
      actionPath: this.requireInternalPath(ACTION_APOTHEKER_ORDERS),
    })
  }

  async createOrderDeliveredNotification(order: Order): Promise<void> {
    await this.notificationService.createTypedNotification({
      recipientUserId: order.apothekerId.toString(),
      recipientRole: UserRole.APOTHEKER,
      type: NotificationType.ORDER_DELIVERED,
      eventId: `order-delivered:${order.id}`,
      interpolationData: {
        routeDate: order.deliveryDate,
        orderReference: String(order.id),
      },
      sourceEntityType: 'order',
      sourceEntityId: String(order.id),
      actionPath: this.requireInternalPath(ACTION_APOTHEKER_ORDERS),
    })
  }

  async createAdminCancelledOrderNotification(order: Order): Promise<void> {
    await this.notificationService.createTypedNotification({
      recipientUserId: order.apothekerId.toString(),
      recipientRole: UserRole.APOTHEKER,
      type: NotificationType.ORDER_CANCELLED,
      eventId: `order-cancelled:${order.id}`,
      bodyKey: 'notifications.apotheker.orderCancelledByAdmin.body',
      interpolationData: {
        routeDate: order.deliveryDate,
        orderReference: String(order.id),
      },
      sourceEntityType: 'order',
      sourceEntityId: String(order.id),
      actionPath: this.requireInternalPath(ACTION_APOTHEKER_ORDERS),
    })
  }

  async handleOrderCreated(
    user: User,
    order: Order,
    weeklyQuantityBefore: number,
    settings: ApplicationSettings,
  ): Promise<void> {
    await this.createOrderConfirmationNotification(user, order)
    await this.createWeeklyWarningNotificationIfCrossed(
      user,
      order,
      weeklyQuantityBefore,
      settings,
    )
  }

  private requireInternalPath(path: string): string {
    const safe = sanitizeInternalActionPath(path)
    if (!safe) {
      throw new Error(`Invalid notification action path: ${path}`)
    }
    return safe
  }
}

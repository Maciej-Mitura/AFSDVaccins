import { Injectable } from '@nestjs/common'

import { ApplicationSettings } from '../settings/settings.entity'
import { User } from '../user/user.entity'
import { Order } from '../order/order.entity'
import { NotificationType } from './notification-type.enum'
import { NotificationService } from './notification.service'

@Injectable()
export class OrderNotificationService {
  constructor(private readonly notificationService: NotificationService) {}

  private formatDeliveryDate(value: string): string {
    const [year, month, day] = value.split('-')
    return `${day}/${month}/${year}`
  }

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
    await this.notificationService.createNotification({
      recipientUserId: user._id.toString(),
      type: NotificationType.ORDER_CONFIRMATION,
      title: 'Bestelling geplaatst',
      body: `Bestelling ${order.id} met ${order.totalQuantity} dosissen wordt geleverd op ${this.formatDeliveryDate(order.deliveryDate)}.`,
      relatedOrderId: order.id,
      deduplicationKey: `order-confirmation:${order.id}`,
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

    await this.notificationService.createNotification({
      recipientUserId: user._id.toString(),
      type: NotificationType.WEEK_LIMIT_WARNING,
      title: 'Weekwaarschuwing bereikt',
      body: `Je hebt ${afterPercentage}% van het weekmaximum (${settings.weeklyDoseCap} dosissen) bereikt.`,
      relatedOrderId: order.id,
      deduplicationKey: this.buildWeeklyWarningDeduplicationKey(
        user._id.toString(),
        order.isoYear,
        order.isoWeek,
        settings.weeklyWarningPercentage,
      ),
    })
  }

  async createOrderCancelledNotification(
    user: User,
    order: Order,
  ): Promise<void> {
    await this.notificationService.createNotification({
      recipientUserId: user._id.toString(),
      type: NotificationType.ORDER_CANCELLED,
      title: 'Bestelling geannuleerd',
      body: `Bestelling ${order.id} is geannuleerd.`,
      relatedOrderId: order.id,
      deduplicationKey: `order-cancelled:${order.id}`,
    })
  }

  async createOrderDeliveredNotification(order: Order): Promise<void> {
    await this.notificationService.createNotification({
      recipientUserId: order.apothekerId.toString(),
      type: NotificationType.ORDER_DELIVERED,
      title: 'Bestelling geleverd',
      body: `Bestelling ${order.id} is geleverd op ${this.formatDeliveryDate(order.deliveryDate)}.`,
      relatedOrderId: order.id,
      deduplicationKey: `order-delivered:${order.id}`,
    })
  }

  async createAdminCancelledOrderNotification(order: Order): Promise<void> {
    await this.notificationService.createNotification({
      recipientUserId: order.apothekerId.toString(),
      type: NotificationType.ORDER_CANCELLED,
      title: 'Bestelling geannuleerd',
      body: `Bestelling ${order.id} is geannuleerd door de beheerder.`,
      relatedOrderId: order.id,
      deduplicationKey: `order-cancelled:${order.id}`,
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
}

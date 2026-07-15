import { Injectable } from '@nestjs/common'

import { NotificationType } from '../notifications/notification-type.enum'
import { NotificationService } from '../notifications/notification.service'
import { UserRole } from '../user/user-role.enum'
import { UserService } from '../user/user.service'
import { Vaccine } from '../vaccine/vaccine.entity'

@Injectable()
export class StockNotificationService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
  ) {}

  hasEnteredLowStock(
    quantityBefore: number,
    quantityAfter: number,
    stockWarningThreshold: number,
  ): boolean {
    return (
      quantityBefore > stockWarningThreshold &&
      quantityAfter <= stockWarningThreshold
    )
  }

  buildLowStockEpisodeKey(vaccineId: string, crossingAdjustmentId: string): string {
    return `low-stock:${vaccineId}:${crossingAdjustmentId}`
  }

  async notifyAdminsIfEnteredLowStock(
    vaccine: Vaccine,
    quantityBefore: number,
    quantityAfter: number,
    crossingAdjustmentId: string,
  ): Promise<void> {
    if (
      !this.hasEnteredLowStock(
        quantityBefore,
        quantityAfter,
        vaccine.stockWarningThreshold,
      )
    ) {
      return
    }

    const admins = await this.userService.findUsersByRole(UserRole.ADMIN)
    const deduplicationKey = this.buildLowStockEpisodeKey(
      vaccine._id.toString(),
      crossingAdjustmentId,
    )

    await Promise.all(
      admins.map(admin =>
        this.notificationService.createNotification({
          recipientUserId: admin._id.toString(),
          type: NotificationType.LOW_STOCK_WARNING,
          title: 'Lage voorraad',
          body: `${vaccine.name} heeft nog ${quantityAfter} dosissen (drempel: ${vaccine.stockWarningThreshold}).`,
          deduplicationKey,
        }),
      ),
    )
  }
}

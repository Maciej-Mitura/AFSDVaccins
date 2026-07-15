import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { CLOCK } from '../order/clock.provider'
import type { Clock } from '../order/clock.provider'
import { User } from '../user/user.entity'
import { NotificationNotFoundException } from './exceptions/notification.exceptions'
import { NotificationType } from './notification-type.enum'
import { NotificationEventsService } from './notification-events.service'
import { Notification } from './notification.entity'

export type CreateNotificationInput = {
  recipientUserId: string
  type: NotificationType
  title: string
  body: string
  relatedOrderId?: string | null
  deduplicationKey?: string | null
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: MongoRepository<Notification>,
    private readonly notificationEventsService: NotificationEventsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async findByDeduplicationKey(
    deduplicationKey: string,
  ): Promise<Notification | null> {
    return this.notificationRepository.findOne({
      where: { deduplicationKey },
    })
  }

  async createNotification(
    input: CreateNotificationInput,
  ): Promise<Notification> {
    if (input.deduplicationKey) {
      const existing = await this.findByDeduplicationKey(input.deduplicationKey)

      if (existing) {
        return existing
      }
    }

    const notification = this.notificationRepository.create({
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      relatedOrderId: input.relatedOrderId ?? null,
      deduplicationKey: input.deduplicationKey ?? null,
      readAt: null,
    })

    const saved = await this.notificationRepository.save(notification)
    await this.notificationEventsService.publishNotificationReceived(saved)

    return saved
  }

  async findMyNotifications(
    user: User,
    unreadOnly = false,
  ): Promise<Notification[]> {
    const where: Record<string, unknown> = {
      recipientUserId: user._id.toString(),
    }

    if (unreadOnly) {
      where.readAt = null
    }

    return this.notificationRepository.find({
      where,
      order: { createdAt: 'DESC' },
    })
  }

  async countUnread(user: User): Promise<number> {
    return this.notificationRepository.count({
      where: {
        recipientUserId: user._id.toString(),
        readAt: null,
      },
    })
  }

  async markNotificationRead(user: User, id: string): Promise<Notification> {
    if (!ObjectId.isValid(id)) {
      throw new NotificationNotFoundException()
    }

    const notification = await this.notificationRepository.findOne({
      where: { _id: new ObjectId(id) },
    })

    if (
      !notification ||
      notification.recipientUserId.toString() !== user._id.toString()
    ) {
      throw new NotificationNotFoundException()
    }

    if (notification.readAt) {
      return notification
    }

    notification.readAt = this.clock.now()

    return this.notificationRepository.save(notification)
  }
}

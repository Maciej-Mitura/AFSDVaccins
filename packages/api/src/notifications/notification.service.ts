import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { CLOCK } from '../order/clock.provider'
import type { Clock } from '../order/clock.provider'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { NotificationNotFoundException } from './exceptions/notification.exceptions'
import { sanitizeInterpolationData } from './notification-interpolation'
import {
  assertRecipientRoleCompatible,
  getNotificationTaxonomy,
  isPhase27ANotificationType,
  resolveDefaultActionPath,
  type NotificationInterpolationData,
} from './notification-taxonomy'
import { canReceiveNotification } from './notification-subscription.filter'
import { NotificationType } from './notification-type.enum'
import { NotificationEventsService } from './notification-events.service'
import { Notification } from './notification.entity'

/** Legacy create path used by order/stock emitters (Dutch title/body). */
export type CreateNotificationInput = {
  recipientUserId: string
  type: NotificationType
  title: string
  body: string
  relatedOrderId?: string | null
  /** @deprecated Prefer eventId */
  deduplicationKey?: string | null
  eventId?: string | null
  recipientRole?: UserRole | null
}

/** Phase 27A create path — taxonomy-driven keys, no translated copy. */
export type CreateTypedNotificationInput = {
  recipientUserId: string
  recipientRole: UserRole
  type: NotificationType
  eventId: string
  interpolationData?: Record<string, unknown> | null
  sourceEntityType?: string | null
  sourceEntityId?: string | null
  actionPath?: string | null
  expiresAt?: Date | null
}

export type CreateTypedNotificationResult = {
  notification: Notification
  /** False when an existing (recipientUserId, eventId) row was returned. */
  created: boolean
}

export const MY_NOTIFICATIONS_DEFAULT_LIMIT = 50
export const MY_NOTIFICATIONS_MAX_LIMIT = 100

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: MongoRepository<Notification>,
    private readonly notificationEventsService: NotificationEventsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async findByRecipientAndEventId(
    recipientUserId: string,
    eventId: string,
  ): Promise<Notification | null> {
    return this.notificationRepository.findOne({
      where: {
        recipientUserId,
        eventId,
      },
    })
  }

  private async findByDeduplicationKey(
    deduplicationKey: string,
  ): Promise<Notification | null> {
    return this.notificationRepository.findOne({
      where: { deduplicationKey },
    })
  }

  /**
   * Legacy emitter path (order/stock). Dual-writes eventId from deduplicationKey
   * so Phase 27A uniqueness (recipient + eventId) applies going forward.
   */
  async createNotification(
    input: CreateNotificationInput,
  ): Promise<Notification> {
    const eventId = input.eventId ?? input.deduplicationKey ?? null

    if (eventId) {
      const existingByEvent = await this.findByRecipientAndEventId(
        input.recipientUserId,
        eventId,
      )

      if (existingByEvent) {
        return existingByEvent
      }
    }

    if (input.deduplicationKey) {
      const existing = await this.findByDeduplicationKey(input.deduplicationKey)

      if (existing) {
        return existing
      }
    }

    const now = this.clock.now()
    const notification = this.notificationRepository.create({
      recipientUserId: input.recipientUserId,
      recipientRole: input.recipientRole ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      titleKey: null,
      bodyKey: null,
      interpolationData: null,
      relatedOrderId: input.relatedOrderId ?? null,
      // Omit null deduplicationKey so Mongo sparse unique index ignores those rows.
      ...(input.deduplicationKey
        ? { deduplicationKey: input.deduplicationKey }
        : {}),
      // Omit null eventId so Mongo partial unique index can ignore legacy/null rows.
      ...(eventId ? { eventId } : {}),
      sourceEntityType: input.relatedOrderId ? 'order' : null,
      sourceEntityId: input.relatedOrderId ?? null,
      actionPath: null,
      deliveryState: {
        inAppCreatedAt: now,
        pushRequestedAt: null,
        pushDeliveredAt: null,
        pushFailureCode: null,
      },
      expiresAt: null,
      readAt: null,
    })

    const saved = await this.notificationRepository.save(notification)
    await this.notificationEventsService.publishNotificationReceived(saved)

    return saved
  }

  /**
   * Canonical Phase 27A/27C creation entry.
   * Persists i18n keys (not translated text), idempotent by recipient + eventId.
   * Publishes realtime only; does not automatically request OS push.
   * `created` is false when an existing (recipient, eventId) row is returned.
   */
  async createTypedNotification(
    input: CreateTypedNotificationInput,
  ): Promise<CreateTypedNotificationResult> {
    if (!isPhase27ANotificationType(input.type)) {
      throw new Error(
        `createTypedNotification requires a Phase 27A type, got ${input.type}`,
      )
    }

    assertRecipientRoleCompatible(input.type, input.recipientRole)

    const eventId = input.eventId.trim()

    if (!eventId || eventId.length > 200) {
      throw new Error('eventId must be a non-empty string up to 200 characters')
    }

    const existing = await this.findByRecipientAndEventId(
      input.recipientUserId,
      eventId,
    )

    if (existing) {
      return { notification: existing, created: false }
    }

    const taxonomy = getNotificationTaxonomy(input.type)!
    const interpolationData = sanitizeInterpolationData(
      input.type,
      input.interpolationData,
    )
    const now = this.clock.now()
    const actionPath =
      input.actionPath ?? resolveDefaultActionPath(input.type) ?? null

    const notification = this.notificationRepository.create({
      recipientUserId: input.recipientUserId,
      recipientRole: input.recipientRole,
      type: input.type,
      // GraphQL/UI compatibility: expose keys until the Notifications tab resolves i18n.
      title: taxonomy.titleKey,
      body: taxonomy.bodyKey,
      titleKey: taxonomy.titleKey,
      bodyKey: taxonomy.bodyKey,
      interpolationData: interpolationData
        ? this.toInterpolationFields(interpolationData)
        : null,
      relatedOrderId: null,
      // Omit null deduplicationKey so Mongo sparse unique index ignores typed rows.
      eventId,
      sourceEntityType: input.sourceEntityType ?? null,
      sourceEntityId: input.sourceEntityId ?? null,
      actionPath,
      deliveryState: {
        inAppCreatedAt: now,
        pushRequestedAt: null,
        pushDeliveredAt: null,
        pushFailureCode: null,
      },
      expiresAt: input.expiresAt ?? null,
      readAt: null,
    })

    const saved = await this.notificationRepository.save(notification)
    await this.notificationEventsService.publishNotificationReceived(saved)

    return { notification: saved, created: true }
  }

  private toInterpolationFields(data: NotificationInterpolationData) {
    return {
      routeDate: data.routeDate != null ? String(data.routeDate) : null,
      pharmacyName:
        data.pharmacyName != null ? String(data.pharmacyName) : null,
      city: data.city != null ? String(data.city) : null,
      orderReference:
        data.orderReference != null ? String(data.orderReference) : null,
      orderCount:
        data.orderCount != null ? Number(data.orderCount) : null,
      stopCount: data.stopCount != null ? Number(data.stopCount) : null,
    }
  }

  async findMyNotifications(
    user: User,
    unreadOnly = false,
    limit = MY_NOTIFICATIONS_DEFAULT_LIMIT,
  ): Promise<Notification[]> {
    const where: Record<string, unknown> = {
      recipientUserId: user._id.toString(),
    }

    if (unreadOnly) {
      where.readAt = null
    }

    const boundedLimit = Math.min(
      Math.max(1, limit),
      MY_NOTIFICATIONS_MAX_LIMIT,
    )

    return this.notificationRepository
      .find({
        where,
        order: { createdAt: 'DESC' },
        take: boundedLimit,
      })
      .then(notifications =>
        notifications.filter(notification =>
          canReceiveNotification(user, notification),
        ),
      )
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

  async markAllNotificationsRead(user: User): Promise<number> {
    const unread = await this.notificationRepository.find({
      where: {
        recipientUserId: user._id.toString(),
        readAt: null,
      },
    })

    const now = this.clock.now()
    let updated = 0

    for (const notification of unread) {
      if (!canReceiveNotification(user, notification)) {
        continue
      }

      if (notification.readAt) {
        continue
      }

      notification.readAt = now
      await this.notificationRepository.save(notification)
      updated += 1
    }

    return updated
  }

  async recordPushRequested(notificationId: string): Promise<void> {
    if (!ObjectId.isValid(notificationId)) {
      return
    }

    const notification = await this.notificationRepository.findOne({
      where: { _id: new ObjectId(notificationId) },
    })

    if (!notification) {
      return
    }

    const now = this.clock.now()
    notification.deliveryState = {
      inAppCreatedAt:
        notification.deliveryState?.inAppCreatedAt ?? notification.createdAt,
      pushRequestedAt: now,
      pushDeliveredAt: notification.deliveryState?.pushDeliveredAt ?? null,
      pushFailureCode: notification.deliveryState?.pushFailureCode ?? null,
    }

    await this.notificationRepository.save(notification)
  }

  async recordPushOutcome(
    notificationId: string,
    outcome: { delivered: boolean; failureCode?: string | null },
  ): Promise<void> {
    if (!ObjectId.isValid(notificationId)) {
      return
    }

    const notification = await this.notificationRepository.findOne({
      where: { _id: new ObjectId(notificationId) },
    })

    if (!notification) {
      return
    }

    const now = this.clock.now()
    notification.deliveryState = {
      inAppCreatedAt:
        notification.deliveryState?.inAppCreatedAt ?? notification.createdAt,
      pushRequestedAt: notification.deliveryState?.pushRequestedAt ?? now,
      pushDeliveredAt: outcome.delivered
        ? now
        : (notification.deliveryState?.pushDeliveredAt ?? null),
      pushFailureCode: outcome.delivered
        ? null
        : (outcome.failureCode ?? 'PUSH_FAILED'),
    }

    await this.notificationRepository.save(notification)
  }
}

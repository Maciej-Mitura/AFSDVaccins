import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { CLOCK } from '../order/clock.provider'
import type { Clock } from '../order/clock.provider'
import { getZonedDateParts } from '../order/delivery-date.util'
import { Order } from '../order/order.entity'
import { ApothekerProfileService } from '../profile/apotheker/apotheker-profile.service'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import { NotificationDeliveryPolicyService } from '../push/notification-delivery-policy.service'
import { DeliveryRoute } from '../routes/delivery-route.entity'
import { DeliveryStop } from '../routes/delivery-stop.embed'
import { RouteStatus } from '../routes/route-status.enum'
import { DEFAULT_TIMEZONE } from '../settings/settings.constants'
import { UserRole } from '../user/user-role.enum'
import { UserService } from '../user/user.service'
import {
  buildAdminNewOrderEventId,
  buildApothekerDeliveryConfirmedEventId,
  buildApothekerNextStopEventId,
  buildApothekerRouteStartedEventId,
  buildBezorgerRouteAssignedEventId,
} from './business-notification-event-ids'
import { sanitizeInternalActionPath } from './notification-action-path'
import {
  CreateTypedNotificationInput,
  NotificationService,
} from './notification.service'
import { NotificationType } from './notification-type.enum'
import {
  isStopDelivered,
  selectNextUndeliveredStop,
} from './next-stop-selection'
import {
  buildRouteDateReminderEventId,
  shouldSkipSameDayRouteDateReminder,
} from './schedule/route-date-reminder.policy'

const ACTION_ADMIN_ORDERS = '/admin/orders'
const ACTION_BEZORGER_TODAY = '/bezorger/today'
const ACTION_APOTHEKER_ORDERS = '/apotheker/orders'

/**
 * Central Phase 27C domain notification producer.
 *
 * Creates typed notifications + invokes push delivery policy.
 * Never fails the core business transaction solely because push failed.
 * Notification persistence failures are logged and swallowed so the domain
 * action can still succeed (observable via logs).
 *
 * Revocation: when a route is reassigned to a different courier, the old
 * courier does **not** receive a revocation notification (out of scope).
 */
@Injectable()
export class BusinessNotificationProducerService {
  private readonly logger = new Logger(BusinessNotificationProducerService.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly deliveryPolicy: NotificationDeliveryPolicyService,
    private readonly userService: UserService,
    private readonly apothekerProfileService: ApothekerProfileService,
    private readonly bezorgerProfileService: BezorgerProfileService,
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async notifyAdminsNewOrder(order: Order): Promise<void> {
    try {
      const admins = await this.userService.findUsersByRole(UserRole.ADMIN)
      const profile = await this.apothekerProfileService.findByUserId(
        order.apothekerId.toString(),
      )
      const pharmacyName = profile?.pharmacyName?.trim() || ''
      const orderReference = String(order.id)
      const orderCount =
        order.orderLines?.length ??
        (order.totalQuantity != null ? 1 : 0)
      const eventId = buildAdminNewOrderEventId(orderReference)
      const actionPath = this.requireInternalPath(ACTION_ADMIN_ORDERS)

      await Promise.all(
        admins.map(admin =>
          this.persistAndDeliver({
            recipientUserId: admin._id.toString(),
            recipientRole: UserRole.ADMIN,
            type: NotificationType.ADMIN_NEW_ORDER,
            eventId,
            interpolationData: {
              orderReference,
              orderCount,
              ...(pharmacyName ? { pharmacyName } : {}),
              routeDate: order.deliveryDate,
            },
            sourceEntityType: 'order',
            sourceEntityId: orderReference,
            actionPath,
          }),
        ),
      )
    } catch (error) {
      this.logProducerFailure('ADMIN_NEW_ORDER', {
        orderId: order.id,
        error: this.boundedError(error),
      })
    }
  }

  async notifyCourierRouteAssigned(route: DeliveryRoute): Promise<void> {
    try {
      const profile = await this.bezorgerProfileService.findBezorgerProfileById(
        route.bezorgerProfileId,
      )
      const courierUserId = profile.userId.toString()
      const stopCount = route.stops?.length ?? 0
      const eventId = buildBezorgerRouteAssignedEventId(route.id, courierUserId)
      const actionPath = this.requireInternalPath(ACTION_BEZORGER_TODAY)

      await this.persistAndDeliver({
        recipientUserId: courierUserId,
        recipientRole: UserRole.BEZORGER,
        type: NotificationType.BEZORGER_ROUTE_ASSIGNED,
        eventId,
        interpolationData: {
          routeDate: route.deliveryDate,
          stopCount,
        },
        sourceEntityType: 'delivery_route',
        sourceEntityId: route.id,
        actionPath,
      })
    } catch (error) {
      this.logProducerFailure('BEZORGER_ROUTE_ASSIGNED', {
        routeId: route.id,
        error: this.boundedError(error),
      })
    }
  }

  async notifyPharmacyRouteStarted(route: DeliveryRoute): Promise<void> {
    try {
      const actionPath = this.requireInternalPath(ACTION_APOTHEKER_ORDERS)
      const eligibleStops = (route.stops ?? []).filter(
        stop => !isStopDelivered(stop) && Boolean(stop.stopId),
      )

      // One notification per stop (multi-order stops already aggregated).
      await Promise.all(
        eligibleStops.map(stop =>
          this.persistAndDeliver({
            recipientUserId: stop.apothekerUserId,
            recipientRole: UserRole.APOTHEKER,
            type: NotificationType.APOTHEKER_ROUTE_STARTED,
            eventId: buildApothekerRouteStartedEventId(route.id, stop.stopId!),
            interpolationData: {
              routeDate: route.deliveryDate,
              pharmacyName: stop.pharmacyName,
              ...(stop.address?.city?.trim()
                ? { city: stop.address.city.trim() }
                : {}),
            },
            sourceEntityType: 'delivery_route',
            sourceEntityId: route.id,
            actionPath,
          }),
        ),
      )
    } catch (error) {
      this.logProducerFailure('APOTHEKER_ROUTE_STARTED', {
        routeId: route.id,
        error: this.boundedError(error),
      })
    }
  }

  /**
   * Notify the next higher-sequence undelivered pharmacy after a stop is confirmed.
   * City comes from route lastKnownLocation (Phase 30A) when present, else the
   * completed stop’s snapshotted address city (no GPS).
   *
   * Uses the central next-stop derivation — pass `nextStop` when already derived
   * by DeliveryRouteProgressLocationService to avoid a second algorithm.
   */
  async notifyNextPharmacy(
    route: DeliveryRoute,
    completedStop: DeliveryStop,
    nextStopOverride?: DeliveryStop | null,
  ): Promise<void> {
    try {
      if (!completedStop.stopId) {
        return
      }

      const nextStop =
        nextStopOverride !== undefined
          ? nextStopOverride
          : selectNextUndeliveredStop(route.stops ?? [], completedStop)

      if (!nextStop?.stopId || !nextStop.apothekerUserId) {
        return
      }

      const lastKnownCourierCity =
        route.lastKnownLocation?.city?.trim() ||
        completedStop.address?.city?.trim()
      if (!lastKnownCourierCity) {
        this.logger.warn({
          event: 'business_notification_next_stop_missing_city',
          routeId: route.id,
          completedStopId: completedStop.stopId,
        })
      }

      const actionPath = this.requireInternalPath(ACTION_APOTHEKER_ORDERS)

      await this.persistAndDeliver({
        recipientUserId: nextStop.apothekerUserId,
        recipientRole: UserRole.APOTHEKER,
        type: NotificationType.APOTHEKER_NEXT_STOP,
        eventId: buildApothekerNextStopEventId(
          route.id,
          completedStop.stopId,
          nextStop.stopId,
        ),
        interpolationData: {
          pharmacyName: nextStop.pharmacyName,
          routeDate: route.deliveryDate,
          ...(lastKnownCourierCity
            ? { city: lastKnownCourierCity }
            : {}),
        },
        sourceEntityType: 'delivery_route',
        sourceEntityId: route.id,
        actionPath,
      })
    } catch (error) {
      this.logProducerFailure('APOTHEKER_NEXT_STOP', {
        routeId: route.id,
        completedStopId: completedStop.stopId,
        error: this.boundedError(error),
      })
    }
  }

  async notifyPharmacyDeliveryConfirmed(input: {
    route: DeliveryRoute
    stop: DeliveryStop
    confirmationEventId: string
    orderCount: number
  }): Promise<void> {
    try {
      const { route, stop, confirmationEventId, orderCount } = input
      const actionPath = this.requireInternalPath(ACTION_APOTHEKER_ORDERS)
      const orderReference =
        stop.orderIds?.[0] ?? confirmationEventId.slice(0, 24)

      await this.persistAndDeliver({
        recipientUserId: stop.apothekerUserId,
        recipientRole: UserRole.APOTHEKER,
        type: NotificationType.APOTHEKER_DELIVERY_CONFIRMED,
        eventId: buildApothekerDeliveryConfirmedEventId(confirmationEventId),
        interpolationData: {
          pharmacyName: stop.pharmacyName,
          routeDate: route.deliveryDate,
          orderCount,
          orderReference,
        },
        sourceEntityType: 'delivery_confirmation',
        sourceEntityId: confirmationEventId,
        actionPath,
      })
    } catch (error) {
      this.logProducerFailure('APOTHEKER_DELIVERY_CONFIRMED', {
        confirmationEventId: input.confirmationEventId,
        error: this.boundedError(error),
      })
    }
  }

  /**
   * Daily 08:00 Europe/Brussels tick — notify couriers for today’s routes.
   * Skips same-day assignments at/after 08:00, completed/cancelled/unassigned,
   * and relies on eventId uniqueness across restarts and replicas.
   */
  async notifyCourierRouteDateRemindersForLocalDate(
    localDate: string = this.currentBrusselsDate(),
  ): Promise<void> {
    try {
      const routes = await this.deliveryRouteRepository.find({
        where: {
          deliveryDate: localDate,
          status: {
            $in: [RouteStatus.ASSIGNED, RouteStatus.IN_PROGRESS],
          },
        },
      })

      for (const route of routes) {
        await this.notifyCourierRouteDateReminder(route)
      }
    } catch (error) {
      this.logProducerFailure('BEZORGER_ROUTE_DATE_REMINDER_BATCH', {
        localDate,
        error: this.boundedError(error),
      })
    }
  }

  async notifyCourierRouteDateReminder(route: DeliveryRoute): Promise<void> {
    try {
      if (
        route.status === RouteStatus.COMPLETED ||
        route.status === RouteStatus.CANCELLED
      ) {
        return
      }

      if (!route.bezorgerProfileId) {
        return
      }

      const assignedAt = route.generatedAt ?? route.createdAt
      if (
        assignedAt &&
        shouldSkipSameDayRouteDateReminder(assignedAt, route.deliveryDate)
      ) {
        return
      }

      const profile = await this.bezorgerProfileService.findBezorgerProfileById(
        route.bezorgerProfileId,
      )
      const courierUserId = profile.userId.toString()
      const stopCount = route.stops?.length ?? 0
      const eventId = buildRouteDateReminderEventId(
        courierUserId,
        route.id,
        route.deliveryDate,
      )
      const actionPath = this.requireInternalPath(ACTION_BEZORGER_TODAY)

      await this.persistAndDeliver({
        recipientUserId: courierUserId,
        recipientRole: UserRole.BEZORGER,
        type: NotificationType.BEZORGER_ROUTE_DATE_REMINDER,
        eventId,
        interpolationData: {
          routeDate: route.deliveryDate,
          stopCount,
        },
        sourceEntityType: 'delivery_route',
        sourceEntityId: route.id,
        actionPath,
      })
    } catch (error) {
      this.logProducerFailure('BEZORGER_ROUTE_DATE_REMINDER', {
        routeId: route.id,
        error: this.boundedError(error),
      })
    }
  }

  private currentBrusselsDate(): string {
    const parts = getZonedDateParts(this.clock.now(), DEFAULT_TIMEZONE)
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
  }

  private requireInternalPath(path: string): string {
    const safe = sanitizeInternalActionPath(path)

    if (!safe) {
      throw new Error(`Invalid notification action path: ${path}`)
    }

    return safe
  }

  /**
   * Persist (idempotent) then push only for newly created notifications.
   * Push failures are logged and do not propagate.
   */
  private async persistAndDeliver(
    input: CreateTypedNotificationInput,
  ): Promise<void> {
    const { notification, created } =
      await this.notificationService.createTypedNotification(input)

    if (!created) {
      return
    }

    try {
      await this.deliveryPolicy.requestPushDelivery(notification)
    } catch (error) {
      this.logger.warn({
        event: 'business_notification_push_failed',
        type: input.type,
        notificationId: notification.id,
        error: this.boundedError(error),
      })
    }
  }

  private logProducerFailure(
    type: string,
    details: Record<string, unknown>,
  ): void {
    this.logger.error({
      event: 'business_notification_producer_failed',
      type,
      ...details,
    })
  }

  /** Never log endpoints, tokens, or subscription secrets. */
  private boundedError(error: unknown): { name?: string; message: string } {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message.slice(0, 200),
      }
    }

    return { message: 'unknown_error' }
  }
}

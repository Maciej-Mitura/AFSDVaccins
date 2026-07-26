import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { BusinessNotificationProducerService } from '../notifications/business-notification-producer.service'
import { GraphqlRequestContext } from '../authentication/firebase.types'
import { getApplicationUser } from '../authentication/graphql-auth.context'
import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import type { Clock } from '../order/clock.provider'
import { CLOCK } from '../order/clock.provider'
import { getLocalCalendarDate } from '../order/delivery-date.util'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import { BezorgerProfileNotFoundException } from '../profile/exceptions/profile.exceptions'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { canReceiveBezorgerRouteUpdate } from './bezorger-route-subscription.filter'
import { isValidDeliveryDateString } from './delivery-date-validation.util'
import { DeliveryRoute } from './delivery-route.entity'
import { DeliveryRouteEventsService } from './delivery-route-events.service'
import {
  DeliveryRouteForbiddenException,
  DeliveryRouteNotFoundException,
  InvalidDeliveryDateException,
  InvalidRouteStatusTransitionException,
  RouteCannotBeCancelledException,
} from './exceptions/delivery-route.exceptions'
import { RouteGenerationService } from './route-generation.service'
import { RoutePreviewService } from './route-preview.service'
import { RoutePreview } from './route-preview.type'
import { RouteStatus } from './route-status.enum'
import {
  canBezorgerTransitionRouteStatus,
  canCancelRoute,
  canTransitionRouteStatus,
} from './route-status.policy'
import { RouteStatusHistoryEntry } from './route-status-history.type'

@Injectable()
export class RoutesService {
  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    private readonly routeGenerationService: RouteGenerationService,
    private readonly routePreviewService: RoutePreviewService,
    private readonly deliveryRouteEventsService: DeliveryRouteEventsService,
    private readonly businessNotificationProducer: BusinessNotificationProducerService,
    private readonly bezorgerProfileService: BezorgerProfileService,
    private readonly settingsService: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async generateDeliveryRoute(
    admin: User,
    routeTemplateId: string,
    deliveryDate: string,
  ): Promise<DeliveryRoute> {
    return this.routeGenerationService.generateDeliveryRoute(
      admin,
      routeTemplateId,
      deliveryDate,
    )
  }

  async findDeliveryRoutes(filter?: {
    deliveryDate?: string
    bezorgerProfileId?: string
  }): Promise<DeliveryRoute[]> {
    const where: Record<string, string> = {}

    if (filter?.deliveryDate !== undefined) {
      if (!isValidDeliveryDateString(filter.deliveryDate)) {
        throw new InvalidDeliveryDateException()
      }

      where.deliveryDate = filter.deliveryDate
    }

    if (filter?.bezorgerProfileId !== undefined) {
      const parsed = tryParseGraphqlObjectId(filter.bezorgerProfileId)

      if (!parsed) {
        return []
      }

      where.bezorgerProfileId = parsed.stringValue
    }

    return this.deliveryRouteRepository.find({
      where,
      order: { deliveryDate: 'DESC', generatedAt: 'DESC' },
    })
  }

  async findDeliveryRouteById(id: string): Promise<DeliveryRoute> {
    const parsed = tryParseGraphqlObjectId(id)

    if (!parsed) {
      throw new DeliveryRouteNotFoundException()
    }

    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsed.objectId },
    })

    if (!route) {
      throw new DeliveryRouteNotFoundException()
    }

    return route
  }

  async findMyTodayRoute(user: User): Promise<DeliveryRoute | null> {
    if (user.role !== UserRole.BEZORGER) {
      throw new DeliveryRouteForbiddenException()
    }

    const profile = await this.bezorgerProfileService.findByUserId(
      user._id.toString(),
    )

    if (!profile) {
      throw new BezorgerProfileNotFoundException()
    }

    const settings = await this.settingsService.getApplicationSettings()
    const today = getLocalCalendarDate(this.clock.now(), settings.timezone)

    return this.routeGenerationService.findByBezorgerAndDate(
      profile.id.toString(),
      today,
    )
  }

  async findMyTomorrowRoutePreview(user: User): Promise<RoutePreview> {
    return this.routePreviewService.computeTomorrowPreview(user)
  }

  /**
   * Controlled route FSM transition. Does not modify orders or stock.
   * Same-status requests are idempotent (no history append, no publish).
   */
  async updateRouteStatus(
    actor: User,
    id: string,
    targetStatus: RouteStatus,
    reason?: string | null,
  ): Promise<DeliveryRoute> {
    const route = await this.findDeliveryRouteById(id)
    await this.assertActorMayAccessRoute(actor, route)

    if (route.status === targetStatus) {
      return route
    }

    this.assertTransitionAllowed(actor, route.status, targetStatus)

    const previousStatus = route.status
    const now = this.clock.now()
    const history = this.normalizeStatusHistory(route)
    const historyEntry: RouteStatusHistoryEntry = {
      fromStatus: previousStatus,
      toStatus: targetStatus,
      changedAt: now,
      changedByUserId: actor._id.toString(),
      reason: reason?.trim() ? reason.trim() : null,
    }
    const nextHistory = [...history, historyEntry]

    const parsed = tryParseGraphqlObjectId(id)

    if (!parsed) {
      throw new DeliveryRouteNotFoundException()
    }

    const updatedDocument = await this.deliveryRouteRepository.findOneAndUpdate(
      {
        _id: parsed.objectId,
        status: previousStatus,
      },
      {
        $set: {
          status: targetStatus,
          statusHistory: nextHistory,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    )

    if (!updatedDocument) {
      const reloaded = await this.findDeliveryRouteById(id)

      if (reloaded.status === targetStatus) {
        return reloaded
      }

      this.assertTransitionAllowed(actor, reloaded.status, targetStatus)
      throw new InvalidRouteStatusTransitionException(
        reloaded.status,
        targetStatus,
      )
    }

    const saved = await this.findDeliveryRouteById(id)
    await this.deliveryRouteEventsService.publishBezorgerRouteUpdated(saved)

    if (
      previousStatus === RouteStatus.ASSIGNED &&
      targetStatus === RouteStatus.IN_PROGRESS
    ) {
      await this.businessNotificationProducer.notifyPharmacyRouteStarted(saved)
    }

    return saved
  }

  async filterRouteUpdateForSubscriber(
    context: GraphqlRequestContext,
    route: DeliveryRoute,
  ): Promise<boolean> {
    const user = getApplicationUser(context)

    if (!user) {
      return false
    }

    if (user.role !== UserRole.BEZORGER) {
      return false
    }

    const profile = await this.bezorgerProfileService.findByUserId(
      user._id.toString(),
    )

    return canReceiveBezorgerRouteUpdate(
      user,
      route,
      profile?.id ?? null,
    )
  }

  private assertTransitionAllowed(
    actor: User,
    fromStatus: RouteStatus,
    toStatus: RouteStatus,
  ): void {
    if (toStatus === RouteStatus.CANCELLED) {
      if (actor.role !== UserRole.ADMIN) {
        throw new DeliveryRouteForbiddenException()
      }

      if (!canCancelRoute(fromStatus)) {
        throw new RouteCannotBeCancelledException(fromStatus)
      }

      return
    }

    if (!canTransitionRouteStatus(fromStatus, toStatus)) {
      throw new InvalidRouteStatusTransitionException(fromStatus, toStatus)
    }

    if (actor.role === UserRole.BEZORGER) {
      if (!canBezorgerTransitionRouteStatus(fromStatus, toStatus)) {
        throw new DeliveryRouteForbiddenException()
      }
    } else if (actor.role !== UserRole.ADMIN) {
      throw new DeliveryRouteForbiddenException()
    }
  }

  private async assertActorMayAccessRoute(
    actor: User,
    route: DeliveryRoute,
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) {
      return
    }

    if (actor.role !== UserRole.BEZORGER) {
      throw new DeliveryRouteForbiddenException()
    }

    const profile = await this.bezorgerProfileService.findByUserId(
      actor._id.toString(),
    )

    if (!profile) {
      throw new BezorgerProfileNotFoundException()
    }

    if (route.bezorgerProfileId.toString() !== profile.id.toString()) {
      throw new DeliveryRouteForbiddenException()
    }
  }

  private normalizeStatusHistory(
    route: DeliveryRoute,
  ): RouteStatusHistoryEntry[] {
    if (Array.isArray(route.statusHistory) && route.statusHistory.length > 0) {
      return [...route.statusHistory]
    }

    return [
      {
        fromStatus: null,
        toStatus: route.status,
        changedAt: route.generatedAt ?? route.createdAt ?? this.clock.now(),
        changedByUserId: route.generatedByUserId ?? 'system',
        reason: 'Legacy route history normalized',
      },
    ]
  }
}

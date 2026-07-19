import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

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
import {
  DeliveryRouteForbiddenException,
  DeliveryRouteNotFoundException,
  InvalidDeliveryDateException,
} from './exceptions/delivery-route.exceptions'
import { RouteGenerationService } from './route-generation.service'
import { RoutePreviewService } from './route-preview.service'
import { RoutePreview } from './route-preview.type'

@Injectable()
export class RoutesService {
  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    private readonly routeGenerationService: RouteGenerationService,
    private readonly routePreviewService: RoutePreviewService,
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
}

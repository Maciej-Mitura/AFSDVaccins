import { Inject, Injectable } from '@nestjs/common'

import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import type { Clock } from '../order/clock.provider'
import { CLOCK } from '../order/clock.provider'
import { getLocalTomorrowDate } from '../order/delivery-date.util'
import { Order } from '../order/order.entity'
import { OrderLine } from '../order/order-line.entity'
import { OrderService } from '../order/order.service'
import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import { ApothekerProfileService } from '../profile/apotheker/apotheker-profile.service'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import {
  ApothekerProfileNotFoundException,
  BezorgerProfileNotFoundException,
} from '../profile/exceptions/profile.exceptions'
import {
  MultipleActiveRouteTemplatesException,
  RouteTemplateNotAssignedException,
} from '../route-templates/exceptions/route-template.exceptions'
import { RouteTemplatesService } from '../route-templates/route-templates.service'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { DeliveryRouteForbiddenException } from './exceptions/delivery-route.exceptions'
import { OrderLineSnapshot } from './order-line-snapshot.embed'
import { filterOrdersForTomorrowPreview } from './route-preview-eligibility.util'
import { RoutePreviewStop } from './route-preview-stop.type'
import { RoutePreview } from './route-preview.type'

function copyAddress(
  address: ApothekerProfile['address'],
): RoutePreviewStop['address'] {
  return {
    street: address.street,
    houseNumber: address.houseNumber,
    postalCode: address.postalCode,
    city: address.city,
    country: address.country,
  }
}

function aggregateOrderLines(orders: Order[]): OrderLineSnapshot[] {
  const byVaccine = new Map<string, OrderLineSnapshot>()

  for (const order of orders) {
    for (const line of order.orderLines ?? []) {
      const existing = byVaccine.get(line.vaccineId)

      if (existing) {
        existing.quantity += line.quantity
      } else {
        byVaccine.set(line.vaccineId, {
          vaccineId: line.vaccineId,
          vaccineName: line.vaccineName,
          manufacturer: line.manufacturer,
          quantity: line.quantity,
        })
      }
    }
  }

  return [...byVaccine.values()]
}

function sumOrderQuantities(orders: Order[]): number {
  return orders.reduce((total, order) => {
    if (typeof order.totalQuantity === 'number') {
      return total + order.totalQuantity
    }

    return (
      total +
      (order.orderLines ?? []).reduce(
        (lineTotal: number, line: OrderLine) => lineTotal + line.quantity,
        0,
      )
    )
  }, 0)
}

@Injectable()
export class RoutePreviewService {
  constructor(
    private readonly routeTemplatesService: RouteTemplatesService,
    private readonly apothekerProfileService: ApothekerProfileService,
    private readonly bezorgerProfileService: BezorgerProfileService,
    private readonly orderService: OrderService,
    private readonly settingsService: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async computeTomorrowPreview(user: User): Promise<RoutePreview> {
    if (user.role !== UserRole.BEZORGER) {
      throw new DeliveryRouteForbiddenException()
    }

    const profile = await this.bezorgerProfileService.findByUserId(
      user._id.toString(),
    )

    if (!profile) {
      throw new BezorgerProfileNotFoundException()
    }

    const templates =
      await this.routeTemplatesService.findActiveTemplatesForBezorgerProfile(
        profile.id,
      )

    if (templates.length === 0) {
      throw new RouteTemplateNotAssignedException()
    }

    if (templates.length > 1) {
      throw new MultipleActiveRouteTemplatesException()
    }

    const template = templates[0]
    const settings = await this.settingsService.getApplicationSettings()
    const now = this.clock.now()
    const tomorrow = getLocalTomorrowDate(now, settings.timezone)

    const orderedTemplateStops = [...(template.stops ?? [])].sort(
      (a, b) => a.sequence - b.sequence,
    )

    const stops: RoutePreviewStop[] = []
    const skippedApothekerProfileIds: string[] = []

    for (const templateStop of orderedTemplateStops) {
      const profileParsed = tryParseGraphqlObjectId(
        templateStop.apothekerProfileId,
      )

      if (!profileParsed) {
        throw new ApothekerProfileNotFoundException()
      }

      const apothekerProfile =
        await this.apothekerProfileService.findApothekerProfileById(
          profileParsed.stringValue,
        )

      const routeOrders = await this.orderService.findQualifyingOrdersForRoute({
        apothekerUserId: apothekerProfile.userId.toString(),
        deliveryDate: tomorrow,
      })

      const qualifyingOrders = filterOrdersForTomorrowPreview(
        routeOrders,
        settings.timezone,
        settings.orderingClosingTime,
      )

      if (qualifyingOrders.length === 0) {
        skippedApothekerProfileIds.push(apothekerProfile.id)
        continue
      }

      const orderIds = qualifyingOrders.map(order => order.id)

      stops.push({
        sequence: stops.length + 1,
        apothekerProfileId: apothekerProfile.id,
        apothekerUserId: apothekerProfile.userId.toString(),
        pharmacyName: apothekerProfile.pharmacyName,
        address: copyAddress(apothekerProfile.address),
        orderIds,
        orderCount: orderIds.length,
        totalQuantity: sumOrderQuantities(qualifyingOrders),
        lines: aggregateOrderLines(qualifyingOrders),
      })
    }

    const totalOrders = stops.reduce((sum, stop) => sum + stop.orderCount, 0)
    const totalQuantity = stops.reduce(
      (sum, stop) => sum + stop.totalQuantity,
      0,
    )

    return {
      deliveryDate: tomorrow,
      bezorgerProfileId: profile.id,
      routeTemplateId: template.id,
      routeTemplateName: template.name,
      stops,
      skippedApothekerProfileIds,
      totalStops: stops.length,
      totalOrders,
      totalQuantity,
      computedAt: now,
    }
  }
}

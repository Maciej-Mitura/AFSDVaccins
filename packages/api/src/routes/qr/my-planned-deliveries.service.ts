import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { Order } from '../../order/order.entity'
import { OrderStatus } from '../../order/order-status.enum'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryStop } from '../delivery-stop.embed'
import { DeliveryRouteProgressLocationService } from '../location/delivery-route-progress-location.service'
import { RouteStatus } from '../route-status.enum'
import { buildDeliveryStopQrImagePath } from './delivery-stop-qr-image.constants'
import { DeliveryQrForbiddenException } from './delivery-stop-qr.exceptions'
import {
  MyPlannedDelivery,
  MyPlannedDeliveryOrder,
} from './my-planned-delivery.type'
import {
  getStopDeliveredAt,
  isStopQrAvailable,
  isStopQrConsumed,
} from './stop-qr-invariants'
import { assertStopEligibleForQrRetrieval } from './delivery-stop-qr-eligibility'

const ACTIVE_PLANNED_ROUTE_STATUSES: ReadonlySet<RouteStatus> = new Set([
  RouteStatus.ASSIGNED,
  RouteStatus.IN_PROGRESS,
])

/**
 * Pharmacist planned-delivery groups (Phase 26G).
 * Derives ownership from the authenticated user — never trusts a client profile id.
 */
@Injectable()
export class MyPlannedDeliveriesService {
  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    @InjectRepository(Order)
    private readonly orderRepository: MongoRepository<Order>,
    private readonly progressLocationService: DeliveryRouteProgressLocationService,
  ) {}

  /**
   * Returns stop-grouped planned deliveries for the owning APOTHEKER only.
   * Default: ASSIGNED / IN_PROGRESS routes. Safe fields only (no bearer token).
   */
  async listForApotheker(actor: User): Promise<MyPlannedDelivery[]> {
    if (actor.role !== UserRole.APOTHEKER) {
      throw new DeliveryQrForbiddenException()
    }

    const actorUserId = actor._id.toString()

    const routes = await this.deliveryRouteRepository.find({
      where: {
        status: {
          $in: [RouteStatus.ASSIGNED, RouteStatus.IN_PROGRESS],
        },
        'stops.apothekerUserId': actorUserId,
      } as never,
      order: { deliveryDate: 'DESC', generatedAt: 'DESC' },
    })

    const groups: MyPlannedDelivery[] = []

    for (const route of routes) {
      if (!ACTIVE_PLANNED_ROUTE_STATUSES.has(route.status)) {
        continue
      }

      const routeId = route._id.toString()

      for (const stop of route.stops ?? []) {
        if (stop.apothekerUserId !== actorUserId) {
          continue
        }

        groups.push(
          await this.buildGroup({
            route,
            stop,
            routeId,
            stopId: hasText(stop.stopId) ? stop.stopId : null,
          }),
        )
      }
    }

    groups.sort((a, b) => {
      const dateCmp = b.routeDate.localeCompare(a.routeDate)
      if (dateCmp !== 0) {
        return dateCmp
      }
      return a.stopSequence - b.stopSequence
    })

    return groups
  }

  private async buildGroup(input: {
    route: DeliveryRoute
    stop: DeliveryStop
    routeId: string
    stopId: string | null
  }): Promise<MyPlannedDelivery> {
    const { route, stop, routeId, stopId } = input
    const orderIds = [...(stop.orderIds ?? [])]
    const orders = await this.loadStopOrders(orderIds)

    const totalLineCount = orders.reduce(
      (sum, order) => sum + order.lines.length,
      0,
    )
    const totalQuantity =
      typeof stop.totalQuantity === 'number'
        ? stop.totalQuantity
        : orders.reduce(
            (sum, order) =>
              sum +
              order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0),
            0,
          )

    const hasStableStopId = hasText(stopId)
    const qrAvailable = hasStableStopId && isStopQrAvailable(stop)
    const qrConsumed = isStopQrConsumed(stop)
    const deliveredAt = getStopDeliveredAt(stop)

    let qrImagePath: string | null = null
    if (hasStableStopId) {
      try {
        assertStopEligibleForQrRetrieval(route.status, stop)
        qrImagePath = buildDeliveryStopQrImagePath(routeId, stopId)
      } catch {
        qrImagePath = null
      }
    }

    const locationVisibility =
      this.progressLocationService.getPharmacistLocationVisibility(route, stop)

    return {
      routeId,
      stopId,
      routeDate: route.deliveryDate,
      routeStatus: route.status,
      stopSequence: stop.sequence,
      pharmacyName: stop.pharmacyName,
      address: stop.address,
      orderCount: stop.orderCount ?? orderIds.length,
      orderIds,
      orders,
      totalLineCount:
        totalLineCount > 0 ? totalLineCount : (stop.lines?.length ?? 0),
      totalQuantity,
      qrAvailable,
      qrConsumed,
      deliveredAt,
      qrImagePath,
      isNextStop: locationVisibility.isNextStop,
      lastKnownCourierCity: locationVisibility.lastKnownCourierCity,
      lastKnownLocationRecordedAt:
        locationVisibility.lastKnownLocationRecordedAt,
      courierLocationSource: locationVisibility.courierLocationSource,
    }
  }

  /**
   * Loads every orderId on the stop. Missing orders keep a safe placeholder
   * so the stop group still lists all and only the stop's orderIds.
   */
  private async loadStopOrders(
    orderIds: string[],
  ): Promise<MyPlannedDeliveryOrder[]> {
    const result: MyPlannedDeliveryOrder[] = []

    for (const orderId of orderIds) {
      const order = await this.findOrderById(orderId)
      if (!order) {
        result.push({
          orderId,
          status: OrderStatus.PLANNED,
          lines: [],
        })
        continue
      }

      result.push({
        orderId: order._id.toString(),
        status: order.status,
        lines: (order.orderLines ?? []).map(line => ({
          vaccineId: line.vaccineId.toString(),
          vaccineName: line.vaccineName,
          quantity: line.quantity,
        })),
      })
    }

    return result
  }

  private async findOrderById(orderId: string): Promise<Order | null> {
    const parsed = tryParseGraphqlObjectId(orderId)
    if (!parsed) {
      return null
    }

    return this.orderRepository.findOne({
      where: { _id: parsed.objectId },
    })
  }
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

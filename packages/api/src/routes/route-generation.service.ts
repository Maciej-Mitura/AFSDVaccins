import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import { getLocalCalendarDate } from '../order/delivery-date.util'
import { Order } from '../order/order.entity'
import { OrderLine } from '../order/order-line.entity'
import { OrderService } from '../order/order.service'
import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import { ApothekerProfileService } from '../profile/apotheker/apotheker-profile.service'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import { ApothekerProfileNotFoundException } from '../profile/exceptions/profile.exceptions'
import { RouteTemplateNotFoundException } from '../route-templates/exceptions/route-template.exceptions'
import { RouteTemplatesService } from '../route-templates/route-templates.service'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { isValidDeliveryDateString } from './delivery-date-validation.util'
import { DeliveryRoute } from './delivery-route.entity'
import { DeliveryRouteEventsService } from './delivery-route-events.service'
import { DeliveryStop } from './delivery-stop.embed'
import {
  DeliveryRouteNotRegenerableException,
  InvalidDeliveryDateException,
  RouteTemplateInactiveException,
} from './exceptions/delivery-route.exceptions'
import { OrderLineSnapshot } from './order-line-snapshot.embed'
import { createGeneratedStopQrState } from './qr/create-generated-stop-qr-state'
import {
  DELIVERY_QR_RANDOM_SOURCE,
  DELIVERY_QR_TOKEN_SERVICE,
} from './qr/delivery-qr.constants'
import type { DeliveryQrRandomSource } from './qr/delivery-qr-nonce.util'
import type { DeliveryQrTokenService } from './qr/delivery-qr-token.types'
import { RouteStatus } from './route-status.enum'
import { RouteStatusHistoryEntry } from './route-status-history.type'

type DeliveryStopDraft = Omit<
  DeliveryStop,
  'stopId' | 'qrConfirmation' | 'deliveryProof'
>

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  )
}

function copyAddress(
  address: ApothekerProfile['address'],
): DeliveryStop['address'] {
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
export class RouteGenerationService {
  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    private readonly routeTemplatesService: RouteTemplatesService,
    private readonly apothekerProfileService: ApothekerProfileService,
    private readonly bezorgerProfileService: BezorgerProfileService,
    private readonly orderService: OrderService,
    private readonly settingsService: SettingsService,
    private readonly deliveryRouteEventsService: DeliveryRouteEventsService,
    @Inject(DELIVERY_QR_RANDOM_SOURCE)
    private readonly deliveryQrRandomSource: DeliveryQrRandomSource,
    @Inject(DELIVERY_QR_TOKEN_SERVICE)
    private readonly deliveryQrTokenService: DeliveryQrTokenService,
  ) {}

  async generateDeliveryRoute(
    admin: User,
    routeTemplateId: string,
    deliveryDate: string,
  ): Promise<DeliveryRoute> {
    if (!isValidDeliveryDateString(deliveryDate)) {
      throw new InvalidDeliveryDateException()
    }

    const templateIdParsed = tryParseGraphqlObjectId(routeTemplateId)

    if (!templateIdParsed) {
      throw new RouteTemplateNotFoundException()
    }

    const template = await this.routeTemplatesService.findRouteTemplateById(
      templateIdParsed.stringValue,
    )

    if (!template.active) {
      throw new RouteTemplateInactiveException()
    }

    await this.bezorgerProfileService.findBezorgerProfileById(
      template.bezorgerProfileId,
    )

    const existing = await this.findByBezorgerAndDate(
      template.bezorgerProfileId,
      deliveryDate,
    )

    if (existing) {
      this.assertRegenerable(existing)
    }

    const orderedTemplateStops = [...(template.stops ?? [])].sort(
      (a, b) => a.sequence - b.sequence,
    )

    const stopDrafts: DeliveryStopDraft[] = []
    const skippedApothekerProfileIds: string[] = []
    const allOrderIds: string[] = []

    for (const templateStop of orderedTemplateStops) {
      const profileParsed = tryParseGraphqlObjectId(
        templateStop.apothekerProfileId,
      )

      if (!profileParsed) {
        throw new ApothekerProfileNotFoundException()
      }

      const profile =
        await this.apothekerProfileService.findApothekerProfileById(
          profileParsed.stringValue,
        )

      const qualifyingOrders =
        await this.orderService.findQualifyingOrdersForRoute({
          apothekerUserId: profile.userId.toString(),
          deliveryDate,
        })

      if (qualifyingOrders.length === 0) {
        skippedApothekerProfileIds.push(profile.id)
        continue
      }

      const orderIds = qualifyingOrders.map(order => order.id)
      allOrderIds.push(...orderIds)

      stopDrafts.push({
        sequence: stopDrafts.length + 1,
        apothekerProfileId: profile.id,
        apothekerUserId: profile.userId.toString(),
        pharmacyName: profile.pharmacyName,
        address: copyAddress(profile.address),
        orderIds,
        orderCount: orderIds.length,
        totalQuantity: sumOrderQuantities(qualifyingOrders),
        lines: aggregateOrderLines(qualifyingOrders),
      })
    }

    /**
     * Pre-assign a Mongo ObjectId in application code so QR tokens can bind to
     * the final routeId before any write. Persist the complete route in one save
     * — never insert an incomplete shell merely to obtain an id.
     */
    const routeObjectId = existing
      ? this.resolveExistingRouteObjectId(existing)
      : new ObjectId()
    const routeId = routeObjectId.toHexString()
    const stops = this.attachStopQrState(stopDrafts, routeId)

    const changedOrders = await this.orderService.planOrdersForGeneratedRoute(
      admin,
      allOrderIds,
    )

    const now = new Date()
    const adminId = admin._id.toString()

    let saved: DeliveryRoute

    if (existing) {
      const previousStatus = existing.status
      existing.routeTemplateId = template.id
      existing.stops = stops
      existing.skippedApothekerProfileIds = skippedApothekerProfileIds
      existing.status = RouteStatus.ASSIGNED
      existing.generatedAt = now
      existing.generatedByUserId = adminId

      if (previousStatus !== RouteStatus.ASSIGNED) {
        if (!Array.isArray(existing.statusHistory)) {
          existing.statusHistory = []
        }

        existing.statusHistory.push({
          fromStatus: previousStatus,
          toStatus: RouteStatus.ASSIGNED,
          changedAt: now,
          changedByUserId: adminId,
          reason: 'Route regenerated',
        })
      }

      saved = await this.deliveryRouteRepository.save(existing)
    } else {
      const route = this.deliveryRouteRepository.create({
        _id: routeObjectId as unknown as string,
        routeTemplateId: template.id,
        bezorgerProfileId: template.bezorgerProfileId,
        deliveryDate,
        status: RouteStatus.ASSIGNED,
        stops,
        skippedApothekerProfileIds,
        statusHistory: [this.buildInitialHistoryEntry(adminId, now)],
        generatedAt: now,
        generatedByUserId: adminId,
      })

      try {
        saved = await this.deliveryRouteRepository.save(route)
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error
        }

        const raced = await this.findByBezorgerAndDate(
          template.bezorgerProfileId,
          deliveryDate,
        )

        if (!raced) {
          throw error
        }

        this.assertRegenerable(raced)
        // Remint tokens bound to the raced document's durable id.
        raced.routeTemplateId = template.id
        raced.stops = this.attachStopQrState(stopDrafts, raced.id.toString())
        raced.skippedApothekerProfileIds = skippedApothekerProfileIds
        raced.status = RouteStatus.ASSIGNED
        raced.generatedAt = now
        raced.generatedByUserId = adminId
        saved = await this.deliveryRouteRepository.save(raced)
      }
    }

    await this.orderService.publishPlannedOrderUpdates(changedOrders)
    await this.deliveryRouteEventsService.publishBezorgerRouteUpdated(saved)

    return saved
  }

  async getLocalTodayDeliveryDate(now: Date = new Date()): Promise<string> {
    const settings = await this.settingsService.getApplicationSettings()
    return getLocalCalendarDate(now, settings.timezone)
  }

  /**
   * ObjectId/string-safe lookup. Routes persist `bezorgerProfileId` as a string;
   * TypeORM `profile.id` is often an ObjectId instance — querying only one form
   * misses the document (same class of bug as Order.apothekerId).
   */
  async findByBezorgerAndDate(
    bezorgerProfileId: string,
    deliveryDate: string,
  ): Promise<DeliveryRoute | null> {
    const parsed = tryParseGraphqlObjectId(bezorgerProfileId.toString())

    if (!parsed) {
      return null
    }

    const [byString, byObjectId] = await Promise.all([
      this.deliveryRouteRepository.findOne({
        where: {
          bezorgerProfileId: parsed.stringValue,
          deliveryDate,
        },
      }),
      this.deliveryRouteRepository.findOne({
        where: {
          bezorgerProfileId: parsed.objectId as unknown as string,
          deliveryDate,
        },
      }),
    ])

    return byString ?? byObjectId ?? null
  }

  private resolveExistingRouteObjectId(route: DeliveryRoute): ObjectId {
    const raw: unknown = route._id ?? route.id
    if (raw instanceof ObjectId) {
      return raw
    }

    const parsed = tryParseGraphqlObjectId(String(raw))
    if (parsed) {
      return parsed.objectId
    }

    return new ObjectId(String(raw))
  }

  private attachStopQrState(
    drafts: DeliveryStopDraft[],
    routeId: string,
  ): DeliveryStop[] {
    return drafts.map(draft => {
      const { stopId, qrConfirmation } = createGeneratedStopQrState({
        routeId,
        tokenService: this.deliveryQrTokenService,
        random: this.deliveryQrRandomSource,
      })

      return {
        ...draft,
        stopId,
        qrConfirmation,
        deliveryProof: null,
      }
    })
  }

  private assertRegenerable(route: DeliveryRoute): void {
    if (
      route.status === RouteStatus.ASSIGNED ||
      route.status === RouteStatus.CANCELLED
    ) {
      return
    }

    throw new DeliveryRouteNotRegenerableException(route.status)
  }

  private buildInitialHistoryEntry(
    changedByUserId: string,
    changedAt: Date,
  ): RouteStatusHistoryEntry {
    return {
      fromStatus: null,
      toStatus: RouteStatus.ASSIGNED,
      changedAt,
      changedByUserId,
      reason: 'Route generated',
    }
  }
}

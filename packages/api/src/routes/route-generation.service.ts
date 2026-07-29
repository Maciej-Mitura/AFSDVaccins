import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { BusinessNotificationProducerService } from '../notifications/business-notification-producer.service'
import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import { getLocalCalendarDate } from '../order/delivery-date.util'
import { Order } from '../order/order.entity'
import { OrderLine } from '../order/order-line.entity'
import { OrderService } from '../order/order.service'
import { OrderStatus } from '../order/order-status.enum'
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
import {
  DeliveryRouteGenerationResult,
  RoutePlanningDiagnostics,
} from './route-generation-diagnostics.type'
import {
  isPharmacyProfileComplete,
  RouteGenerationDiagnosticsCollector,
} from './route-generation-diagnostics.util'
import { RouteGenerationSkipReasonCode } from './route-generation-skip-reason.enum'
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

function canRegenerateRouteStatus(status: RouteStatus): boolean {
  return status === RouteStatus.ASSIGNED || status === RouteStatus.CANCELLED
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
    private readonly businessNotificationProducer: BusinessNotificationProducerService,
    @Inject(DELIVERY_QR_RANDOM_SOURCE)
    private readonly deliveryQrRandomSource: DeliveryQrRandomSource,
    @Inject(DELIVERY_QR_TOKEN_SERVICE)
    private readonly deliveryQrTokenService: DeliveryQrTokenService,
  ) {}

  async generateDeliveryRoute(
    admin: User,
    routeTemplateId: string,
    deliveryDate: string,
  ): Promise<DeliveryRouteGenerationResult> {
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
    const templateProfileIds = new Set(
      orderedTemplateStops.map(stop => stop.apothekerProfileId.toString()),
    )
    const diagnostics = new RouteGenerationDiagnosticsCollector()

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

      const profileComplete = isPharmacyProfileComplete(profile)
      const dateOrders =
        await this.orderService.findOrdersForPharmacyAndDeliveryDate({
          apothekerUserId: profile.userId.toString(),
          deliveryDate,
        })
      const qualifyingOrders = dateOrders.filter(
        order =>
          order.status === OrderStatus.PENDING ||
          order.status === OrderStatus.PLANNED,
      )

      if (qualifyingOrders.length === 0) {
        skippedApothekerProfileIds.push(profile.id)

        if (!profileComplete) {
          diagnostics.addSkip({
            code: RouteGenerationSkipReasonCode.PHARMACY_DATA_INCOMPLETE,
            apothekerProfileId: profile.id,
            pharmacyName: profile.pharmacyName,
            orderIds: dateOrders.map(order => order.id.toString()),
          })
        } else if (dateOrders.length === 0) {
          diagnostics.addSkip({
            code: RouteGenerationSkipReasonCode.NO_MATCHING_ORDER_FOR_DATE,
            apothekerProfileId: profile.id,
            pharmacyName: profile.pharmacyName,
          })
        } else {
          const ineligible = dateOrders.filter(
            order =>
              order.status !== OrderStatus.PENDING &&
              order.status !== OrderStatus.PLANNED,
          )
          diagnostics.addSkip({
            code: RouteGenerationSkipReasonCode.ORDER_STATUS_NOT_ELIGIBLE,
            apothekerProfileId: profile.id,
            pharmacyName: profile.pharmacyName,
            orderIds: ineligible.map(order => order.id.toString()),
          })
        }

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

    await this.appendOffTemplateOrderSkips({
      deliveryDate,
      templateProfileIds,
      includedOrderIds: new Set(allOrderIds.map(id => id.toString())),
      diagnostics,
    })

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
    const regenerated = Boolean(existing)

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
    await this.businessNotificationProducer.notifyCourierRouteAssigned(saved)

    return {
      route: saved,
      diagnostics: diagnostics.build({
        includedOrderCount: allOrderIds.length,
        includedStopCount: stops.length,
        regenerated: regenerated || saved.id.toString() !== routeId,
        regenerationNeeded: false,
      }),
    }
  }

  /**
   * ADMIN-only read diagnostics for a delivery date / optional template.
   * Does not mutate routes or orders.
   */
  async getRoutePlanningDiagnostics(params: {
    deliveryDate: string
    routeTemplateId?: string | null
  }): Promise<RoutePlanningDiagnostics> {
    if (!isValidDeliveryDateString(params.deliveryDate)) {
      throw new InvalidDeliveryDateException()
    }

    const diagnostics = new RouteGenerationDiagnosticsCollector()
    let templateId: string | null = null
    let templateProfileIds = new Set<string>()
    let existing: DeliveryRoute | null = null
    let canRegenerate = true

    if (params.routeTemplateId) {
      const templateIdParsed = tryParseGraphqlObjectId(params.routeTemplateId)
      if (!templateIdParsed) {
        throw new RouteTemplateNotFoundException()
      }

      const template = await this.routeTemplatesService.findRouteTemplateById(
        templateIdParsed.stringValue,
      )
      templateId = template.id.toString()

      if (!template.active) {
        diagnostics.addSkip({
          code: RouteGenerationSkipReasonCode.NO_ACTIVE_TEMPLATE,
        })
      } else {
        templateProfileIds = new Set(
          (template.stops ?? []).map(stop => stop.apothekerProfileId.toString()),
        )
        existing = await this.findByBezorgerAndDate(
          template.bezorgerProfileId,
          params.deliveryDate,
        )
        if (existing) {
          canRegenerate = canRegenerateRouteStatus(existing.status)
        }
      }
    } else {
      const activeTemplates =
        await this.routeTemplatesService.findRouteTemplates(false)
      if (activeTemplates.length === 0) {
        diagnostics.addSkip({
          code: RouteGenerationSkipReasonCode.NO_ACTIVE_TEMPLATE,
        })
      } else {
        for (const template of activeTemplates) {
          for (const stop of template.stops ?? []) {
            templateProfileIds.add(stop.apothekerProfileId.toString())
          }
        }
      }
    }

    const includedOrderIds = new Set<string>()
    let includedStopCount = 0

    if (existing) {
      for (const stop of existing.stops ?? []) {
        includedStopCount += 1
        for (const orderId of stop.orderIds ?? []) {
          includedOrderIds.add(orderId.toString())
        }
      }
    } else if (!params.routeTemplateId) {
      const routesForDate = await this.deliveryRouteRepository.find({
        where: { deliveryDate: params.deliveryDate },
      })
      for (const route of routesForDate) {
        for (const stop of route.stops ?? []) {
          includedStopCount += 1
          for (const orderId of stop.orderIds ?? []) {
            includedOrderIds.add(orderId.toString())
          }
        }
      }
    }

    const pendingOrders = await this.orderService.findOrders({
      deliveryDate: params.deliveryDate,
      status: OrderStatus.PENDING,
    })

    const profiles = await this.apothekerProfileService.listApothekerProfiles()
    const profileByUserId = new Map(
      profiles.map(profile => [profile.userId.toString(), profile]),
    )

    let eligibleUnplannedOrderCount = 0

    for (const order of pendingOrders) {
      const orderId = order.id.toString()
      if (includedOrderIds.has(orderId)) {
        continue
      }

      const profile = profileByUserId.get(order.apothekerId.toString())
      if (!profile) {
        diagnostics.addSkip({
          code: RouteGenerationSkipReasonCode.PHARMACY_DATA_INCOMPLETE,
          orderIds: [orderId],
        })
        eligibleUnplannedOrderCount += 1
        continue
      }

      if (
        templateProfileIds.size > 0 &&
        !templateProfileIds.has(profile.id.toString())
      ) {
        diagnostics.addSkip({
          code: RouteGenerationSkipReasonCode.PHARMACY_NOT_IN_ACTIVE_TEMPLATE,
          apothekerProfileId: profile.id,
          pharmacyName: profile.pharmacyName,
          orderIds: [orderId],
        })
        eligibleUnplannedOrderCount += 1
        continue
      }

      eligibleUnplannedOrderCount += 1
    }

    if (existing && canRegenerate && eligibleUnplannedOrderCount > 0) {
      diagnostics.addSkip({
        code: RouteGenerationSkipReasonCode.ROUTE_EXISTS_REGENERATION_REQUIRED,
        orderIds: pendingOrders
          .map(order => order.id.toString())
          .filter(id => !includedOrderIds.has(id)),
      })
    } else if (existing && !canRegenerate && eligibleUnplannedOrderCount > 0) {
      diagnostics.addSkip({
        code: RouteGenerationSkipReasonCode.ROUTE_EXISTS_REGENERATION_REQUIRED,
      })
    }

    const built = diagnostics.build({
      includedOrderCount: includedOrderIds.size,
      includedStopCount,
      regenerated: false,
      regenerationNeeded:
        eligibleUnplannedOrderCount > 0 &&
        (existing == null || canRegenerate),
    })

    return {
      deliveryDate: params.deliveryDate,
      routeTemplateId: templateId,
      routeId: existing?.id?.toString() ?? null,
      routeGeneratedAt: existing?.generatedAt ?? null,
      eligibleUnplannedOrderCount,
      includedOrderCount: built.includedOrderCount,
      includedStopCount: built.includedStopCount,
      skippedOrderCount: built.skippedOrderCount,
      skippedPharmacyCount: built.skippedPharmacyCount,
      regenerationNeeded: built.regenerationNeeded,
      canRegenerate,
      skipGroups: built.skipGroups,
    }
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

  private async appendOffTemplateOrderSkips(input: {
    deliveryDate: string
    templateProfileIds: Set<string>
    includedOrderIds: Set<string>
    diagnostics: RouteGenerationDiagnosticsCollector
  }): Promise<void> {
    const pendingOrders = await this.orderService.findOrders({
      deliveryDate: input.deliveryDate,
      status: OrderStatus.PENDING,
    })
    const profiles = await this.apothekerProfileService.listApothekerProfiles()
    const profileByUserId = new Map(
      profiles.map(profile => [profile.userId.toString(), profile]),
    )

    for (const order of pendingOrders) {
      const orderId = order.id.toString()
      if (input.includedOrderIds.has(orderId)) {
        continue
      }

      const profile = profileByUserId.get(order.apothekerId.toString())
      if (!profile) {
        input.diagnostics.addSkip({
          code: RouteGenerationSkipReasonCode.PHARMACY_DATA_INCOMPLETE,
          orderIds: [orderId],
        })
        continue
      }

      if (!input.templateProfileIds.has(profile.id.toString())) {
        input.diagnostics.addSkip({
          code: RouteGenerationSkipReasonCode.PHARMACY_NOT_IN_ACTIVE_TEMPLATE,
          apothekerProfileId: profile.id,
          pharmacyName: profile.pharmacyName,
          orderIds: [orderId],
        })
      }
    }
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
    if (canRegenerateRouteStatus(route.status)) {
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

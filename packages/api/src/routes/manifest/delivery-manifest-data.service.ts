import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { CLOCK, type Clock } from '../../order/clock.provider'
import { Order } from '../../order/order.entity'
import { BezorgerProfileService } from '../../profile/bezorger/bezorger-profile.service'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryStop } from '../delivery-stop.embed'
import { RouteStatus } from '../route-status.enum'
import { DeliveryStopQrImageService } from '../qr/delivery-stop-qr-image.service'
import {
  getStopDeliveredAt,
  isStopQrAvailable,
  isStopQrConsumed,
} from '../qr/stop-qr-invariants'
import {
  DELIVERY_MANIFEST_MAX_LINES,
  DELIVERY_MANIFEST_MAX_ORDERS,
  DELIVERY_MANIFEST_MAX_STOPS,
  DELIVERY_MANIFEST_QR_SIZE_PX,
} from './delivery-manifest.constants'
import {
  DeliveryManifestForbiddenException,
  DeliveryManifestOrderIntegrityException,
  DeliveryManifestQuantityMismatchException,
  DeliveryManifestQrUnavailableException,
  DeliveryManifestRouteNotFoundException,
  DeliveryManifestRouteUnavailableException,
  DeliveryManifestStopNotFoundException,
  DeliveryManifestTooLargeException,
} from './delivery-manifest.exceptions'
import type {
  ManifestArrivalData,
  ManifestCourierData,
  ManifestDeliveryProofData,
  ManifestOrderData,
  ManifestQrData,
  ManifestQrState,
  ManifestStopData,
  ManifestStopStatus,
  RouteManifestData,
} from './delivery-manifest.types'

/**
 * Authoritative route/stop manifest builder (Phase 29A).
 * Uses persisted generated route data; never infers membership from pharmacy/date.
 */
@Injectable()
export class DeliveryManifestDataService {
  private readonly logger = new Logger(DeliveryManifestDataService.name)

  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    @InjectRepository(Order)
    private readonly orderRepository: MongoRepository<Order>,
    private readonly bezorgerProfileService: BezorgerProfileService,
    private readonly qrImageService: DeliveryStopQrImageService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async buildRouteManifest(
    actor: User,
    routeId: string,
  ): Promise<RouteManifestData> {
    const { route, normalisedRouteId } = await this.loadRoute(routeId)
    await this.assertMayBuildFullRouteManifest(actor, route)

    const stops = [...(route.stops ?? [])].sort(
      (a, b) => a.sequence - b.sequence,
    )
    this.assertBoundedStopCount(stops.length)

    const assignedCourier = await this.resolveAssignedCourier(route)
    const courierNameByUserId = await this.buildCourierNameLookup(
      assignedCourier,
      stops,
    )

    const mappedStops: ManifestStopData[] = []
    for (const stop of stops) {
      mappedStops.push(
        await this.mapStop({
          route,
          stop,
          courierDisplayName: assignedCourier?.displayName ?? null,
          courierNameByUserId,
        }),
      )
    }

    this.assertBoundedOrderAndLineTotals(mappedStops)

    return this.buildManifestEnvelope({
      scope: 'ROUTE',
      route,
      routeId: normalisedRouteId,
      actor,
      assignedCourier,
      stops: mappedStops,
      includeCourier: true,
    })
  }

  async buildStopManifest(
    actor: User,
    routeId: string,
    stopId: string,
  ): Promise<RouteManifestData> {
    if (!hasText(stopId)) {
      throw new DeliveryManifestStopNotFoundException()
    }

    const { route, normalisedRouteId } = await this.loadRoute(routeId)
    const stop = (route.stops ?? []).find(
      candidate => candidate.stopId === stopId,
    )
    if (!stop) {
      throw new DeliveryManifestStopNotFoundException()
    }

    await this.assertMayBuildStopManifest(actor, route, stop)

    const assignedCourier = await this.resolveAssignedCourier(route)
    const courierNameByUserId = await this.buildCourierNameLookup(
      assignedCourier,
      [stop],
    )

    const mappedStop = await this.mapStop({
      route,
      stop,
      courierDisplayName: assignedCourier?.displayName ?? null,
      courierNameByUserId,
    })

    this.assertBoundedOrderAndLineTotals([mappedStop])

    // Stop-scoped: courier reference only when actor is ADMIN or assigned courier.
    const includeCourier =
      actor.role === UserRole.ADMIN || actor.role === UserRole.BEZORGER

    return this.buildManifestEnvelope({
      scope: 'STOP',
      route,
      routeId: normalisedRouteId,
      actor,
      assignedCourier: includeCourier ? assignedCourier : null,
      stops: [mappedStop],
      includeCourier,
    })
  }

  private buildManifestEnvelope(input: {
    scope: 'ROUTE' | 'STOP'
    route: DeliveryRoute
    routeId: string
    actor: User
    assignedCourier: ManifestCourierData | null
    stops: ManifestStopData[]
    includeCourier: boolean
  }): RouteManifestData {
    const totalOrderCount = input.stops.reduce(
      (sum, stop) => sum + stop.totals.orderCount,
      0,
    )
    const totalLineCount = input.stops.reduce(
      (sum, stop) => sum + stop.totals.lineCount,
      0,
    )
    const totalItemQuantity = input.stops.reduce(
      (sum, stop) => sum + stop.totals.itemQuantity,
      0,
    )

    return {
      scope: input.scope,
      routeId: input.routeId,
      routeDate: input.route.deliveryDate,
      routeStatus: input.route.status,
      routeCancelled: input.route.status === RouteStatus.CANCELLED,
      generatedAt: this.clock.now(),
      generatedBy: {
        userId: input.actor._id.toString(),
        role: input.actor.role,
      },
      assignedCourier: input.includeCourier ? input.assignedCourier : null,
      stopCount: input.stops.length,
      totalOrderCount,
      totalLineCount,
      totalItemQuantity,
      stops: input.stops,
    }
  }

  private async mapStop(input: {
    route: DeliveryRoute
    stop: DeliveryStop
    courierDisplayName: string | null
    courierNameByUserId: Map<string, string>
  }): Promise<ManifestStopData> {
    const { route, stop } = input
    const orders = await this.loadStopOrders(stop)
    const lineCount = orders.reduce((sum, order) => sum + order.lineCount, 0)
    const itemQuantity = orders.reduce(
      (sum, order) => sum + order.itemQuantity,
      0,
    )

    this.assertStopSnapshotConsistency(stop, orders, itemQuantity)

    const stopStatus = deriveStopStatus(stop)
    const arrival = this.mapArrival(stop, input.courierNameByUserId)
    const deliveryProof = this.mapDeliveryProof(stop, input.courierNameByUserId)
    const qr = await this.mapQr(route, stop)

    return {
      stopId: hasText(stop.stopId) ? stop.stopId : null,
      sequence: stop.sequence,
      pharmacy: {
        name: stop.pharmacyName,
        addressLine: formatAddressLine(stop),
        postalCode: stop.address?.postalCode ?? '',
        city: stop.address?.city ?? '',
      },
      stopStatus,
      orders,
      totals: {
        orderCount: orders.length,
        lineCount,
        itemQuantity,
      },
      arrival,
      deliveryProof,
      qr,
    }
  }

  /**
   * Route stops remain the source of truth. Manifest must not silently omit an
   * order the stop claims to contain, and quantity totals must match.
   */
  private assertStopSnapshotConsistency(
    stop: DeliveryStop,
    orders: ManifestOrderData[],
    itemQuantity: number,
  ): void {
    const claimedOrderIds = [...(stop.orderIds ?? [])]
    if (orders.length !== claimedOrderIds.length) {
      this.logger.warn(
        `Manifest order integrity failure: stop sequence ${stop.sequence} claims ${claimedOrderIds.length} order(s) but resolved ${orders.length}.`,
      )
      throw new DeliveryManifestOrderIntegrityException()
    }

    if (
      typeof stop.orderCount === 'number' &&
      stop.orderCount !== orders.length
    ) {
      this.logger.warn(
        `Manifest order integrity failure: stop sequence ${stop.sequence} orderCount snapshot mismatch.`,
      )
      throw new DeliveryManifestOrderIntegrityException()
    }

    if (
      typeof stop.totalQuantity === 'number' &&
      stop.totalQuantity !== itemQuantity
    ) {
      this.logger.warn(
        `Manifest quantity mismatch: stop sequence ${stop.sequence} snapshot=${stop.totalQuantity} live=${itemQuantity}.`,
      )
      throw new DeliveryManifestQuantityMismatchException()
    }

    for (const order of orders) {
      if (!Array.isArray(order.lines) || order.lines.length === 0) {
        this.logger.warn(
          `Manifest order integrity failure: order on stop sequence ${stop.sequence} has no lines.`,
        )
        throw new DeliveryManifestOrderIntegrityException()
      }
    }
  }

  private async loadStopOrders(stop: DeliveryStop): Promise<ManifestOrderData[]> {
    const orderIds = [...(stop.orderIds ?? [])]
    const mapped: ManifestOrderData[] = []

    for (const orderId of orderIds) {
      const order = await this.findOrderById(orderId)
      if (!order) {
        this.logger.warn(
          `Manifest order integrity failure: missing order for stop sequence ${stop.sequence}.`,
        )
        throw new DeliveryManifestOrderIntegrityException()
      }

      const lines = (order.orderLines ?? []).map(line => ({
        vaccineId: line.vaccineId?.toString?.() ?? String(line.vaccineId),
        vaccineName: line.vaccineName,
        quantity: line.quantity,
      }))

      const itemQuantity = lines.reduce((sum, line) => sum + line.quantity, 0)

      mapped.push({
        orderId: order._id.toString(),
        orderStatus: order.status,
        deliveryDate: order.deliveryDate,
        lines,
        lineCount: lines.length,
        itemQuantity,
      })
    }

    return mapped
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

  private mapArrival(
    stop: DeliveryStop,
    courierNameByUserId: Map<string, string>,
  ): ManifestArrivalData | null {
    const arrival = stop.arrival
    if (!arrival) {
      return null
    }

    const clientArrivedAt = toValidDate(arrival.clientArrivedAt)
    const recordedAt = toValidDate(arrival.recordedAt)
    if (!clientArrivedAt || !recordedAt) {
      return null
    }

    const courierUserId = arrival.arrivedByUserId
    return {
      clientArrivedAt,
      recordedAt,
      courierDisplayName: hasText(courierUserId)
        ? (courierNameByUserId.get(courierUserId) ?? null)
        : null,
    }
  }

  private mapDeliveryProof(
    stop: DeliveryStop,
    courierNameByUserId: Map<string, string>,
  ): ManifestDeliveryProofData | null {
    const proof = stop.deliveryProof
    if (!proof) {
      return null
    }

    const deliveredAt = getStopDeliveredAt(stop) ?? toValidDate(proof.deliveredAt)
    if (!deliveredAt) {
      return null
    }

    const courierUserId = proof.deliveredByUserId
    const confirmationReference = hasText(proof.confirmationEventId)
      ? proof.confirmationEventId.slice(-12)
      : null

    return {
      method: 'QR',
      deliveredAt,
      courierDisplayName: hasText(courierUserId)
        ? (courierNameByUserId.get(courierUserId) ?? null)
        : null,
      associatedOrderCount: Array.isArray(proof.associatedOrderIds)
        ? proof.associatedOrderIds.length
        : 0,
      recipientCity: proof.recipientCity ?? stop.address?.city ?? '',
      confirmationReference,
    }
  }

  private async mapQr(
    route: DeliveryRoute,
    stop: DeliveryStop,
  ): Promise<ManifestQrData> {
    if (route.status === RouteStatus.CANCELLED) {
      return { available: false, state: 'OMITTED_CANCELLED', pngBytes: null }
    }

    if (isStopQrConsumed(stop) || stop.deliveryProof != null) {
      return { available: false, state: 'CONSUMED', pngBytes: null }
    }

    if (
      route.status !== RouteStatus.ASSIGNED &&
      route.status !== RouteStatus.IN_PROGRESS
    ) {
      // COMPLETED with undelivered stop — mark unavailable rather than active QR
      if (!isStopQrAvailable(stop)) {
        return { available: false, state: 'UNAVAILABLE', pngBytes: null }
      }
      return { available: false, state: 'OMITTED_ROUTE_INACTIVE', pngBytes: null }
    }

    if (!isStopQrAvailable(stop)) {
      return { available: false, state: 'UNAVAILABLE', pngBytes: null }
    }

    const encodedToken = stop.qrConfirmation?.encodedToken
    if (!hasText(encodedToken)) {
      return { available: false, state: 'UNAVAILABLE', pngBytes: null }
    }

    try {
      const pngBytes = await this.qrImageService.renderPngBuffer(encodedToken, {
        width: DELIVERY_MANIFEST_QR_SIZE_PX,
      })
      return { available: true, state: 'ACTIVE', pngBytes }
    } catch (error) {
      this.logger.warn(
        `QR PNG render failed for stop sequence ${stop.sequence}.`,
        error instanceof Error ? error.message : 'unknown',
      )
      throw new DeliveryManifestQrUnavailableException()
    }
  }

  private async loadRoute(
    routeId: string,
  ): Promise<{ route: DeliveryRoute; normalisedRouteId: string }> {
    const parsed = tryParseGraphqlObjectId(routeId)
    if (!parsed) {
      throw new DeliveryManifestRouteNotFoundException()
    }

    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsed.objectId },
    })

    if (!route) {
      throw new DeliveryManifestRouteNotFoundException()
    }

    if (!Array.isArray(route.stops)) {
      throw new DeliveryManifestRouteUnavailableException()
    }

    return {
      route,
      normalisedRouteId: parsed.stringValue,
    }
  }

  private async assertMayBuildFullRouteManifest(
    actor: User,
    route: DeliveryRoute,
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) {
      return
    }

    if (actor.role === UserRole.APOTHEKER) {
      throw new DeliveryManifestForbiddenException()
    }

    if (actor.role !== UserRole.BEZORGER) {
      throw new DeliveryManifestForbiddenException()
    }

    await this.assertAssignedCourier(actor, route)
  }

  private async assertMayBuildStopManifest(
    actor: User,
    route: DeliveryRoute,
    stop: DeliveryStop,
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) {
      return
    }

    if (actor.role === UserRole.APOTHEKER) {
      const actorUserId = actor._id.toString()
      if (stop.apothekerUserId !== actorUserId) {
        throw new DeliveryManifestForbiddenException()
      }
      return
    }

    if (actor.role === UserRole.BEZORGER) {
      await this.assertAssignedCourier(actor, route)
      return
    }

    throw new DeliveryManifestForbiddenException()
  }

  private async assertAssignedCourier(
    actor: User,
    route: DeliveryRoute,
  ): Promise<void> {
    const profile = await this.bezorgerProfileService.findByUserId(
      actor._id.toString(),
    )

    if (!profile) {
      throw new DeliveryManifestForbiddenException()
    }

    if (route.bezorgerProfileId.toString() !== profile.id.toString()) {
      throw new DeliveryManifestForbiddenException()
    }
  }

  private async resolveAssignedCourier(
    route: DeliveryRoute,
  ): Promise<ManifestCourierData | null> {
    try {
      const profile = await this.bezorgerProfileService.findBezorgerProfileById(
        route.bezorgerProfileId.toString(),
      )
      return {
        displayName: profile.displayName,
        profileId: profile.id.toString(),
      }
    } catch {
      return null
    }
  }

  private async buildCourierNameLookup(
    assignedCourier: ManifestCourierData | null,
    stops: DeliveryStop[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (assignedCourier) {
      try {
        const profile =
          await this.bezorgerProfileService.findBezorgerProfileById(
            assignedCourier.profileId,
          )
        if (profile?.userId) {
          map.set(profile.userId.toString(), assignedCourier.displayName)
        }
      } catch {
        // Courier display remains optional.
      }
    }

    // Prefer assigned courier display for arrival/delivery actors on this route.
    for (const stop of stops) {
      const arrivalUserId = stop.arrival?.arrivedByUserId
      if (hasText(arrivalUserId) && assignedCourier && !map.has(arrivalUserId)) {
        map.set(arrivalUserId, assignedCourier.displayName)
      }
      const deliveredBy = stop.deliveryProof?.deliveredByUserId
      if (hasText(deliveredBy) && assignedCourier && !map.has(deliveredBy)) {
        map.set(deliveredBy, assignedCourier.displayName)
      }
    }

    return map
  }

  private assertBoundedStopCount(stopCount: number): void {
    if (stopCount > DELIVERY_MANIFEST_MAX_STOPS) {
      throw new DeliveryManifestTooLargeException()
    }
  }

  private assertBoundedOrderAndLineTotals(stops: ManifestStopData[]): void {
    const orderCount = stops.reduce(
      (sum, stop) => sum + stop.totals.orderCount,
      0,
    )
    const lineCount = stops.reduce((sum, stop) => sum + stop.totals.lineCount, 0)

    if (
      orderCount > DELIVERY_MANIFEST_MAX_ORDERS ||
      lineCount > DELIVERY_MANIFEST_MAX_LINES
    ) {
      throw new DeliveryManifestTooLargeException()
    }
  }
}

function deriveStopStatus(stop: DeliveryStop): ManifestStopStatus {
  if (stop.deliveryProof != null || isStopQrConsumed(stop)) {
    return 'delivered'
  }
  if (stop.arrival != null) {
    return 'arrived'
  }
  return 'pending'
}

function formatAddressLine(stop: DeliveryStop): string {
  const address = stop.address
  if (!address) {
    return ''
  }
  const street = [address.street, address.houseNumber]
    .filter(part => hasText(part))
    .join(' ')
  return street
}

function toValidDate(value: unknown): Date | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null
  }
  return value
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Exported for unit tests — never log or return token material. */
export function assertManifestDtoHasNoSecrets(manifest: RouteManifestData): void {
  const serialised = JSON.stringify(manifest, (_key, value) => {
    if (Buffer.isBuffer(value)) {
      return `[Buffer length=${value.length}]`
    }
    if (value instanceof Uint8Array) {
      return `[Uint8Array length=${value.length}]`
    }
    return value as string | number | boolean | null | object
  })

  const forbidden = [
    'encodedToken',
    'nonceHash',
    'signingSecret',
    'DELIVERY_QR_SIGNING',
  ]
  for (const needle of forbidden) {
    if (serialised.includes(needle)) {
      throw new Error(`Manifest DTO leaked sensitive field: ${needle}`)
    }
  }
}

export type { ManifestQrState }

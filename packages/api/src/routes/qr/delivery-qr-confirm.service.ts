import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { BusinessNotificationProducerService } from '../../notifications/business-notification-producer.service'
import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { OrderDeliveryMethod } from '../../order/order-delivery-method.enum'
import { Order } from '../../order/order.entity'
import { OrderService } from '../../order/order.service'
import { OrderStatus } from '../../order/order-status.enum'
import { BezorgerProfileService } from '../../profile/bezorger/bezorger-profile.service'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryRouteEventsService } from '../delivery-route-events.service'
import { DeliveryStop } from '../delivery-stop.embed'
import { DeliveryRouteProgressLocationService } from '../location/delivery-route-progress-location.service'
import { RouteStatus } from '../route-status.enum'
import { DELIVERY_QR_TOKEN_SERVICE } from './delivery-qr.constants'
import {
  DELIVERY_QR_CONFIRM_STALE_CLAIM_MS,
  DELIVERY_QR_CONFIRM_TOKEN_MAX_LENGTH,
} from './delivery-qr-confirm.constants'
import { DeliveryQrConfirmAuditService } from './delivery-qr-confirm-audit.service'
import {
  beginStopConfirmationProcessing,
  countRemainingUndeliveredStops,
  finaliseStopDeliveryByQr,
  isConfirmationProcessCompleted,
  isConfirmationProcessProcessing,
  isProcessingClaimStale,
  reclaimStaleStopConfirmationProcessing,
  touchStopConfirmationProcessing,
} from './delivery-qr-confirm.consistency'
import type {
  DeliveryQrConfirmBodyDto,
  DeliveryQrConfirmResponseDto,
} from './delivery-qr-confirm.dto'
import {
  DeliveryQrConfirmationConflictException,
  DeliveryQrConfirmationFailedException,
  DeliveryQrConfirmationInProgressException,
  DeliveryQrConfirmConsumedException,
  DeliveryQrConfirmForbiddenException,
  DeliveryQrConfirmOrderIntegrityException,
  DeliveryQrConfirmRouteInactiveException,
  DeliveryQrConfirmRouteNotFoundException,
  DeliveryQrConfirmRouteNotStartedException,
  DeliveryQrConfirmStopAlreadyDeliveredException,
  DeliveryQrConfirmStopNotFoundException,
  DeliveryQrConfirmTokenInvalidException,
  DeliveryQrConfirmTokenRequiredException,
  mapCryptoExceptionToConfirm,
} from './delivery-qr-confirm.exceptions'
import { DeliveryProofMethod } from './delivery-proof-method.enum'
import type {
  DeliveryQrTokenPayload,
  DeliveryQrTokenService,
} from './delivery-qr-token.types'
import { StopConfirmationProcessState } from './stop-confirmation-process.embed'
import {
  getStopDeliveredAt,
  isStopQrConsumed,
} from './stop-qr-invariants'
import { verifySubmittedStopQrToken } from './verify-submitted-stop-qr-token'

const DELIVERABLE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PENDING,
  OrderStatus.PLANNED,
])

/**
 * Courier QR delivery confirmation (Phase 26D) — resumable PROCESSING → COMPLETED.
 *
 * Does not consume the QR or write deliveryProof until every stop order is
 * DELIVERED under the same confirmationEventId. Crash mid-flight is recovered by
 * retrying the same token.
 */
@Injectable()
export class DeliveryQrConfirmService {
  private readonly logger = new Logger(DeliveryQrConfirmService.name)

  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    @InjectRepository(Order)
    private readonly orderRepository: MongoRepository<Order>,
    private readonly bezorgerProfileService: BezorgerProfileService,
    private readonly orderService: OrderService,
    private readonly deliveryRouteEventsService: DeliveryRouteEventsService,
    private readonly auditService: DeliveryQrConfirmAuditService,
    private readonly businessNotificationProducer: BusinessNotificationProducerService,
    private readonly progressLocationService: DeliveryRouteProgressLocationService,
    @Inject(DELIVERY_QR_TOKEN_SERVICE)
    private readonly tokenService: DeliveryQrTokenService,
  ) {}

  async confirmForCourier(
    actor: User,
    body: DeliveryQrConfirmBodyDto,
  ): Promise<DeliveryQrConfirmResponseDto> {
    const token = assertConfirmToken(body?.token)
    const payload = this.verifyTokenOrThrow(actor, token)

    const parsedRouteId = tryParseGraphqlObjectId(payload.routeId)
    if (!parsedRouteId) {
      this.logSecurityFailure(actor, 'route_id_invalid')
      throw new DeliveryQrConfirmTokenInvalidException()
    }

    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsedRouteId.objectId },
    })

    if (!route) {
      this.logSecurityFailure(actor, 'route_not_found')
      throw new DeliveryQrConfirmRouteNotFoundException()
    }

    const courierUserId = actor._id.toString()
    const courierProfile = await this.assertAssignedCourier(actor, route)
    const courierBezorgerProfileId = courierProfile.id.toString()

    const stop = (route.stops ?? []).find(
      candidate => candidate.stopId === payload.stopId,
    )

    if (!stop) {
      this.logSecurityFailure(actor, 'stop_not_found', parsedRouteId.stringValue)
      throw new DeliveryQrConfirmStopNotFoundException()
    }

    const confirmation = stop.qrConfirmation ?? null
    if (confirmation == null) {
      this.logSecurityFailure(
        actor,
        'qr_state_missing',
        parsedRouteId.stringValue,
      )
      throw new DeliveryQrConfirmTokenInvalidException()
    }

    this.assertRouteStatusForConfirm(route.status)
    this.assertStopNotFullyConfirmed(stop)

    this.logger.log({
      event: 'delivery_qr_confirm_started',
      routeId: parsedRouteId.stringValue,
      stopId: stop.stopId,
      actorId: courierUserId,
    })

    try {
      verifySubmittedStopQrToken(this.tokenService, token, confirmation, {
        routeId: parsedRouteId.stringValue,
        stopId: payload.stopId,
      })
    } catch (error) {
      this.logSecurityFailure(
        actor,
        'token_persist_mismatch',
        parsedRouteId.stringValue,
      )
      mapCryptoExceptionToConfirm(error)
    }

    const recipientCity = stop.address?.city?.trim() || ''
    if (!recipientCity) {
      throw new DeliveryQrConfirmOrderIntegrityException()
    }

    const recipientProfileId = String(stop.apothekerProfileId ?? '')
    if (!recipientProfileId) {
      throw new DeliveryQrConfirmOrderIntegrityException()
    }

    const orderIds = [...(stop.orderIds ?? [])].map(String)
    if (orderIds.length === 0) {
      throw new DeliveryQrConfirmOrderIntegrityException()
    }

    const now = new Date()
    const existingProcess = stop.confirmationProcess ?? null
    const canResumeExisting =
      existingProcess?.state === StopConfirmationProcessState.PROCESSING &&
      (existingProcess.claimedByUserId === courierUserId ||
        isProcessingClaimStale(existingProcess, now))

    if (!canResumeExisting) {
      if (
        existingProcess?.state === StopConfirmationProcessState.PROCESSING &&
        existingProcess.claimedByUserId !== courierUserId &&
        !isProcessingClaimStale(existingProcess, now)
      ) {
        throw new DeliveryQrConfirmationInProgressException()
      }

      // Fresh confirm — reject unrelated DELIVERED before creating a claim.
      await this.loadAndValidateStopOrders(stop, null)
    }

    const claim = await this.resolveProcessingClaim({
      route,
      stop,
      routeObjectId: parsedRouteId.objectId,
      stopId: stop.stopId!,
      courierUserId,
      now,
    })

    const confirmationEventId = claim.confirmationEventId

    // Resume-aware integrity (matching confirmationEventId DELIVERED is OK).
    await this.loadAndValidateStopOrders(stop, confirmationEventId)

    let deliveredOrders: Order[]
    try {
      deliveredOrders = await this.orderService.markDeliveredForQrConfirmation(
        actor,
        orderIds,
        confirmationEventId,
      )
    } catch {
      this.logger.error({
        event: 'delivery_qr_confirm_orders_failed',
        routeId: parsedRouteId.stringValue,
        stopId: stop.stopId,
        confirmationEventId,
        actorId: courierUserId,
        at: new Date().toISOString(),
      })
      throw new DeliveryQrConfirmationFailedException()
    }

    if (
      !this.allOrdersDeliveredForConfirmation(deliveredOrders, orderIds, confirmationEventId)
    ) {
      throw new DeliveryQrConfirmationFailedException()
    }

    const deliveredAt = now
    const stopForFinalise =
      (await this.reloadStop(parsedRouteId.objectId, stop.stopId!)) ?? stop

    const finalised = await finaliseStopDeliveryByQr(
      this.deliveryRouteRepository,
      {
        routeObjectId: parsedRouteId.objectId,
        stopId: stop.stopId!,
        courierUserId,
        assignedCourierUserId: courierUserId,
        associatedOrderIds: orderIds,
        recipientProfileId,
        recipientCity,
        confirmationEventId,
        deliveredAt,
        stop: {
          ...stopForFinalise,
          apothekerProfileId: recipientProfileId,
          orderIds,
        },
      },
    )

    if (!finalised.ok) {
      return await this.throwAfterFinaliseMiss(
        parsedRouteId.objectId,
        stop.stopId!,
      )
    }

    try {
      await this.auditService.record({
        confirmationEventId,
        routeId: parsedRouteId.stringValue,
        stopId: stop.stopId!,
        courierUserId,
        recipientProfileId,
        recipientCity,
        orderIds,
        deliveredAt,
      })
    } catch {
      this.logger.error({
        event: 'delivery_qr_confirm_audit_failed',
        routeId: parsedRouteId.stringValue,
        stopId: stop.stopId,
        confirmationEventId,
        actorId: courierUserId,
        at: new Date().toISOString(),
      })
      throw new DeliveryQrConfirmationFailedException()
    }

    const persistedRoute = finalised.route
    const completedStop =
      persistedRoute.stops?.find(s => s.stopId === stop.stopId) ?? stop

    let routeForPublish = persistedRoute
    let nextStopForNotify =
      this.progressLocationService.deriveNextStop(
        persistedRoute,
        completedStop,
      )

    try {
      const locationResult =
        await this.progressLocationService.recordDeliveryLocation({
          route: persistedRoute,
          stop: completedStop,
          deliveredAt,
          courierUserId,
          courierBezorgerProfileId,
          confirmationEventId,
          publishRouteUpdate: false,
        })
      routeForPublish = locationResult.route
      nextStopForNotify = locationResult.nextStop
    } catch (error) {
      // Reliability: delivery confirmation remains successful; location can be recomputed.
      this.logger.warn({
        event: 'delivery_qr_confirm_location_update_failed',
        routeId: parsedRouteId.stringValue,
        stopId: stop.stopId,
        confirmationEventId,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: 'unknown' },
      })
    }

    await this.deliveryRouteEventsService.publishBezorgerRouteUpdated(
      routeForPublish,
    )
    await this.orderService.publishQrDeliveredOrderUpdates(deliveredOrders)

    await this.businessNotificationProducer.notifyPharmacyDeliveryConfirmed({
      route: routeForPublish,
      stop: completedStop,
      confirmationEventId,
      orderCount: orderIds.length,
    })
    await this.businessNotificationProducer.notifyNextPharmacy(
      routeForPublish,
      completedStop,
      nextStopForNotify,
    )

    this.logger.log({
      event: 'delivery_qr_confirm_completed',
      routeId: parsedRouteId.stringValue,
      stopId: stop.stopId,
      confirmationEventId,
      orderCount: orderIds.length,
      remainingStopCount: countRemainingUndeliveredStops(routeForPublish.stops),
      actorId: courierUserId,
    })

    return {
      routeId: parsedRouteId.stringValue,
      stopId: stop.stopId!,
      deliveredAt: deliveredAt.toISOString(),
      deliveredByUserId: courierUserId,
      orderIds,
      orderCount: orderIds.length,
      recipientCity,
      proofMethod: DeliveryProofMethod.QR,
      routeStatus: routeForPublish.status,
      remainingStopCount: countRemainingUndeliveredStops(routeForPublish.stops),
    }
  }

  private async resolveProcessingClaim(input: {
    route: DeliveryRoute
    stop: DeliveryStop
    routeObjectId: ObjectId
    stopId: string
    courierUserId: string
    now: Date
  }): Promise<{ confirmationEventId: string; resumed: boolean }> {
    const process = input.stop.confirmationProcess ?? null

    if (
      process?.state === StopConfirmationProcessState.PROCESSING &&
      process.claimedByUserId === input.courierUserId
    ) {
      await touchStopConfirmationProcessing(this.deliveryRouteRepository, {
        routeObjectId: input.routeObjectId,
        stopId: input.stopId,
        confirmationEventId: process.confirmationEventId,
        courierUserId: input.courierUserId,
        now: input.now,
        stop: input.stop,
      })
      return {
        confirmationEventId: process.confirmationEventId,
        resumed: true,
      }
    }

    if (
      process?.state === StopConfirmationProcessState.PROCESSING &&
      process.claimedByUserId !== input.courierUserId
    ) {
      if (!isProcessingClaimStale(process, input.now)) {
        throw new DeliveryQrConfirmationInProgressException()
      }

      const reclaimed = await reclaimStaleStopConfirmationProcessing(
        this.deliveryRouteRepository,
        {
          routeObjectId: input.routeObjectId,
          stopId: input.stopId,
          courierUserId: input.courierUserId,
          confirmationEventId: process.confirmationEventId,
          staleBefore: new Date(
            input.now.getTime() - DELIVERY_QR_CONFIRM_STALE_CLAIM_MS,
          ),
          now: input.now,
          stop: input.stop,
        },
      )

      if (!reclaimed.ok) {
        throw new DeliveryQrConfirmationInProgressException()
      }

      return {
        confirmationEventId: reclaimed.confirmationEventId,
        resumed: true,
      }
    }

    const confirmationEventId = new ObjectId().toString()
    const begun = await beginStopConfirmationProcessing(
      this.deliveryRouteRepository,
      {
        routeObjectId: input.routeObjectId,
        stopId: input.stopId,
        courierUserId: input.courierUserId,
        confirmationEventId,
        now: input.now,
        stop: input.stop,
      },
    )

    if (begun.ok) {
      return {
        confirmationEventId: begun.confirmationEventId,
        resumed: false,
      }
    }

    // Concurrent claim race — reload and join same actor / conflict otherwise.
    const reloadedStop = await this.reloadStop(input.routeObjectId, input.stopId)
    if (!reloadedStop) {
      throw new DeliveryQrConfirmationConflictException()
    }

    if (isConfirmationProcessCompleted(reloadedStop) || isStopQrConsumed(reloadedStop)) {
      throw new DeliveryQrConfirmConsumedException()
    }

    if (getStopDeliveredAt(reloadedStop) != null) {
      throw new DeliveryQrConfirmStopAlreadyDeliveredException()
    }

    const reloadedProcess = reloadedStop.confirmationProcess
    if (
      reloadedProcess?.state === StopConfirmationProcessState.PROCESSING &&
      reloadedProcess.claimedByUserId === input.courierUserId
    ) {
      return {
        confirmationEventId: reloadedProcess.confirmationEventId,
        resumed: true,
      }
    }

    if (isConfirmationProcessProcessing(reloadedStop)) {
      throw new DeliveryQrConfirmationInProgressException()
    }

    throw new DeliveryQrConfirmationConflictException()
  }

  private verifyTokenOrThrow(
    actor: User,
    token: string,
  ): DeliveryQrTokenPayload {
    try {
      return this.tokenService.verify(token)
    } catch (error) {
      this.logSecurityFailure(actor, 'token_verify_failed')
      mapCryptoExceptionToConfirm(error)
    }
  }

  private async assertAssignedCourier(
    actor: User,
    route: DeliveryRoute,
  ): Promise<{ id: { toString(): string } }> {
    if (actor.role !== UserRole.BEZORGER) {
      throw new DeliveryQrConfirmForbiddenException()
    }

    const profile = await this.bezorgerProfileService.findByUserId(
      actor._id.toString(),
    )

    if (!profile) {
      throw new DeliveryQrConfirmForbiddenException()
    }

    if (route.bezorgerProfileId.toString() !== profile.id.toString()) {
      this.logSecurityFailure(
        actor,
        'courier_mismatch',
        route._id?.toString?.() ?? undefined,
      )
      throw new DeliveryQrConfirmForbiddenException()
    }

    return profile
  }

  private assertRouteStatusForConfirm(status: RouteStatus): void {
    if (status === RouteStatus.ASSIGNED) {
      throw new DeliveryQrConfirmRouteNotStartedException()
    }

    if (
      status === RouteStatus.COMPLETED ||
      status === RouteStatus.CANCELLED
    ) {
      throw new DeliveryQrConfirmRouteInactiveException()
    }

    if (status !== RouteStatus.IN_PROGRESS) {
      throw new DeliveryQrConfirmRouteInactiveException()
    }
  }

  /** Reject only fully finalised stops — PROCESSING is resumable. */
  private assertStopNotFullyConfirmed(stop: DeliveryStop): void {
    if (getStopDeliveredAt(stop) != null) {
      throw new DeliveryQrConfirmStopAlreadyDeliveredException()
    }

    if (isStopQrConsumed(stop)) {
      throw new DeliveryQrConfirmConsumedException()
    }

    if (isConfirmationProcessCompleted(stop)) {
      throw new DeliveryQrConfirmStopAlreadyDeliveredException()
    }
  }

  /**
   * Loads every stop order and validates integrity.
   * When `confirmationEventId` is set, DELIVERED orders tagged with that id are OK.
   */
  private async loadAndValidateStopOrders(
    stop: DeliveryStop,
    confirmationEventId: string | null,
  ): Promise<Order[]> {
    const orderIds = [...(stop.orderIds ?? [])]
    if (orderIds.length === 0) {
      throw new DeliveryQrConfirmOrderIntegrityException()
    }

    const pharmacyUserId = stop.apothekerUserId
    const loaded: Order[] = []

    for (const orderId of orderIds) {
      const order = await this.findOrderById(orderId)
      if (!order) {
        throw new DeliveryQrConfirmOrderIntegrityException()
      }

      if (order.apothekerId.toString() !== pharmacyUserId.toString()) {
        throw new DeliveryQrConfirmOrderIntegrityException()
      }

      if (order.status === OrderStatus.CANCELLED) {
        throw new DeliveryQrConfirmOrderIntegrityException()
      }

      if (order.status === OrderStatus.DELIVERED) {
        const belongsToThisConfirm =
          confirmationEventId != null &&
          order.deliveryConfirmationEventId === confirmationEventId &&
          order.deliveryMethod === OrderDeliveryMethod.QR

        if (!belongsToThisConfirm) {
          throw new DeliveryQrConfirmOrderIntegrityException()
        }

        loaded.push(order)
        continue
      }

      if (!DELIVERABLE_ORDER_STATUSES.has(order.status)) {
        throw new DeliveryQrConfirmOrderIntegrityException()
      }

      loaded.push(order)
    }

    return loaded
  }

  private allOrdersDeliveredForConfirmation(
    orders: Order[],
    expectedOrderIds: string[],
    confirmationEventId: string,
  ): boolean {
    if (orders.length !== expectedOrderIds.length) {
      return false
    }

    const byId = new Map(orders.map(order => [order._id.toString(), order]))
    for (const orderId of expectedOrderIds) {
      const order = byId.get(orderId)
      if (!order) {
        return false
      }
      if (order.status !== OrderStatus.DELIVERED) {
        return false
      }
      if (order.deliveryConfirmationEventId !== confirmationEventId) {
        return false
      }
    }
    return true
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

  private async reloadStop(
    routeObjectId: ObjectId,
    stopId: string,
  ): Promise<DeliveryStop | null> {
    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: routeObjectId },
    })
    return (route?.stops ?? []).find(candidate => candidate.stopId === stopId) ?? null
  }

  private async throwAfterFinaliseMiss(
    routeObjectId: ObjectId,
    stopId: string,
  ): Promise<never> {
    const stop = await this.reloadStop(routeObjectId, stopId)

    if (stop && getStopDeliveredAt(stop) != null) {
      throw new DeliveryQrConfirmStopAlreadyDeliveredException()
    }

    if (stop && isStopQrConsumed(stop)) {
      throw new DeliveryQrConfirmConsumedException()
    }

    if (stop && isConfirmationProcessCompleted(stop)) {
      throw new DeliveryQrConfirmStopAlreadyDeliveredException()
    }

    if (stop && isConfirmationProcessProcessing(stop)) {
      throw new DeliveryQrConfirmationInProgressException()
    }

    throw new DeliveryQrConfirmationConflictException()
  }

  private logSecurityFailure(
    actor: User,
    category: string,
    routeId?: string,
  ): void {
    this.logger.warn({
      event: 'delivery_qr_confirm_rejected',
      category,
      actorId: actor._id?.toString?.() ?? 'unknown',
      ...(routeId ? { routeId } : {}),
      at: new Date().toISOString(),
    })
  }
}

function assertConfirmToken(raw: unknown): string {
  if (raw == null) {
    throw new DeliveryQrConfirmTokenRequiredException()
  }

  if (typeof raw !== 'string') {
    throw new DeliveryQrConfirmTokenInvalidException()
  }

  const token = raw.trim()
  if (token.length === 0) {
    throw new DeliveryQrConfirmTokenRequiredException()
  }

  if (token.length > DELIVERY_QR_CONFIRM_TOKEN_MAX_LENGTH) {
    throw new DeliveryQrConfirmTokenInvalidException()
  }

  return token
}

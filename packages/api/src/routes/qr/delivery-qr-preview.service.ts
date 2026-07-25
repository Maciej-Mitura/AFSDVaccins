import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { Order } from '../../order/order.entity'
import { OrderStatus } from '../../order/order-status.enum'
import { BezorgerProfileService } from '../../profile/bezorger/bezorger-profile.service'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryStop } from '../delivery-stop.embed'
import { RouteStatus } from '../route-status.enum'
import { DELIVERY_QR_TOKEN_SERVICE } from './delivery-qr.constants'
import { DELIVERY_QR_PREVIEW_TOKEN_MAX_LENGTH } from './delivery-qr-preview.constants'
import type {
  DeliveryQrPreviewBodyDto,
  DeliveryQrPreviewOrderDto,
  DeliveryQrPreviewResponseDto,
} from './delivery-qr-preview.dto'
import {
  DeliveryQrOrderIntegrityException,
  DeliveryQrPreviewConsumedException,
  DeliveryQrPreviewForbiddenException,
  DeliveryQrPreviewRouteInactiveException,
  DeliveryQrPreviewTokenInvalidException,
  DeliveryQrRouteNotFoundException,
  DeliveryQrRouteNotStartedException,
  DeliveryQrStopAlreadyDeliveredException,
  DeliveryQrStopNotFoundException,
  DeliveryQrTokenRequiredException,
  mapCryptoExceptionToPreview,
} from './delivery-qr-preview.exceptions'
import type {
  DeliveryQrTokenPayload,
  DeliveryQrTokenService,
} from './delivery-qr-token.types'
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
 * Courier QR scan preview (Phase 26C).
 *
 * Read-only: validates the scanned token, authorises the assigned BEZORGER,
 * loads stop/order data, and returns a safe preview. Does not consume the QR,
 * mutate route/stop/order state, publish PubSub, or write audit events.
 */
@Injectable()
export class DeliveryQrPreviewService {
  private readonly logger = new Logger(DeliveryQrPreviewService.name)

  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    @InjectRepository(Order)
    private readonly orderRepository: MongoRepository<Order>,
    private readonly bezorgerProfileService: BezorgerProfileService,
    @Inject(DELIVERY_QR_TOKEN_SERVICE)
    private readonly tokenService: DeliveryQrTokenService,
  ) {}

  async previewForCourier(
    actor: User,
    body: DeliveryQrPreviewBodyDto,
  ): Promise<DeliveryQrPreviewResponseDto> {
    // 1. Request shape / token length.
    const token = assertPreviewToken(body?.token)

    // 2–4. HMAC signature, supported version, extract claims.
    const payload = this.verifyTokenOrThrow(actor, token)

    const parsedRouteId = tryParseGraphqlObjectId(payload.routeId)
    if (!parsedRouteId) {
      this.logSecurityFailure(actor, 'route_id_invalid')
      throw new DeliveryQrPreviewTokenInvalidException()
    }

    // 5. Load route.
    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsedRouteId.objectId },
    })

    if (!route) {
      this.logSecurityFailure(actor, 'route_not_found')
      throw new DeliveryQrRouteNotFoundException()
    }

    // 6. Assigned courier must match authenticated BEZORGER (never trust body).
    await this.assertAssignedCourier(actor, route)

    // 7. Locate stop by stopId inside that route.
    const stop = (route.stops ?? []).find(
      candidate => candidate.stopId === payload.stopId,
    )

    if (!stop) {
      this.logSecurityFailure(actor, 'stop_not_found', parsedRouteId.stringValue)
      throw new DeliveryQrStopNotFoundException()
    }

    // 8. Stop QR state must exist.
    const confirmation = stop.qrConfirmation ?? null
    if (confirmation == null) {
      this.logSecurityFailure(
        actor,
        'qr_state_missing',
        parsedRouteId.stringValue,
      )
      throw new DeliveryQrPreviewTokenInvalidException()
    }

    // 9–10. Nonce hash (timing-safe) + stored token version; re-check HMAC binding.
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
      throw error
    }

    // 11–13. Route must be IN_PROGRESS; QR unconsumed; stop not delivered.
    this.assertRouteStatusForPreview(route.status)
    this.assertStopNotConsumedOrDelivered(stop)

    // 14–15. Load associated orders (complete-set integrity) and return preview.
    const orders = await this.loadAndValidateStopOrders(stop)

    return buildPreviewResponse({
      route,
      stop,
      routeId: parsedRouteId.stringValue,
      orders,
    })
  }

  private verifyTokenOrThrow(
    actor: User,
    token: string,
  ): DeliveryQrTokenPayload {
    try {
      return this.tokenService.verify(token)
    } catch (error) {
      this.logSecurityFailure(actor, 'token_verify_failed')
      mapCryptoExceptionToPreview(error)
    }
  }

  private async assertAssignedCourier(
    actor: User,
    route: DeliveryRoute,
  ): Promise<void> {
    if (actor.role !== UserRole.BEZORGER) {
      throw new DeliveryQrPreviewForbiddenException()
    }

    const profile = await this.bezorgerProfileService.findByUserId(
      actor._id.toString(),
    )

    if (!profile) {
      throw new DeliveryQrPreviewForbiddenException()
    }

    if (route.bezorgerProfileId.toString() !== profile.id.toString()) {
      this.logSecurityFailure(
        actor,
        'courier_mismatch',
        route._id?.toString?.() ?? undefined,
      )
      throw new DeliveryQrPreviewForbiddenException()
    }
  }

  private assertRouteStatusForPreview(status: RouteStatus): void {
    if (status === RouteStatus.ASSIGNED) {
      throw new DeliveryQrRouteNotStartedException()
    }

    if (
      status === RouteStatus.COMPLETED ||
      status === RouteStatus.CANCELLED
    ) {
      throw new DeliveryQrPreviewRouteInactiveException()
    }

    if (status !== RouteStatus.IN_PROGRESS) {
      throw new DeliveryQrPreviewRouteInactiveException()
    }
  }

  private assertStopNotConsumedOrDelivered(stop: DeliveryStop): void {
    if (isStopQrConsumed(stop)) {
      throw new DeliveryQrPreviewConsumedException()
    }

    if (getStopDeliveredAt(stop) != null) {
      throw new DeliveryQrStopAlreadyDeliveredException()
    }
  }

  /**
   * Loads every orderId on the stop and validates the complete set.
   * Any missing or invalid order fails the entire preview (no partial DTO).
   */
  private async loadAndValidateStopOrders(
    stop: DeliveryStop,
  ): Promise<Order[]> {
    const orderIds = [...(stop.orderIds ?? [])]
    if (orderIds.length === 0) {
      throw new DeliveryQrOrderIntegrityException()
    }

    const pharmacyUserId = stop.apothekerUserId
    const loaded: Order[] = []

    for (const orderId of orderIds) {
      const order = await this.findOrderById(orderId)
      if (!order) {
        throw new DeliveryQrOrderIntegrityException()
      }

      if (order.apothekerId.toString() !== pharmacyUserId.toString()) {
        throw new DeliveryQrOrderIntegrityException()
      }

      if (order.status === OrderStatus.CANCELLED) {
        throw new DeliveryQrOrderIntegrityException()
      }

      if (order.status === OrderStatus.DELIVERED) {
        throw new DeliveryQrOrderIntegrityException()
      }

      if (!DELIVERABLE_ORDER_STATUSES.has(order.status)) {
        throw new DeliveryQrOrderIntegrityException()
      }

      loaded.push(order)
    }

    return loaded
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

  private logSecurityFailure(
    actor: User,
    category: string,
    routeId?: string,
  ): void {
    // Bounded operational log — never token, nonce, signature, or order contents.
    this.logger.warn({
      event: 'delivery_qr_preview_rejected',
      category,
      actorId: actor._id?.toString?.() ?? 'unknown',
      ...(routeId ? { routeId } : {}),
      at: new Date().toISOString(),
    })
  }
}

function assertPreviewToken(raw: unknown): string {
  if (raw == null) {
    throw new DeliveryQrTokenRequiredException()
  }

  if (typeof raw !== 'string') {
    throw new DeliveryQrPreviewTokenInvalidException()
  }

  const token = raw.trim()
  if (token.length === 0) {
    throw new DeliveryQrTokenRequiredException()
  }

  if (token.length > DELIVERY_QR_PREVIEW_TOKEN_MAX_LENGTH) {
    throw new DeliveryQrPreviewTokenInvalidException()
  }

  return token
}

function buildPreviewResponse(input: {
  route: DeliveryRoute
  stop: DeliveryStop
  routeId: string
  orders: Order[]
}): DeliveryQrPreviewResponseDto {
  const { route, stop, routeId, orders } = input
  const address = stop.address
  const addressLine = [address?.street, address?.houseNumber]
    .filter(part => typeof part === 'string' && part.length > 0)
    .join(' ')

  const orderDtos: DeliveryQrPreviewOrderDto[] = orders.map(order => ({
    orderId: order._id.toString(),
    status: order.status,
    lines: (order.orderLines ?? []).map(line => ({
      vaccineId: line.vaccineId.toString(),
      vaccineName: line.vaccineName,
      quantity: line.quantity,
    })),
  }))

  const totalLineCount = orderDtos.reduce(
    (sum, order) => sum + order.lines.length,
    0,
  )
  const totalItemQuantity = orderDtos.reduce(
    (sum, order) =>
      sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0),
    0,
  )

  const issuedAt = stop.qrConfirmation?.issuedAt
  const qrIssuedAt =
    issuedAt instanceof Date && !Number.isNaN(issuedAt.getTime())
      ? issuedAt.toISOString()
      : new Date(0).toISOString()

  return {
    routeId,
    stopId: stop.stopId!,
    routeDate: route.deliveryDate,
    routeStatus: route.status,
    stopSequence: stop.sequence,
    stopName: stop.pharmacyName,
    pharmacy: {
      name: stop.pharmacyName,
      addressLine,
      postalCode: address?.postalCode ?? '',
      city: address?.city ?? '',
    },
    orderCount: orderDtos.length,
    orders: orderDtos,
    totalLineCount,
    totalItemQuantity,
    qrIssuedAt,
    canConfirmDelivery: true,
  }
}

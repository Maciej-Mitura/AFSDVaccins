import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryStop } from '../delivery-stop.embed'
import { assertStopEligibleForQrRetrieval } from './delivery-stop-qr-eligibility'
import {
  DeliveryQrForbiddenException,
  DeliveryQrNotFoundException,
} from './delivery-stop-qr.exceptions'
import { buildDeliveryStopQrImagePath } from './delivery-stop-qr-image.constants'
import { DeliveryStopQr } from './delivery-stop-qr.type'
import {
  isStopQrAvailable,
  isStopQrConsumed,
} from './stop-qr-invariants'

export type AuthorisedStopQrContext = {
  route: DeliveryRoute
  stop: DeliveryStop
  routeId: string
  encodedToken: string
}

/**
 * Authorised, read-only retrieval of per-stop delivery QR material (Phase 26B).
 * Does not remint tokens, mutate MongoDB, publish PubSub, or write audit events.
 */
@Injectable()
export class DeliveryStopQrRetrievalService {
  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
  ) {}

  /**
   * Loads route/stop, enforces ownership, and returns the persisted encodedToken
   * when retrieval is eligible. Read-only.
   */
  async resolveAuthorisedEncodedToken(
    actor: User,
    routeId: string,
    stopId: string,
  ): Promise<AuthorisedStopQrContext> {
    const { route, stop, normalisedRouteId } = await this.loadRouteAndStop(
      routeId,
      stopId,
    )

    this.assertActorMayRetrieveStopQr(actor, stop)

    const encodedToken = assertStopEligibleForQrRetrieval(route.status, stop)

    return {
      route,
      stop,
      routeId: normalisedRouteId,
      encodedToken,
    }
  }

  /**
   * Safe GraphQL metadata for pharmacy/admin UI. Never exposes bearer material.
   */
  async getSafeStopQrMetadata(
    actor: User,
    routeId: string,
    stopId: string,
  ): Promise<DeliveryStopQr> {
    const { route, stop, normalisedRouteId } = await this.loadRouteAndStop(
      routeId,
      stopId,
    )

    this.assertActorMayRetrieveStopQr(actor, stop)

    const qrAvailable = isStopQrAvailable(stop)
    const qrConsumed = isStopQrConsumed(stop)
    const issuedAt = stop.qrConfirmation?.issuedAt ?? null
    const stopIdValue = stop.stopId ?? stopId

    let qrImagePath: string | null = null
    try {
      assertStopEligibleForQrRetrieval(route.status, stop)
      qrImagePath = buildDeliveryStopQrImagePath(normalisedRouteId, stopIdValue)
    } catch {
      qrImagePath = null
    }

    return {
      routeId: normalisedRouteId,
      stopId: stopIdValue,
      routeDate: route.deliveryDate,
      pharmacyName: stop.pharmacyName,
      address: stop.address,
      orderCount: stop.orderCount,
      orderIds: [...(stop.orderIds ?? [])],
      qrAvailable,
      qrConsumed,
      issuedAt:
        issuedAt instanceof Date && !Number.isNaN(issuedAt.getTime())
          ? issuedAt
          : null,
      qrImagePath,
    }
  }

  private async loadRouteAndStop(
    routeId: string,
    stopId: string,
  ): Promise<{
    route: DeliveryRoute
    stop: DeliveryStop
    normalisedRouteId: string
  }> {
    if (!hasText(stopId)) {
      throw new DeliveryQrNotFoundException()
    }

    const parsed = tryParseGraphqlObjectId(routeId)
    if (!parsed) {
      throw new DeliveryQrNotFoundException()
    }

    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsed.objectId },
    })

    if (!route) {
      throw new DeliveryQrNotFoundException()
    }

    const stop = (route.stops ?? []).find(
      candidate => candidate.stopId === stopId,
    )

    if (!stop) {
      throw new DeliveryQrNotFoundException()
    }

    return {
      route,
      stop,
      normalisedRouteId: parsed.stringValue,
    }
  }

  /**
   * ADMIN: any stop. APOTHEKER: only when persisted stop recipient matches them.
   * Never trusts a client-supplied profile id.
   */
  private assertActorMayRetrieveStopQr(
    actor: User,
    stop: DeliveryStop,
  ): void {
    if (actor.role === UserRole.ADMIN) {
      return
    }

    if (actor.role !== UserRole.APOTHEKER) {
      throw new DeliveryQrForbiddenException()
    }

    const actorUserId = actor._id.toString()
    if (stop.apothekerUserId !== actorUserId) {
      throw new DeliveryQrForbiddenException()
    }
  }
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

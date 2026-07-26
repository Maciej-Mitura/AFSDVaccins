import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { BezorgerProfileService } from '../../profile/bezorger/bezorger-profile.service'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryRouteEventsService } from '../delivery-route-events.service'
import { RouteStatus } from '../route-status.enum'
import { DeliveryStopArrivalAuditService } from './delivery-stop-arrival-audit.service'
import { DELIVERY_ARRIVAL_STATUS_RECORDED } from './delivery-stop-arrival.constants'
import {
  getStopArrival,
  stopHasDeliveryProof,
  writeStopArrivalIfAbsent,
} from './delivery-stop-arrival.consistency'
import type {
  DeliveryStopArrivalBodyDto,
  DeliveryStopArrivalResponseDto,
} from './delivery-stop-arrival.dto'
import {
  DeliveryArrivalAlreadyRecordedException,
  DeliveryArrivalConflictException,
  DeliveryArrivalFailedException,
  DeliveryArrivalForbiddenException,
  DeliveryArrivalRouteInactiveException,
  DeliveryArrivalRouteNotFoundException,
  DeliveryArrivalRouteNotStartedException,
  DeliveryArrivalStopAlreadyDeliveredException,
  DeliveryArrivalStopNotFoundException,
} from './delivery-stop-arrival.exceptions'
import {
  parseClientArrivedAt,
  parseIdempotencyKey,
} from './delivery-stop-arrival-validation.util'
import { StopArrival } from './stop-arrival.embed'
import { StopArrivalSource } from './stop-arrival-source.enum'

/**
 * Courier stop arrival (Phase 28C).
 *
 * Records that the courier reached a pharmacy stop. Does NOT:
 * - mark orders delivered
 * - consume QR / write deliveryProof
 * - decrement stock
 * - complete the route
 * - notify pharmacists
 *
 * Delivered-stop compatibility: if deliveryProof already exists, reject with
 * STOP_ALREADY_DELIVERED and do not create synthetic arrival metadata.
 */
@Injectable()
export class DeliveryStopArrivalService {
  private readonly logger = new Logger(DeliveryStopArrivalService.name)

  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    private readonly bezorgerProfileService: BezorgerProfileService,
    private readonly deliveryRouteEventsService: DeliveryRouteEventsService,
    private readonly auditService: DeliveryStopArrivalAuditService,
  ) {}

  async recordArrivalForCourier(
    actor: User,
    routeId: string,
    stopId: string,
    body: DeliveryStopArrivalBodyDto,
  ): Promise<DeliveryStopArrivalResponseDto> {
    const parsedRouteId = tryParseGraphqlObjectId(routeId)
    if (!parsedRouteId) {
      throw new DeliveryArrivalRouteNotFoundException()
    }

    const normalisedStopId = assertStopId(stopId)
    const idempotencyKey = parseIdempotencyKey(body?.idempotencyKey)

    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsedRouteId.objectId },
    })

    if (!route) {
      throw new DeliveryArrivalRouteNotFoundException()
    }

    const profile = await this.assertAssignedCourier(actor, route)
    const courierUserId = actor._id.toString()
    const courierProfileId = profile.id.toString()

    const stop = (route.stops ?? []).find(
      candidate => candidate.stopId === normalisedStopId,
    )

    if (!stop || !stop.stopId) {
      throw new DeliveryArrivalStopNotFoundException()
    }

    this.assertRouteStatusForArrival(route.status)

    if (stopHasDeliveryProof(stop)) {
      throw new DeliveryArrivalStopAlreadyDeliveredException()
    }

    const clientArrivedAt = parseClientArrivedAt(body?.clientArrivedAt, {
      routeDate: route.deliveryDate,
    })

    const existingArrival = getStopArrival(stop)
    if (existingArrival) {
      return this.resolveExistingArrival({
        routeId: parsedRouteId.stringValue,
        stopId: stop.stopId,
        existingArrival,
        idempotencyKey,
        courierUserId,
      })
    }

    // Cross-resource idempotency: same actor key must not bind a different stop.
    const priorAudit = await this.auditService.findByActorAndKey(
      courierUserId,
      idempotencyKey,
    )
    if (
      priorAudit &&
      (priorAudit.routeId !== parsedRouteId.stringValue ||
        priorAudit.stopId !== stop.stopId)
    ) {
      throw new DeliveryArrivalConflictException()
    }

    const now = new Date()
    const arrival: StopArrival = {
      clientArrivedAt,
      recordedAt: now,
      arrivedByUserId: courierUserId,
      arrivedByBezorgerProfileId: courierProfileId,
      source: StopArrivalSource.COURIER,
      idempotencyKey,
    }

    const writeResult = await writeStopArrivalIfAbsent(
      this.deliveryRouteRepository,
      {
        routeObjectId: parsedRouteId.objectId,
        stopId: stop.stopId,
        stop,
        arrival,
        now,
      },
    )

    if (!writeResult.ok) {
      const refreshed = await this.deliveryRouteRepository.findOne({
        where: { _id: parsedRouteId.objectId },
      })
      if (!refreshed) {
        throw new DeliveryArrivalRouteNotFoundException()
      }

      const refreshedStop = (refreshed.stops ?? []).find(
        candidate => candidate.stopId === stop.stopId,
      )
      if (!refreshedStop) {
        throw new DeliveryArrivalStopNotFoundException()
      }

      if (stopHasDeliveryProof(refreshedStop)) {
        throw new DeliveryArrivalStopAlreadyDeliveredException()
      }

      const racedArrival = getStopArrival(refreshedStop)
      if (racedArrival) {
        return this.resolveExistingArrival({
          routeId: parsedRouteId.stringValue,
          stopId: stop.stopId,
          existingArrival: racedArrival,
          idempotencyKey,
          courierUserId,
        })
      }

      throw new DeliveryArrivalConflictException()
    }

    const recipientCity = stop.address?.city?.trim() || ''
    const auditResult = await this.auditService.record({
      routeId: parsedRouteId.stringValue,
      stopId: stop.stopId,
      courierUserId,
      courierBezorgerProfileId: courierProfileId,
      recipientCity,
      clientArrivedAt,
      recordedAt: now,
      idempotencyKey,
    })

    if (!auditResult.inserted) {
      if (
        auditResult.existing &&
        (auditResult.existing.routeId !== parsedRouteId.stringValue ||
          auditResult.existing.stopId !== stop.stopId)
      ) {
        this.logger.warn('arrival_audit_key_conflict', {
          routeId: parsedRouteId.stringValue,
          stopId: stop.stopId,
        })
        throw new DeliveryArrivalConflictException()
      }

      if (
        !auditResult.existing ||
        auditResult.existing.idempotencyKey === idempotencyKey
      ) {
        // Same-key duplicate (or duplicate without readable row) — success, no PubSub.
        return this.toResponse({
          routeId: parsedRouteId.stringValue,
          stopId: stop.stopId,
          arrival,
        })
      }

      // Concurrent first-write with a different key — server already recorded.
      throw new DeliveryArrivalAlreadyRecordedException()
    }

    await this.deliveryRouteEventsService.publishBezorgerRouteUpdated(
      writeResult.route,
    )

    return this.toResponse({
      routeId: parsedRouteId.stringValue,
      stopId: stop.stopId,
      arrival,
    })
  }

  private resolveExistingArrival(input: {
    routeId: string
    stopId: string
    existingArrival: StopArrival
    idempotencyKey: string
    courierUserId: string
  }): DeliveryStopArrivalResponseDto {
    if (input.existingArrival.idempotencyKey === input.idempotencyKey) {
      if (input.existingArrival.arrivedByUserId !== input.courierUserId) {
        throw new DeliveryArrivalForbiddenException()
      }
      // Idempotent replay — no new audit / PubSub.
      return this.toResponse({
        routeId: input.routeId,
        stopId: input.stopId,
        arrival: input.existingArrival,
      })
    }

    throw new DeliveryArrivalAlreadyRecordedException()
  }

  private toResponse(input: {
    routeId: string
    stopId: string
    arrival: StopArrival
  }): DeliveryStopArrivalResponseDto {
    return {
      routeId: input.routeId,
      stopId: input.stopId,
      clientArrivedAt: input.arrival.clientArrivedAt.toISOString(),
      recordedAt: input.arrival.recordedAt.toISOString(),
      arrivedByUserId: input.arrival.arrivedByUserId,
      arrivalStatus: DELIVERY_ARRIVAL_STATUS_RECORDED,
    }
  }

  private async assertAssignedCourier(
    actor: User,
    route: DeliveryRoute,
  ): Promise<{ id: { toString(): string } }> {
    if (actor.role !== UserRole.BEZORGER) {
      throw new DeliveryArrivalForbiddenException()
    }

    const profile = await this.bezorgerProfileService.findByUserId(
      actor._id.toString(),
    )

    if (!profile) {
      throw new DeliveryArrivalForbiddenException()
    }

    if (route.bezorgerProfileId.toString() !== profile.id.toString()) {
      this.logger.warn('arrival_courier_mismatch', {
        routeId: route._id?.toString?.() ?? undefined,
      })
      throw new DeliveryArrivalForbiddenException()
    }

    return profile
  }

  private assertRouteStatusForArrival(status: RouteStatus): void {
    if (status === RouteStatus.ASSIGNED) {
      throw new DeliveryArrivalRouteNotStartedException()
    }

    if (status === RouteStatus.COMPLETED || status === RouteStatus.CANCELLED) {
      throw new DeliveryArrivalRouteInactiveException()
    }

    if (status !== RouteStatus.IN_PROGRESS) {
      throw new DeliveryArrivalRouteInactiveException()
    }
  }
}

function assertStopId(raw: string): string {
  if (typeof raw !== 'string') {
    throw new DeliveryArrivalStopNotFoundException()
  }
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > 128) {
    throw new DeliveryArrivalStopNotFoundException()
  }
  return trimmed
}

/** Exported for tests that need a failed-write path. */
export function assertArrivalWriteSucceeded(ok: boolean): asserts ok is true {
  if (!ok) {
    throw new DeliveryArrivalFailedException()
  }
}

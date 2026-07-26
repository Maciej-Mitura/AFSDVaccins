import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryRouteEventsService } from '../delivery-route-events.service'
import { DeliveryStop } from '../delivery-stop.embed'
import { RouteStatus } from '../route-status.enum'
import { DeliveryRouteLocationAuditService } from './delivery-route-location-audit.service'
import { writeLastKnownLocationIfAccepted } from './delivery-route-location.consistency'
import {
  DeliveryLocationCityUnavailableException,
  DeliveryLocationInvalidSequenceException,
  DeliveryLocationRouteInactiveException,
  DeliveryLocationRouteNotFoundException,
  DeliveryLocationStopNotFoundException,
} from './delivery-route-location.exceptions'
import {
  deriveNextStop,
  isStopDelivered,
  selectNextUndeliveredStop,
} from './derive-next-stop'
import { decideLocationUpdatePrecedence } from './location-precedence'
import { RouteLastKnownLocation } from './route-last-known-location.embed'
import { RouteLocationSource } from './route-location-source.enum'
import {
  RouteLocationStatus,
  RouteNextStopSummary,
} from './route-location-status.type'

export type LocationProgressResult = {
  route: DeliveryRoute
  applied: boolean
  location: RouteLastKnownLocation | null
  nextStop: DeliveryStop | null
  published: boolean
}

export type PharmacistLocationVisibility = {
  isNextStop: boolean
  lastKnownCourierCity: string | null
  lastKnownLocationRecordedAt: Date | null
  courierLocationSource: RouteLocationSource | null
}

/**
 * Coarse courier location + next-stop derivation (Phase 30A).
 *
 * Controllers never submit cities — city is always taken from the generated
 * stop address snapshot after an authorised ARRIVAL or DELIVERY event.
 *
 * Reliability policy: a location update failure must NOT roll back an already
 * successful arrival or QR delivery confirmation. Callers catch/log failures;
 * {@link recomputeRouteLocation} can repair state from stop events later.
 *
 * Prefer storing only lastKnownLocation and deriving next stop (cheap, avoids
 * dual-write drift with deliveryProof / consumed QR).
 */
@Injectable()
export class DeliveryRouteProgressLocationService {
  private readonly logger = new Logger(
    DeliveryRouteProgressLocationService.name,
  )

  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    private readonly deliveryRouteEventsService: DeliveryRouteEventsService,
    private readonly auditService: DeliveryRouteLocationAuditService,
  ) {}

  /**
   * After Phase 28C first successfully persists an arrival.
   * Does not trigger APOTHEKER_NEXT_STOP.
   */
  async recordArrivalLocation(input: {
    route: DeliveryRoute
    stop: DeliveryStop
    recordedAt: Date
    courierUserId: string
    courierBezorgerProfileId: string
    /** Stable idempotency correlation (e.g. arrival idempotencyKey). */
    arrivalEventKey: string
    publishRouteUpdate?: boolean
  }): Promise<LocationProgressResult> {
    return this.recordLocationFromAuthorisedStop({
      route: input.route,
      stop: input.stop,
      recordedAt: input.recordedAt,
      source: RouteLocationSource.ARRIVAL,
      courierUserId: input.courierUserId,
      courierBezorgerProfileId: input.courierBezorgerProfileId,
      eventId: buildArrivalLocationEventId(
        input.route._id.toString(),
        input.stop.stopId!,
        input.arrivalEventKey,
      ),
      publishRouteUpdate: input.publishRouteUpdate ?? true,
    })
  }

  /**
   * After Phase 26D QR confirmation fully finalises.
   * Caller should reuse returned nextStop for APOTHEKER_NEXT_STOP.
   */
  async recordDeliveryLocation(input: {
    route: DeliveryRoute
    stop: DeliveryStop
    deliveredAt: Date
    courierUserId: string
    courierBezorgerProfileId: string
    confirmationEventId: string
    publishRouteUpdate?: boolean
  }): Promise<LocationProgressResult> {
    return this.recordLocationFromAuthorisedStop({
      route: input.route,
      stop: input.stop,
      recordedAt: input.deliveredAt,
      source: RouteLocationSource.DELIVERY,
      courierUserId: input.courierUserId,
      courierBezorgerProfileId: input.courierBezorgerProfileId,
      eventId: buildDeliveryLocationEventId(input.confirmationEventId),
      publishRouteUpdate: input.publishRouteUpdate ?? true,
    })
  }

  deriveNextStop(
    route: DeliveryRoute,
    basisStop: DeliveryStop,
  ): DeliveryStop | null {
    return selectNextUndeliveredStop(route.stops ?? [], basisStop)
  }

  /**
   * Safe location projection for ADMIN / assigned BEZORGER route queries.
   * Pharmacists must use {@link getPharmacistLocationVisibility} instead.
   */
  getSafeLocationForActor(
    route: DeliveryRoute,
    actor: User,
    options?: { assignedBezorgerProfileId?: string | null },
  ): RouteLocationStatus | null {
    if (actor.role === UserRole.ADMIN) {
      return this.buildSafeLocationStatus(route)
    }

    if (actor.role === UserRole.BEZORGER) {
      const assignedId = options?.assignedBezorgerProfileId
      if (
        assignedId == null ||
        route.bezorgerProfileId.toString() !== assignedId.toString()
      ) {
        return null
      }
      return this.buildSafeLocationStatus(route)
    }

    // APOTHEKER must not receive admin/courier location payload via this helper.
    return null
  }

  /**
   * Pharmacist planned-delivery visibility for one of their stops.
   * City/time only when their stop is the derived next stop and route is active.
   */
  getPharmacistLocationVisibility(
    route: DeliveryRoute,
    pharmacistStop: DeliveryStop,
  ): PharmacistLocationVisibility {
    const empty: PharmacistLocationVisibility = {
      isNextStop: false,
      lastKnownCourierCity: null,
      lastKnownLocationRecordedAt: null,
      courierLocationSource: null,
    }

    if (route.status !== RouteStatus.IN_PROGRESS) {
      return empty
    }

    if (isStopDelivered(pharmacistStop)) {
      return empty
    }

    const location = route.lastKnownLocation ?? null
    if (!location?.stopId) {
      return empty
    }

    const basisStop = (route.stops ?? []).find(
      candidate => candidate.stopId === location.stopId,
    )
    if (!basisStop) {
      return empty
    }

    const next = this.deriveNextStop(route, basisStop)
    if (!next?.stopId || next.stopId !== pharmacistStop.stopId) {
      return empty
    }

    return {
      isNextStop: true,
      lastKnownCourierCity: location.city,
      lastKnownLocationRecordedAt: location.recordedAt,
      courierLocationSource: location.source,
    }
  }

  buildSafeLocationStatus(route: DeliveryRoute): RouteLocationStatus {
    const location = route.lastKnownLocation ?? null
    const hasLocation = Boolean(location?.city)

    let nextStopSummary: RouteNextStopSummary | null = null

    if (route.status === RouteStatus.IN_PROGRESS && location?.stopId) {
      const basisStop = (route.stops ?? []).find(
        candidate => candidate.stopId === location.stopId,
      )
      if (basisStop) {
        const next = this.deriveNextStop(route, basisStop)
        if (next?.stopId) {
          nextStopSummary = {
            stopId: next.stopId,
            sequence: next.sequence,
            pharmacyName: next.pharmacyName,
            city: next.address?.city?.trim() || '',
          }
        }
      }
    }

    return {
      hasLocation,
      city: hasLocation ? location!.city : null,
      recordedAt: hasLocation ? location!.recordedAt : null,
      source: hasLocation ? location!.source : null,
      stopSequence: hasLocation ? location!.stopSequence : null,
      hasNextStop: nextStopSummary != null,
      nextStop: nextStopSummary,
    }
  }

  /**
   * ADMIN / internal maintenance: rebuild lastKnownLocation from stop events.
   * Idempotent. Not run automatically on startup.
   */
  async recomputeRouteLocation(routeId: string): Promise<LocationProgressResult> {
    const parsed = tryParseGraphqlObjectId(routeId)
    if (!parsed) {
      throw new DeliveryLocationRouteNotFoundException()
    }

    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsed.objectId },
    })
    if (!route) {
      throw new DeliveryLocationRouteNotFoundException()
    }

    const candidate = selectLatestLocationCandidate(route)
    if (!candidate) {
      return {
        route,
        applied: false,
        location: route.lastKnownLocation ?? null,
        nextStop: null,
        published: false,
      }
    }

    if (route.status !== RouteStatus.IN_PROGRESS) {
      // Preserve historical location on COMPLETED/CANCELLED — do not erase;
      // only repair when still IN_PROGRESS.
      return {
        route,
        applied: false,
        location: route.lastKnownLocation ?? null,
        nextStop: null,
        published: false,
      }
    }

    return this.applyCandidate({
      routeObjectId: parsed.objectId,
      routeId: parsed.stringValue,
      candidate,
      publishRouteUpdate: true,
    })
  }

  private async recordLocationFromAuthorisedStop(input: {
    route: DeliveryRoute
    stop: DeliveryStop
    recordedAt: Date
    source: RouteLocationSource
    courierUserId: string
    courierBezorgerProfileId: string
    eventId: string
    publishRouteUpdate: boolean
  }): Promise<LocationProgressResult> {
    if (!input.stop.stopId) {
      throw new DeliveryLocationStopNotFoundException()
    }

    if (input.route.status !== RouteStatus.IN_PROGRESS) {
      throw new DeliveryLocationRouteInactiveException()
    }

    const city = input.stop.address?.city?.trim()
    if (!city) {
      throw new DeliveryLocationCityUnavailableException()
    }

    const sequenceCheck = deriveNextStop(
      input.route.stops ?? [],
      input.stop,
    )
    if (!sequenceCheck.ok && sequenceCheck.reason === 'invalid_sequence') {
      throw new DeliveryLocationInvalidSequenceException()
    }

    const candidate: RouteLastKnownLocation = {
      stopId: input.stop.stopId,
      stopSequence: input.stop.sequence,
      city,
      recordedAt: input.recordedAt,
      source: input.source,
      recordedByUserId: input.courierUserId,
      recordedByBezorgerProfileId: input.courierBezorgerProfileId,
      eventId: input.eventId,
    }

    const routeObjectId =
      typeof input.route._id === 'string'
        ? new ObjectId(input.route._id)
        : (input.route._id as unknown as ObjectId)

    return this.applyCandidate({
      routeObjectId,
      routeId: input.route._id.toString(),
      candidate,
      publishRouteUpdate: input.publishRouteUpdate,
    })
  }

  private async applyCandidate(input: {
    routeObjectId: ObjectId
    routeId: string
    candidate: RouteLastKnownLocation
    publishRouteUpdate: boolean
  }): Promise<LocationProgressResult> {
    const now = new Date()
    let writeResult = await writeLastKnownLocationIfAccepted(
      this.deliveryRouteRepository,
      {
        routeObjectId: input.routeObjectId,
        candidate: input.candidate,
        now,
      },
    )

    // Concurrent race: re-read and re-evaluate once.
    if (!writeResult.ok && writeResult.reason === 'cas_miss') {
      writeResult = await writeLastKnownLocationIfAccepted(
        this.deliveryRouteRepository,
        {
          routeObjectId: input.routeObjectId,
          candidate: input.candidate,
          now,
        },
      )
    }

    if (!writeResult.ok) {
      if (writeResult.reason === 'not_found') {
        throw new DeliveryLocationRouteNotFoundException()
      }
      if (writeResult.reason === 'route_inactive') {
        throw new DeliveryLocationRouteInactiveException()
      }
      // Still cas_miss after retry — treat as operational failure for caller policy.
      this.logger.warn({
        event: 'delivery_location_cas_miss',
        routeId: input.routeId,
        eventId: input.candidate.eventId,
      })
      const refreshed = await this.deliveryRouteRepository.findOne({
        where: { _id: input.routeObjectId },
      })
      const route =
        refreshed ??
        ({
          _id: input.routeObjectId,
        } as unknown as DeliveryRoute)
      const basis =
        route.stops?.find(s => s.stopId === input.candidate.stopId) ?? null
      return {
        route,
        applied: false,
        location: route.lastKnownLocation ?? null,
        nextStop: basis
          ? selectNextUndeliveredStop(route.stops ?? [], basis)
          : null,
        published: false,
      }
    }

    const route = writeResult.route
    const basisStop =
      route.stops?.find(s => s.stopId === input.candidate.stopId) ?? null
    const nextStop = basisStop
      ? selectNextUndeliveredStop(route.stops ?? [], basisStop)
      : null

    let published = false

    if (writeResult.applied) {
      const audit = await this.auditService.record({
        routeId: input.routeId,
        stopId: input.candidate.stopId,
        source: input.candidate.source,
        city: input.candidate.city,
        recordedAt: input.candidate.recordedAt,
        courierUserId: input.candidate.recordedByUserId,
        courierBezorgerProfileId:
          input.candidate.recordedByBezorgerProfileId,
        eventId: input.candidate.eventId,
      })

      if (audit.inserted && input.publishRouteUpdate) {
        await this.deliveryRouteEventsService.publishBezorgerRouteUpdated(route)
        published = true
      }
    }

    return {
      route,
      applied: writeResult.applied,
      location: route.lastKnownLocation ?? input.candidate,
      nextStop,
      published,
    }
  }
}

export function buildArrivalLocationEventId(
  routeId: string,
  stopId: string,
  arrivalEventKey: string,
): string {
  return `location:arrival:${routeId}:${stopId}:${arrivalEventKey}`
}

export function buildDeliveryLocationEventId(
  confirmationEventId: string,
): string {
  return `location:delivery:${confirmationEventId}`
}

type LocationCandidate = RouteLastKnownLocation

/**
 * Pick the latest valid location candidate from stop arrival / deliveryProof.
 * DELIVERY wins ties on the same stop; newer timestamps win across stops.
 */
export function selectLatestLocationCandidate(
  route: DeliveryRoute,
): LocationCandidate | null {
  let best: LocationCandidate | null = null

  for (const stop of route.stops ?? []) {
    if (!stop.stopId) {
      continue
    }

    const city = stop.address?.city?.trim()
    if (!city) {
      continue
    }

    if (stop.arrival?.recordedAt) {
      const arrivalCandidate: LocationCandidate = {
        stopId: stop.stopId,
        stopSequence: stop.sequence,
        city,
        recordedAt: stop.arrival.recordedAt,
        source: RouteLocationSource.ARRIVAL,
        recordedByUserId: stop.arrival.arrivedByUserId,
        recordedByBezorgerProfileId: stop.arrival.arrivedByBezorgerProfileId,
        eventId: buildArrivalLocationEventId(
          route._id.toString(),
          stop.stopId,
          stop.arrival.idempotencyKey || stop.stopId,
        ),
      }
      best = pickPreferredCandidate(best, arrivalCandidate)
    }

    if (stop.deliveryProof?.deliveredAt) {
      const deliveryCandidate: LocationCandidate = {
        stopId: stop.stopId,
        stopSequence: stop.sequence,
        city: stop.deliveryProof.recipientCity?.trim() || city,
        recordedAt: stop.deliveryProof.deliveredAt,
        source: RouteLocationSource.DELIVERY,
        recordedByUserId: stop.deliveryProof.deliveredByUserId,
        recordedByBezorgerProfileId: route.bezorgerProfileId.toString(),
        eventId: buildDeliveryLocationEventId(
          stop.deliveryProof.confirmationEventId ||
            `proof:${route._id.toString()}:${stop.stopId}`,
        ),
      }
      best = pickPreferredCandidate(best, deliveryCandidate)
    }
  }

  return best
}

function pickPreferredCandidate(
  current: LocationCandidate | null,
  candidate: LocationCandidate,
): LocationCandidate {
  if (!current) {
    return candidate
  }
  const decision = decideLocationUpdatePrecedence(current, candidate)
  return decision === 'accept' ? candidate : current
}

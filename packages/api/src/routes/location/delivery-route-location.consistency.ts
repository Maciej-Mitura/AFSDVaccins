import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { DeliveryRoute } from '../delivery-route.entity'
import { RouteStatus } from '../route-status.enum'
import { decideLocationUpdatePrecedence } from './location-precedence'
import { RouteLastKnownLocation } from './route-last-known-location.embed'

export type WriteLastKnownLocationResult =
  | { ok: true; applied: true; route: DeliveryRoute }
  | {
      ok: true
      applied: false
      reason: 'noop_duplicate' | 'stale'
      route: DeliveryRoute
    }
  | { ok: false; reason: 'cas_miss' | 'route_inactive' | 'not_found' }

type MongoUpdateResult = {
  matchedCount?: number
  modifiedCount?: number
  result?: { nModified?: number; n?: number }
}

function readModifiedCount(result: unknown): number {
  if (!result || typeof result !== 'object') {
    return 0
  }
  const typed = result as MongoUpdateResult
  if (typeof typed.modifiedCount === 'number') {
    return typed.modifiedCount
  }
  if (typeof typed.result?.nModified === 'number') {
    return typed.result.nModified
  }
  return 0
}

/**
 * Conditional write of route.lastKnownLocation.
 *
 * Location may update only while the route is IN_PROGRESS.
 * Uses expected-current-eventId CAS so concurrent writers re-evaluate precedence.
 *
 * Precedence (see location-precedence.ts):
 * 1. duplicate eventId → no-op
 * 2. newer recordedAt wins
 * 3. equal time on same stop: DELIVERY outranks ARRIVAL
 * 4. older events never overwrite
 */
export async function writeLastKnownLocationIfAccepted(
  repository: MongoRepository<DeliveryRoute>,
  input: {
    routeObjectId: ObjectId
    candidate: RouteLastKnownLocation
    now: Date
  },
): Promise<WriteLastKnownLocationResult> {
  const route = await repository.findOne({
    where: { _id: input.routeObjectId },
  })

  if (!route) {
    return { ok: false, reason: 'not_found' }
  }

  if (route.status !== RouteStatus.IN_PROGRESS) {
    return { ok: false, reason: 'route_inactive' }
  }

  const current = route.lastKnownLocation ?? null
  const decision = decideLocationUpdatePrecedence(current, input.candidate)

  if (decision === 'noop_duplicate') {
    return { ok: true, applied: false, reason: 'noop_duplicate', route }
  }

  if (decision === 'stale') {
    return { ok: true, applied: false, reason: 'stale', route }
  }

  const expectedEventId = current?.eventId ?? null

  const filter: Record<string, unknown> = {
    _id: input.routeObjectId,
    status: RouteStatus.IN_PROGRESS,
  }

  if (expectedEventId == null) {
    filter.$or = [
      { lastKnownLocation: { $exists: false } },
      { lastKnownLocation: null },
    ]
  } else {
    filter['lastKnownLocation.eventId'] = expectedEventId
  }

  const updateResult = await repository.updateOne(filter, {
    $set: {
      lastKnownLocation: {
        stopId: input.candidate.stopId,
        stopSequence: input.candidate.stopSequence,
        city: input.candidate.city,
        recordedAt: input.candidate.recordedAt,
        source: input.candidate.source,
        recordedByUserId: input.candidate.recordedByUserId,
        recordedByBezorgerProfileId:
          input.candidate.recordedByBezorgerProfileId,
        eventId: input.candidate.eventId,
      },
      updatedAt: input.now,
    },
  })

  if (readModifiedCount(updateResult) !== 1) {
    return { ok: false, reason: 'cas_miss' }
  }

  const updated = await repository.findOne({
    where: { _id: input.routeObjectId },
  })

  if (!updated) {
    return { ok: false, reason: 'cas_miss' }
  }

  if (updated.lastKnownLocation?.eventId !== input.candidate.eventId) {
    return { ok: false, reason: 'cas_miss' }
  }

  return { ok: true, applied: true, route: updated }
}

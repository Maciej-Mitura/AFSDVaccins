import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryStop } from '../delivery-stop.embed'
import { RouteStatus } from '../route-status.enum'
import { StopArrival } from './stop-arrival.embed'
import { StopArrivalSource } from './stop-arrival-source.enum'

export type WriteStopArrivalInput = {
  routeObjectId: ObjectId
  stopId: string
  stop: DeliveryStop
  arrival: StopArrival
  now: Date
}

export type WriteStopArrivalResult =
  { ok: true; route: DeliveryRoute } | { ok: false; reason: 'cas_miss' }

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
 * Atomically write arrival onto a stop that does not yet have arrival or
 * deliveryProof. Concurrent writers: one wins; loser gets cas_miss.
 */
export async function writeStopArrivalIfAbsent(
  repository: MongoRepository<DeliveryRoute>,
  input: WriteStopArrivalInput,
): Promise<WriteStopArrivalResult> {
  const arrivalDoc = {
    clientArrivedAt: input.arrival.clientArrivedAt,
    recordedAt: input.arrival.recordedAt,
    arrivedByUserId: input.arrival.arrivedByUserId,
    arrivedByBezorgerProfileId: input.arrival.arrivedByBezorgerProfileId,
    source: StopArrivalSource.COURIER,
    idempotencyKey: input.arrival.idempotencyKey,
  }

  const updateResult = await repository.updateOne(
    {
      _id: input.routeObjectId,
      status: RouteStatus.IN_PROGRESS,
      stops: {
        $elemMatch: {
          stopId: input.stopId,
          arrival: null,
          deliveryProof: null,
        },
      },
    },
    {
      $set: {
        'stops.$.arrival': arrivalDoc,
        updatedAt: input.now,
      },
    },
  )

  if (readModifiedCount(updateResult) !== 1) {
    return { ok: false, reason: 'cas_miss' }
  }

  const updated = await repository.findOne({
    where: { _id: input.routeObjectId },
  })

  if (!updated) {
    return { ok: false, reason: 'cas_miss' }
  }

  const written = (updated.stops ?? []).find(
    candidate => candidate.stopId === input.stopId,
  )
  if (
    !written?.arrival ||
    written.arrival.idempotencyKey !== input.arrival.idempotencyKey
  ) {
    return { ok: false, reason: 'cas_miss' }
  }

  return { ok: true, route: updated }
}

export function getStopArrival(stop: DeliveryStop): StopArrival | null {
  const arrival = stop.arrival
  if (arrival == null) {
    return null
  }
  if (
    !(arrival.clientArrivedAt instanceof Date) ||
    Number.isNaN(arrival.clientArrivedAt.getTime()) ||
    !(arrival.recordedAt instanceof Date) ||
    Number.isNaN(arrival.recordedAt.getTime())
  ) {
    return null
  }
  return arrival
}

export function stopHasDeliveryProof(stop: DeliveryStop): boolean {
  return stop.deliveryProof != null
}

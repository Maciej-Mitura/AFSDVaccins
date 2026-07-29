import { ObjectId } from 'mongodb'
import type { MongoRepository } from 'typeorm'

import { countIncompleteDeliverableStops } from '../delivery-lifecycle.policy'
import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryStop } from '../delivery-stop.embed'
import { RouteStatus } from '../route-status.enum'
import { DeliveryProofMethod } from './delivery-proof-method.enum'
import {
  DELIVERY_QR_CONFIRM_STALE_CLAIM_MS,
  DELIVERY_QR_CONSUMED_ENCODED_TOKEN_PLACEHOLDER,
} from './delivery-qr-confirm.constants'
import {
  StopConfirmationProcess,
  StopConfirmationProcessState,
} from './stop-confirmation-process.embed'
import { StopDeliveryProof } from './stop-delivery-proof.embed'
import { assertStopQrInvariants } from './stop-qr-invariants'

/**
 * Phase 26D consistency strategy (resumable)
 * ==========================================
 *
 * Standalone MongoDB does not provide multi-document transactions. Confirmation
 * therefore uses a two-phase CAS on the stop:
 *
 * 1. **Claim PROCESSING** — write `confirmationProcess` only. Do **not** consume
 *    the QR, do **not** clear `encodedToken`, do **not** write `deliveryProof`.
 * 2. Deliver all stop orders idempotently, tagging each with
 *    `deliveryConfirmationEventId` (stock keys remain `delivery-decrement:…`).
 * 3. **Finalise COMPLETED** — CAS consume + clear token + write `deliveryProof` +
 *    mark process COMPLETED, only when still PROCESSING for the same event id.
 * 4. Audit (unique on `confirmationEventId`) then PubSub.
 *
 * Crash during PROCESSING leaves the token verifiable. Retry by the assigned
 * courier resumes the same `confirmationEventId`, finishes remaining orders, and
 * finalises. Stale PROCESSING claims (see `DELIVERY_QR_CONFIRM_STALE_CLAIM_MS`)
 * may be reclaimed while preserving the original event id for provenance.
 *
 * Route completion remains an explicit `updateRouteStatus(…, COMPLETED)`.
 */

export type BeginProcessingClaimInput = {
  routeObjectId: ObjectId
  stopId: string
  courierUserId: string
  confirmationEventId: string
  now: Date
  stop: DeliveryStop
}

export type BeginProcessingClaimResult =
  | {
      ok: true
      route: DeliveryRoute
      confirmationEventId: string
      resumed: boolean
    }
  | { ok: false; reason: 'cas_miss' }

export type FinaliseStopDeliveryInput = {
  routeObjectId: ObjectId
  stopId: string
  courierUserId: string
  assignedCourierUserId: string
  associatedOrderIds: string[]
  recipientProfileId: string
  recipientCity: string
  confirmationEventId: string
  deliveredAt: Date
  stop: DeliveryStop
}

export type FinaliseStopDeliveryResult =
  | { ok: true; route: DeliveryRoute }
  | { ok: false; reason: 'cas_miss' }

export function isConfirmationProcessProcessing(
  stop: DeliveryStop | null | undefined,
): boolean {
  return (
    stop?.confirmationProcess?.state === StopConfirmationProcessState.PROCESSING
  )
}

export function isConfirmationProcessCompleted(
  stop: DeliveryStop | null | undefined,
): boolean {
  return (
    stop?.confirmationProcess?.state === StopConfirmationProcessState.COMPLETED
  )
}

export function isProcessingClaimStale(
  process: StopConfirmationProcess,
  now: Date = new Date(),
  staleMs: number = DELIVERY_QR_CONFIRM_STALE_CLAIM_MS,
): boolean {
  const anchor = process.lastUpdatedAt ?? process.claimedAt
  if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) {
    return true
  }
  return now.getTime() - anchor.getTime() >= staleMs
}

/**
 * Atomically begin (or reclaim a stale) PROCESSING claim without consuming the QR.
 */
export async function beginStopConfirmationProcessing(
  repository: MongoRepository<DeliveryRoute>,
  input: BeginProcessingClaimInput,
): Promise<BeginProcessingClaimResult> {
  const confirmation = input.stop.qrConfirmation
  if (confirmation == null) {
    return { ok: false, reason: 'cas_miss' }
  }

  const process: StopConfirmationProcess = {
    state: StopConfirmationProcessState.PROCESSING,
    confirmationEventId: input.confirmationEventId,
    claimedAt: input.now,
    claimedByUserId: input.courierUserId,
    lastUpdatedAt: input.now,
  }

  const claimedStop: DeliveryStop = {
    ...input.stop,
    confirmationProcess: process,
    deliveryProof: null,
  }

  assertStopQrInvariants(claimedStop)

  const updated = (await repository.findOneAndUpdate(
    {
      _id: input.routeObjectId,
      status: RouteStatus.IN_PROGRESS,
      stops: {
        $elemMatch: {
          stopId: input.stopId,
          'qrConfirmation.consumedAt': null,
          'qrConfirmation.consumedByUserId': null,
          deliveryProof: null,
          confirmationProcess: null,
        },
      },
    },
    {
      $set: {
        'stops.$': claimedStop,
        updatedAt: input.now,
      },
    },
    { returnDocument: 'after' },
  )) as DeliveryRoute | null

  if (!updated) {
    return { ok: false, reason: 'cas_miss' }
  }

  return {
    ok: true,
    route: updated,
    confirmationEventId: input.confirmationEventId,
    resumed: false,
  }
}

/**
 * Reclaim a stale PROCESSING claim for the assigned courier.
 * Preserves `confirmationEventId` so order provenance remains valid.
 */
export async function reclaimStaleStopConfirmationProcessing(
  repository: MongoRepository<DeliveryRoute>,
  input: {
    routeObjectId: ObjectId
    stopId: string
    courierUserId: string
    confirmationEventId: string
    staleBefore: Date
    now: Date
    stop: DeliveryStop
  },
): Promise<BeginProcessingClaimResult> {
  const confirmation = input.stop.qrConfirmation
  if (confirmation == null) {
    return { ok: false, reason: 'cas_miss' }
  }

  const process: StopConfirmationProcess = {
    state: StopConfirmationProcessState.PROCESSING,
    confirmationEventId: input.confirmationEventId,
    claimedAt: input.stop.confirmationProcess?.claimedAt ?? input.now,
    claimedByUserId: input.courierUserId,
    lastUpdatedAt: input.now,
  }

  const claimedStop: DeliveryStop = {
    ...input.stop,
    confirmationProcess: process,
    deliveryProof: null,
  }

  assertStopQrInvariants(claimedStop)

  const updated = (await repository.findOneAndUpdate(
    {
      _id: input.routeObjectId,
      status: RouteStatus.IN_PROGRESS,
      stops: {
        $elemMatch: {
          stopId: input.stopId,
          'qrConfirmation.consumedAt': null,
          deliveryProof: null,
          'confirmationProcess.state': StopConfirmationProcessState.PROCESSING,
          'confirmationProcess.confirmationEventId': input.confirmationEventId,
          'confirmationProcess.lastUpdatedAt': { $lte: input.staleBefore },
        },
      },
    },
    {
      $set: {
        'stops.$': claimedStop,
        updatedAt: input.now,
      },
    },
    { returnDocument: 'after' },
  )) as DeliveryRoute | null

  if (!updated) {
    return { ok: false, reason: 'cas_miss' }
  }

  return {
    ok: true,
    route: updated,
    confirmationEventId: input.confirmationEventId,
    resumed: true,
  }
}

/**
 * Touch lastUpdatedAt on an in-flight PROCESSING claim (same actor resume).
 */
export async function touchStopConfirmationProcessing(
  repository: MongoRepository<DeliveryRoute>,
  input: {
    routeObjectId: ObjectId
    stopId: string
    confirmationEventId: string
    courierUserId: string
    now: Date
    stop: DeliveryStop
  },
): Promise<DeliveryRoute | null> {
  const process = input.stop.confirmationProcess
  if (
    process == null ||
    process.state !== StopConfirmationProcessState.PROCESSING
  ) {
    return null
  }

  const nextStop: DeliveryStop = {
    ...input.stop,
    confirmationProcess: {
      ...process,
      lastUpdatedAt: input.now,
      claimedByUserId: input.courierUserId,
    },
  }

  return (await repository.findOneAndUpdate(
    {
      _id: input.routeObjectId,
      status: RouteStatus.IN_PROGRESS,
      stops: {
        $elemMatch: {
          stopId: input.stopId,
          'confirmationProcess.state': StopConfirmationProcessState.PROCESSING,
          'confirmationProcess.confirmationEventId': input.confirmationEventId,
          'qrConfirmation.consumedAt': null,
          deliveryProof: null,
        },
      },
    },
    {
      $set: {
        'stops.$': nextStop,
        updatedAt: input.now,
      },
    },
    { returnDocument: 'after' },
  )) as DeliveryRoute | null
}

/**
 * Atomically finalise: consume QR, clear token, write proof, mark COMPLETED.
 */
export async function finaliseStopDeliveryByQr(
  repository: MongoRepository<DeliveryRoute>,
  input: FinaliseStopDeliveryInput,
): Promise<FinaliseStopDeliveryResult> {
  const confirmation = input.stop.qrConfirmation
  if (confirmation == null) {
    return { ok: false, reason: 'cas_miss' }
  }

  const deliveryProof: StopDeliveryProof = {
    method: DeliveryProofMethod.QR,
    deliveredAt: input.deliveredAt,
    deliveredByUserId: input.courierUserId,
    associatedOrderIds: [...input.associatedOrderIds],
    recipientProfileId: input.recipientProfileId,
    recipientCity: input.recipientCity,
    confirmationEventId: input.confirmationEventId,
  }

  const existingProcess = input.stop.confirmationProcess
  const completedProcess: StopConfirmationProcess = {
    state: StopConfirmationProcessState.COMPLETED,
    confirmationEventId: input.confirmationEventId,
    claimedAt: existingProcess?.claimedAt ?? input.deliveredAt,
    claimedByUserId: input.courierUserId,
    lastUpdatedAt: input.deliveredAt,
  }

  const finalStop: DeliveryStop = {
    ...input.stop,
    qrConfirmation: {
      ...confirmation,
      encodedToken: DELIVERY_QR_CONSUMED_ENCODED_TOKEN_PLACEHOLDER,
      consumedAt: input.deliveredAt,
      consumedByUserId: input.courierUserId,
    },
    deliveryProof,
    confirmationProcess: completedProcess,
  }

  assertStopQrInvariants(finalStop, {
    assignedCourierUserId: input.assignedCourierUserId,
  })

  const updated = (await repository.findOneAndUpdate(
    {
      _id: input.routeObjectId,
      status: RouteStatus.IN_PROGRESS,
      stops: {
        $elemMatch: {
          stopId: input.stopId,
          'confirmationProcess.state': StopConfirmationProcessState.PROCESSING,
          'confirmationProcess.confirmationEventId': input.confirmationEventId,
          'qrConfirmation.consumedAt': null,
          deliveryProof: null,
        },
      },
    },
    {
      $set: {
        'stops.$': finalStop,
        updatedAt: input.deliveredAt,
      },
    },
    { returnDocument: 'after' },
  )) as DeliveryRoute | null

  if (!updated) {
    return { ok: false, reason: 'cas_miss' }
  }

  return { ok: true, route: updated }
}

/** Remaining deliverable stops that still need QR confirmation. */
export function countRemainingUndeliveredStops(
  stops: readonly DeliveryStop[] | null | undefined,
): number {
  return countIncompleteDeliverableStops(stops)
}

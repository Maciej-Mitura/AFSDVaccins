import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import {
  DeliveryStopArrivalAuditEvent,
  DeliveryStopArrivalAuditEventType,
} from './delivery-stop-arrival-audit.entity'

export type RecordDeliveryStopArrivalAuditInput = {
  routeId: string
  stopId: string
  courierUserId: string
  courierBezorgerProfileId: string
  recipientCity: string
  clientArrivedAt: Date
  recordedAt: Date
  idempotencyKey: string
}

export type ArrivalAuditLookup = {
  routeId: string
  stopId: string
  courierUserId: string
  idempotencyKey: string
}

@Injectable()
export class DeliveryStopArrivalAuditService {
  constructor(
    @InjectRepository(DeliveryStopArrivalAuditEvent)
    private readonly auditRepository: MongoRepository<DeliveryStopArrivalAuditEvent>,
  ) {}

  /**
   * Persist exactly one focused arrival audit row.
   * Duplicate (courierUserId, idempotencyKey) or (routeId, stopId) is treated
   * as already recorded.
   * Returns whether a new row was inserted.
   */
  async record(
    input: RecordDeliveryStopArrivalAuditInput,
  ): Promise<{ inserted: boolean; existing: ArrivalAuditLookup | null }> {
    const priorByKey = await this.findByActorAndKey(
      input.courierUserId,
      input.idempotencyKey,
    )
    if (priorByKey) {
      return { inserted: false, existing: priorByKey }
    }

    const priorByStop = await this.auditRepository.findOne({
      where: {
        routeId: input.routeId,
        stopId: input.stopId,
      },
    })
    if (priorByStop) {
      return {
        inserted: false,
        existing: {
          routeId: priorByStop.routeId,
          stopId: priorByStop.stopId,
          courierUserId: priorByStop.courierUserId,
          idempotencyKey: priorByStop.idempotencyKey,
        },
      }
    }

    const event = this.auditRepository.create({
      type: DeliveryStopArrivalAuditEventType.DELIVERY_STOP_ARRIVAL_RECORDED,
      routeId: input.routeId,
      stopId: input.stopId,
      courierUserId: input.courierUserId,
      courierBezorgerProfileId: input.courierBezorgerProfileId,
      recipientCity: input.recipientCity,
      clientArrivedAt: input.clientArrivedAt,
      recordedAt: input.recordedAt,
      idempotencyKey: input.idempotencyKey,
    })

    try {
      await this.auditRepository.insert(event)
      return { inserted: true, existing: null }
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error
      }

      const existing =
        (await this.findByActorAndKey(
          input.courierUserId,
          input.idempotencyKey,
        )) ??
        (await this.auditRepository
          .findOne({
            where: {
              routeId: input.routeId,
              stopId: input.stopId,
            },
          })
          .then(row =>
            row
              ? {
                  routeId: row.routeId,
                  stopId: row.stopId,
                  courierUserId: row.courierUserId,
                  idempotencyKey: row.idempotencyKey,
                }
              : null,
          ))

      return { inserted: false, existing }
    }
  }

  async findByActorAndKey(
    courierUserId: string,
    idempotencyKey: string,
  ): Promise<ArrivalAuditLookup | null> {
    const existing = await this.auditRepository.findOne({
      where: { courierUserId, idempotencyKey },
    })
    if (!existing) {
      return null
    }
    return {
      routeId: existing.routeId,
      stopId: existing.stopId,
      courierUserId: existing.courierUserId,
      idempotencyKey: existing.idempotencyKey,
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const withCode = error as { code?: number; message?: string }
  if (withCode.code === 11000) {
    return true
  }

  const message =
    typeof withCode.message === 'string'
      ? withCode.message
      : error instanceof Error
        ? error.message
        : ''
  if (message.includes('E11000') || message.includes('duplicate key')) {
    return true
  }

  const nested = (error as { driverError?: unknown }).driverError
  if (nested && nested !== error) {
    return isDuplicateKeyError(nested)
  }

  return false
}

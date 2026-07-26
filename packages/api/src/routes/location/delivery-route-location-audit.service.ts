import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import {
  DeliveryRouteLocationAuditEvent,
  DeliveryRouteLocationAuditEventType,
} from './delivery-route-location-audit.entity'
import { RouteLocationSource } from './route-location-source.enum'

export type RecordDeliveryRouteLocationAuditInput = {
  routeId: string
  stopId: string
  source: RouteLocationSource
  city: string
  recordedAt: Date
  courierUserId: string
  courierBezorgerProfileId: string
  eventId: string
}

export type RecordLocationAuditResult = {
  inserted: boolean
}

@Injectable()
export class DeliveryRouteLocationAuditService {
  constructor(
    @InjectRepository(DeliveryRouteLocationAuditEvent)
    private readonly auditRepository: MongoRepository<DeliveryRouteLocationAuditEvent>,
  ) {}

  /**
   * Persist exactly one location audit row per eventId.
   * Duplicate eventId → already recorded (unique index).
   */
  async record(
    input: RecordDeliveryRouteLocationAuditInput,
  ): Promise<RecordLocationAuditResult> {
    const event = this.auditRepository.create({
      type: DeliveryRouteLocationAuditEventType.DELIVERY_ROUTE_LOCATION_UPDATED,
      routeId: input.routeId,
      stopId: input.stopId,
      source: input.source,
      city: input.city,
      recordedAt: input.recordedAt,
      courierUserId: input.courierUserId,
      courierBezorgerProfileId: input.courierBezorgerProfileId,
      eventId: input.eventId,
    })

    try {
      await this.auditRepository.save(event)
      return { inserted: true }
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return { inserted: false }
      }
      throw error
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  )
}

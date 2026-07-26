import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { isMongoNamespaceNotFound } from '../../config/mongo-connection'
import { DeliveryStopArrivalAuditEvent } from './delivery-stop-arrival-audit.entity'

export const ARRIVAL_AUDIT_ACTOR_KEY_INDEX =
  'delivery_stop_arrival_audit_actor_idempotency_unique'
export const ARRIVAL_AUDIT_ROUTE_STOP_INDEX =
  'delivery_stop_arrival_audit_route_stop_unique'

/**
 * Ensures unique indexes for arrival audit idempotency / single-event guarantees.
 */
@Injectable()
export class DeliveryStopArrivalAuditPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(
    DeliveryStopArrivalAuditPersistenceService.name,
  )

  constructor(
    @InjectRepository(DeliveryStopArrivalAuditEvent)
    private readonly auditRepository: MongoRepository<DeliveryStopArrivalAuditEvent>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureIndexes()
  }

  async ensureIndexes(): Promise<void> {
    try {
      await this.auditRepository.createCollectionIndex(
        { courierUserId: 1, idempotencyKey: 1 },
        { unique: true, name: ARRIVAL_AUDIT_ACTOR_KEY_INDEX },
      )
      await this.auditRepository.createCollectionIndex(
        { routeId: 1, stopId: 1 },
        { unique: true, name: ARRIVAL_AUDIT_ROUTE_STOP_INDEX },
      )
    } catch (error) {
      if (isMongoNamespaceNotFound(error)) {
        this.logger.log(
          'delivery_stop_arrival_audit_events collection not present yet; indexes deferred',
        )
        return
      }
      // Index already exists with same options is fine on some drivers.
      if (isIndexAlreadyExistsError(error)) {
        return
      }
      this.logger.warn(
        `Failed to ensure arrival audit indexes: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      )
    }
  }
}

function isIndexAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = (error as { code?: number }).code
  const codeName = (error as { codeName?: string }).codeName
  const message = error instanceof Error ? error.message : 'unknown'
  return (
    code === 85 ||
    code === 86 ||
    codeName === 'IndexOptionsConflict' ||
    codeName === 'IndexKeySpecsConflict' ||
    message.includes('already exists')
  )
}

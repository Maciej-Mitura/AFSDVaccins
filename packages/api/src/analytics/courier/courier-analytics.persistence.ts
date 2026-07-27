import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { isMongoNamespaceNotFound } from '../../config/mongo-connection'
import { DeliveryRoute } from '../../routes/delivery-route.entity'
import { CourierAnalyticsAuditEvent } from './courier-analytics-audit.entity'

/**
 * Index rationale (Phase 32A):
 *
 * All-time analytics scans `delivery_routes`. Existing single-field indexes on
 * `bezorgerProfileId`, `deliveryDate`, and `status` already support courier
 * grouping and overdue derivation after load.
 *
 * New compound `{ status: 1, deliveryDate: 1 }` helps any future bounded scan
 * that filters terminal vs overdue incomplete routes without a full collection
 * walk when the dataset grows.
 *
 * Intentionally NOT indexing `stops.deliveryProof.deliveredAt` — multikey
 * indexes on large embedded stop arrays would be expensive for little gain
 * when the calculator already inspects stops in memory after a route load.
 */
export const COURIER_ANALYTICS_ROUTE_STATUS_DATE_INDEX =
  'delivery_routes_status_deliveryDate'

export const COURIER_ANALYTICS_AUDIT_ACTOR_GENERATED_INDEX =
  'courier_analytics_audit_actor_generatedAt'

@Injectable()
export class CourierAnalyticsPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(CourierAnalyticsPersistenceService.name)

  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly routeRepository: MongoRepository<DeliveryRoute>,
    @InjectRepository(CourierAnalyticsAuditEvent)
    private readonly auditRepository: MongoRepository<CourierAnalyticsAuditEvent>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureIndexes()
  }

  async ensureIndexes(): Promise<void> {
    try {
      await this.routeRepository.createCollectionIndex(
        { status: 1, deliveryDate: 1 },
        { name: COURIER_ANALYTICS_ROUTE_STATUS_DATE_INDEX },
      )
    } catch (error) {
      this.warnIndexFailure('delivery_routes status/deliveryDate', error)
    }

    try {
      await this.auditRepository.createCollectionIndex(
        { actorUserId: 1, generatedAt: -1 },
        { name: COURIER_ANALYTICS_AUDIT_ACTOR_GENERATED_INDEX },
      )
    } catch (error) {
      this.warnIndexFailure('courier_analytics_audit_events', error)
    }
  }

  private warnIndexFailure(label: string, error: unknown): void {
    if (isMongoNamespaceNotFound(error)) {
      this.logger.log(`${label} collection not present yet; indexes deferred`)
      return
    }
    if (isIndexAlreadyExistsError(error)) {
      return
    }
    this.logger.warn(
      `Failed to ensure ${label} indexes: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
    )
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

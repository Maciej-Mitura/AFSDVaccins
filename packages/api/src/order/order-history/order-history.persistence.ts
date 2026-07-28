import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { isMongoNamespaceNotFound } from '../../config/mongo-connection'
import { Order } from '../order.entity'

/**
 * Phase 35B2 history indexes:
 * - apothekerId + submittedAt + _id: pharmacist pages (newest-first cursor)
 * - status + submittedAt + _id: status-filtered newest-first pages
 * - deliveryDate + submittedAt: planned delivery day range scans
 *
 * Intentionally NOT indexing deliveredByUserId — BEZORGER history is deferred.
 */
export const ORDER_HISTORY_APOTHEKER_SUBMITTED_INDEX =
  'orders_history_apothekerId_submittedAt__id'

export const ORDER_HISTORY_STATUS_SUBMITTED_INDEX =
  'orders_history_status_submittedAt__id'

export const ORDER_HISTORY_DELIVERY_DATE_SUBMITTED_INDEX =
  'orders_history_deliveryDate_submittedAt'

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

@Injectable()
export class OrderHistoryPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(OrderHistoryPersistenceService.name)

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: MongoRepository<Order>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureIndexes()
  }

  async ensureIndexes(): Promise<void> {
    try {
      await this.orderRepository.createCollectionIndex(
        { apothekerId: 1, submittedAt: -1, _id: -1 },
        { name: ORDER_HISTORY_APOTHEKER_SUBMITTED_INDEX },
      )
    } catch (error) {
      this.warnIndexFailure('orders apothekerId/submittedAt/_id', error)
    }

    try {
      await this.orderRepository.createCollectionIndex(
        { status: 1, submittedAt: -1, _id: -1 },
        { name: ORDER_HISTORY_STATUS_SUBMITTED_INDEX },
      )
    } catch (error) {
      this.warnIndexFailure('orders status/submittedAt/_id', error)
    }

    try {
      await this.orderRepository.createCollectionIndex(
        { deliveryDate: 1, submittedAt: -1 },
        { name: ORDER_HISTORY_DELIVERY_DATE_SUBMITTED_INDEX },
      )
    } catch (error) {
      this.warnIndexFailure('orders deliveryDate/submittedAt', error)
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

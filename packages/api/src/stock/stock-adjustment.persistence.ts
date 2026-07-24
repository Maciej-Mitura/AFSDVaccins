import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { isMongoNamespaceNotFound } from '../config/mongo-connection'
import { StockAdjustment } from './stock-adjustment.entity'

export const STOCK_ADJUSTMENT_IDEMPOTENCY_INDEX_NAME =
  'stock_adjustments_idempotency_key_string_unique'

export type MongoCollectionIndex = {
  name: string
  key: Record<string, number>
  unique?: boolean
  partialFilterExpression?: Record<string, unknown>
}

export const STOCK_ADJUSTMENT_IDEMPOTENCY_PARTIAL_INDEX = {
  key: { idempotencyKey: 1 },
  name: STOCK_ADJUSTMENT_IDEMPOTENCY_INDEX_NAME,
  unique: true,
  partialFilterExpression: {
    idempotencyKey: { $type: 'string' },
  },
} as const

export type MongoUpdateManyResult = {
  modifiedCount?: number
}

function readModifiedCount(result: unknown): number {
  if (
    typeof result === 'object' &&
    result !== null &&
    'modifiedCount' in result &&
    typeof (result as MongoUpdateManyResult).modifiedCount === 'number'
  ) {
    return (result as MongoUpdateManyResult).modifiedCount ?? 0
  }

  return 0
}

@Injectable()
export class StockAdjustmentPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(StockAdjustmentPersistenceService.name)

  constructor(
    @InjectRepository(StockAdjustment)
    private readonly stockAdjustmentRepository: MongoRepository<StockAdjustment>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeStockAdjustmentPersistence()
  }

  async initializeStockAdjustmentPersistence(): Promise<void> {
    const repairedCount = await this.repairLegacyNullIdempotencyKeys()
    await this.ensurePartialUniqueIdempotencyIndex()

    if (repairedCount > 0) {
      this.logger.log(
        `Unset null idempotencyKey on ${repairedCount} stock adjustment record(s)`,
      )
    }
  }

  async repairLegacyNullIdempotencyKeys(): Promise<number> {
    const result = await this.stockAdjustmentRepository.updateMany(
      { idempotencyKey: { $type: 'null' } },
      { $unset: { idempotencyKey: '' } },
    )

    return readModifiedCount(result)
  }

  async dropLegacyIdempotencyKeyIndexes(): Promise<void> {
    let indexes: MongoCollectionIndex[]

    try {
      indexes = (await this.stockAdjustmentRepository.collectionIndexes()) as MongoCollectionIndex[]
    } catch (error) {
      // Empty Atlas DB: collection does not exist yet — listIndexes → NamespaceNotFound.
      // Other Mongo errors (auth, network, malformed indexes) remain fatal.
      if (isMongoNamespaceNotFound(error)) {
        this.logger.log(
          'stock_adjustments collection not present yet; skipping legacy index inspection',
        )
        return
      }
      throw error
    }

    for (const index of indexes) {
      if (index.name === '_id_') {
        continue
      }

      if (!Object.prototype.hasOwnProperty.call(index.key ?? {}, 'idempotencyKey')) {
        continue
      }

      if (index.name === STOCK_ADJUSTMENT_IDEMPOTENCY_INDEX_NAME) {
        continue
      }

      await this.stockAdjustmentRepository.dropCollectionIndex(index.name)
    }
  }

  async ensurePartialUniqueIdempotencyIndex(): Promise<void> {
    await this.dropLegacyIdempotencyKeyIndexes()

    await this.stockAdjustmentRepository.createCollectionIndex(
      STOCK_ADJUSTMENT_IDEMPOTENCY_PARTIAL_INDEX.key,
      {
        name: STOCK_ADJUSTMENT_IDEMPOTENCY_PARTIAL_INDEX.name,
        unique: STOCK_ADJUSTMENT_IDEMPOTENCY_PARTIAL_INDEX.unique,
        partialFilterExpression:
          STOCK_ADJUSTMENT_IDEMPOTENCY_PARTIAL_INDEX.partialFilterExpression,
      },
    )
  }
}

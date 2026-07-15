import { MongoRepository } from 'typeorm'

import { StockAdjustment } from './stock-adjustment.entity'
import {
  STOCK_ADJUSTMENT_IDEMPOTENCY_INDEX_NAME,
  STOCK_ADJUSTMENT_IDEMPOTENCY_PARTIAL_INDEX,
  StockAdjustmentPersistenceService,
} from './stock-adjustment.persistence'

describe('StockAdjustmentPersistenceService', () => {
  let service: StockAdjustmentPersistenceService
  let repository: jest.Mocked<
    Pick<
      MongoRepository<StockAdjustment>,
      | 'updateMany'
      | 'collectionIndexes'
      | 'dropCollectionIndex'
      | 'createCollectionIndex'
    >
  >

  beforeEach(() => {
    repository = {
      updateMany: jest.fn(),
      collectionIndexes: jest.fn(),
      dropCollectionIndex: jest.fn(),
      createCollectionIndex: jest.fn(),
    }

    service = new StockAdjustmentPersistenceService(
      repository as unknown as MongoRepository<StockAdjustment>,
    )
  })

  it('repairs legacy idempotencyKey null records without deleting history', async () => {
    repository.updateMany.mockResolvedValue({ modifiedCount: 2 })

    await expect(service.repairLegacyNullIdempotencyKeys()).resolves.toBe(2)

    expect(repository.updateMany).toHaveBeenCalledWith(
      { idempotencyKey: { $type: 'null' } },
      { $unset: { idempotencyKey: '' } },
    )
  })

  it('drops legacy idempotency indexes before creating the partial unique index', async () => {
    repository.collectionIndexes.mockResolvedValue([
      { name: '_id_', key: { _id: 1 } },
      {
        name: 'IDX_8d091264ce5d0fa67585e5ba64',
        key: { idempotencyKey: 1 },
        unique: true,
      },
    ])

    await service.ensurePartialUniqueIdempotencyIndex()

    expect(repository.dropCollectionIndex).toHaveBeenCalledWith(
      'IDX_8d091264ce5d0fa67585e5ba64',
    )
    expect(repository.createCollectionIndex).toHaveBeenCalledWith(
      STOCK_ADJUSTMENT_IDEMPOTENCY_PARTIAL_INDEX.key,
      {
        name: STOCK_ADJUSTMENT_IDEMPOTENCY_INDEX_NAME,
        unique: true,
        partialFilterExpression: {
          idempotencyKey: { $type: 'string' },
        },
      },
    )
  })

  it('ignores missing idempotencyKey values via partial filter expression', async () => {
    repository.collectionIndexes.mockResolvedValue([
      { name: '_id_', key: { _id: 1 } },
    ])

    await service.ensurePartialUniqueIdempotencyIndex()

    expect(repository.createCollectionIndex).toHaveBeenCalledWith(
      { idempotencyKey: 1 },
      expect.objectContaining({
        partialFilterExpression: {
          idempotencyKey: { $type: 'string' },
        },
      }),
    )
  })

  it('runs repair and index initialization idempotently on startup', async () => {
    repository.updateMany.mockResolvedValue({ modifiedCount: 0 })
    repository.collectionIndexes.mockResolvedValue([
      { name: '_id_', key: { _id: 1 } },
      {
        name: STOCK_ADJUSTMENT_IDEMPOTENCY_INDEX_NAME,
        key: { idempotencyKey: 1 },
        unique: true,
        partialFilterExpression: {
          idempotencyKey: { $type: 'string' },
        },
      },
    ])

    await service.initializeStockAdjustmentPersistence()

    expect(repository.updateMany).toHaveBeenCalledTimes(1)
    expect(repository.dropCollectionIndex).not.toHaveBeenCalled()
    expect(repository.createCollectionIndex).toHaveBeenCalledTimes(1)
  })
})

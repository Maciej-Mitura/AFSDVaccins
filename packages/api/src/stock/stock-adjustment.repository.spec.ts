import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { StockAdjustmentType } from './stock-adjustment-type.enum'
import { StockAdjustment } from './stock-adjustment.entity'
import { StockAdjustmentRepository } from './stock-adjustment.repository'

describe('StockAdjustmentRepository', () => {
  let repository: StockAdjustmentRepository
  let mongoRepository: jest.Mocked<
    Pick<MongoRepository<StockAdjustment>, 'insertOne'>
  >

  const vaccineObjectId = new ObjectId('507f1f77bcf86cd799439011')
  const basePayload = {
    vaccineObjectId,
    type: StockAdjustmentType.RESTOCK,
    quantityDelta: 5,
    quantityBefore: 10,
    quantityAfter: 15,
    reason: 'Delivery',
    performedByUserId: '507f1f77bcf86cd799439012',
    relatedOrderId: null,
  }

  beforeEach(() => {
    mongoRepository = {
      insertOne: jest.fn(),
    }

    repository = new StockAdjustmentRepository(
      mongoRepository as unknown as MongoRepository<StockAdjustment>,
    )
  })

  it('persists manual adjustments without the idempotencyKey property', async () => {
    mongoRepository.insertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId('6a569d2cbb2590db980429cd'),
    })

    await repository.insertManualAdjustment(basePayload)

    const insertedDocument = mongoRepository.insertOne.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined

    expect(insertedDocument).toBeDefined()
    expect(insertedDocument).not.toHaveProperty('idempotencyKey')
  })

  it('allows many manual adjustments with no idempotencyKey', async () => {
    mongoRepository.insertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId(),
    })

    for (let index = 0; index < 5; index += 1) {
      await repository.insertManualAdjustment({
        ...basePayload,
        quantityAfter: 15 + index,
      })
    }

    expect(mongoRepository.insertOne).toHaveBeenCalledTimes(5)
    for (const call of mongoRepository.insertOne.mock.calls) {
      expect(call[0]).not.toHaveProperty('idempotencyKey')
    }
  })

  it('persists real idempotency keys for future idempotent operations', async () => {
    mongoRepository.insertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId('6a569d2cbb2590db980429ce'),
    })

    await repository.insertIdempotentAdjustment({
      ...basePayload,
      idempotencyKey: 'delivery-decrement:order-a',
    })

    expect(mongoRepository.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'delivery-decrement:order-a',
      }),
    )
  })

  it('propagates duplicate idempotency key conflicts from MongoDB', async () => {
    mongoRepository.insertOne.mockRejectedValue({
      code: 11000,
      message: 'E11000 duplicate key error',
    })

    await expect(
      repository.insertIdempotentAdjustment({
        ...basePayload,
        idempotencyKey: 'delivery-decrement:order-a',
      }),
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('allows different real idempotency keys', async () => {
    mongoRepository.insertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId(),
    })

    await repository.insertIdempotentAdjustment({
      ...basePayload,
      idempotencyKey: 'delivery-decrement:order-a',
    })

    await repository.insertIdempotentAdjustment({
      ...basePayload,
      idempotencyKey: 'delivery-decrement:order-b',
    })

    expect(mongoRepository.insertOne).toHaveBeenCalledTimes(2)
  })
})

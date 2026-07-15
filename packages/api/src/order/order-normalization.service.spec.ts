import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { OrderNormalizationService } from './order-normalization.service'
import { Order } from './order.entity'
import { OrderStatus } from './order-status.enum'

describe('OrderNormalizationService', () => {
  let service: OrderNormalizationService
  let repository: jest.Mocked<
    Pick<MongoRepository<Order>, 'updateOne'>
  >

  const apothekerId = '507f1f77bcf86cd799439011'
  const submittedAt = new Date('2026-07-14T10:00:00.000Z')
  const cancelledAt = new Date('2026-07-14T11:00:00.000Z')

  beforeEach(async () => {
    repository = {
      updateOne: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderNormalizationService,
        {
          provide: getRepositoryToken(Order),
          useValue: repository,
        },
      ],
    }).compile()

    service = module.get(OrderNormalizationService)
  })

  function legacyOrder(overrides: Partial<Order> = {}): Order {
    return {
      _id: '6a569d2cbb2590db980429cd',
      id: '6a569d2cbb2590db980429cd',
      apothekerId,
      status: OrderStatus.PENDING,
      orderLines: [],
      totalQuantity: 5,
      isoWeek: 29,
      isoYear: 2026,
      submittedAt,
      deliveryDate: '2026-07-15',
      createdAt: submittedAt,
      updatedAt: submittedAt,
      ...overrides,
    }
  }

  it('normalizes legacy PENDING orders with initial history', async () => {
    const order = legacyOrder()

    const normalized = await service.normalizeOrderIfNeeded(order)

    expect(normalized.statusHistory).toHaveLength(1)
    expect(normalized.statusHistory?.[0]).toMatchObject({
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      changedByUserId: apothekerId,
    })
    expect(repository.updateOne).toHaveBeenCalledTimes(1)
  })

  it('does not rewrite orders that already have status history', async () => {
    const order = legacyOrder({
      statusHistory: [
        {
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedAt: submittedAt,
          changedByUserId: apothekerId,
        },
      ],
    })

    await service.normalizeOrderIfNeeded(order)

    expect(repository.updateOne).not.toHaveBeenCalled()
  })

  it('reconstructs CANCELLED legacy history', async () => {
    const order = legacyOrder({
      status: OrderStatus.CANCELLED,
      cancelledAt,
    })

    const normalized = await service.normalizeOrderIfNeeded(order)

    expect(normalized.statusHistory).toHaveLength(2)
    expect(normalized.statusHistory?.[1]).toMatchObject({
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.CANCELLED,
      changedAt: cancelledAt,
    })
  })

  it('reconstructs DELIVERED legacy history without stockDecrementedAt', async () => {
    const order = legacyOrder({
      status: OrderStatus.DELIVERED,
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    })

    const normalized = await service.normalizeOrderIfNeeded(order)

    expect(normalized.statusHistory?.length).toBeGreaterThan(0)
    expect(normalized.stockDecrementedAt).toBeUndefined()
  })
})

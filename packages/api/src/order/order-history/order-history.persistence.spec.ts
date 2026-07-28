import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { Order } from '../order.entity'
import {
  ORDER_HISTORY_APOTHEKER_SUBMITTED_INDEX,
  ORDER_HISTORY_DELIVERY_DATE_SUBMITTED_INDEX,
  ORDER_HISTORY_STATUS_SUBMITTED_INDEX,
  OrderHistoryPersistenceService,
} from './order-history.persistence'

describe('OrderHistoryPersistenceService', () => {
  let service: OrderHistoryPersistenceService
  let repository: jest.Mocked<
    Pick<MongoRepository<Order>, 'createCollectionIndex'>
  >

  beforeEach(async () => {
    repository = {
      createCollectionIndex: jest.fn().mockResolvedValue('ok'),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderHistoryPersistenceService,
        {
          provide: getRepositoryToken(Order),
          useValue: repository,
        },
      ],
    }).compile()

    service = module.get(OrderHistoryPersistenceService)
  })

  it('creates the three history indexes', async () => {
    await service.ensureIndexes()

    expect(repository.createCollectionIndex).toHaveBeenCalledWith(
      { apothekerId: 1, submittedAt: -1, _id: -1 },
      { name: ORDER_HISTORY_APOTHEKER_SUBMITTED_INDEX },
    )
    expect(repository.createCollectionIndex).toHaveBeenCalledWith(
      { status: 1, submittedAt: -1, _id: -1 },
      { name: ORDER_HISTORY_STATUS_SUBMITTED_INDEX },
    )
    expect(repository.createCollectionIndex).toHaveBeenCalledWith(
      { deliveryDate: 1, submittedAt: -1 },
      { name: ORDER_HISTORY_DELIVERY_DATE_SUBMITTED_INDEX },
    )
  })
})

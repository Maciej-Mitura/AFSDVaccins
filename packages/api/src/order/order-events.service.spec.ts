import { PubSub } from 'graphql-subscriptions'

import {
  ORDER_CREATED_EVENT,
  ORDER_UPDATED_EVENT,
} from '../common/pubsub/pubsub.constants'
import { OrderStatus } from './order-status.enum'
import { OrderEventsService } from './order-events.service'
import { Order } from './order.entity'

describe('OrderEventsService', () => {
  let pubSub: PubSub
  let service: OrderEventsService

  const order: Order = {
    _id: 'order-a',
    id: 'order-a',
    apothekerId: '507f1f77bcf86cd799439011',
    status: OrderStatus.PENDING,
    orderLines: [],
    totalQuantity: 1,
    isoWeek: 29,
    isoYear: 2026,
    submittedAt: new Date('2026-07-14T10:00:00.000Z'),
    deliveryDate: '2026-07-14',
    cancelledAt: null,
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
    updatedAt: new Date('2026-07-14T10:00:00.000Z'),
  }

  beforeEach(() => {
    pubSub = new PubSub()
    service = new OrderEventsService(pubSub)
  })

  it('publishes orderCreated after persistence boundary', async () => {
    const iterator = pubSub.asyncIterableIterator(ORDER_CREATED_EVENT)
    const nextPromise = iterator.next()

    await service.publishOrderCreated(order)

    await expect(nextPromise).resolves.toEqual({
      done: false,
      value: { orderCreated: order },
    })
  })

  it('publishes orderUpdated after cancellation boundary', async () => {
    const cancelled: Order = {
      ...order,
      id: order.id,
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date('2026-07-14T11:00:00.000Z'),
    }

    const iterator = pubSub.asyncIterableIterator(ORDER_UPDATED_EVENT)
    const nextPromise = iterator.next()

    await service.publishOrderUpdated(cancelled)

    await expect(nextPromise).resolves.toEqual({
      done: false,
      value: { orderUpdated: cancelled },
    })
  })
})

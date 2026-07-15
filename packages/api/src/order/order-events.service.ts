import { Inject, Injectable } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'

import {
  ORDER_CREATED_EVENT,
  ORDER_UPDATED_EVENT,
  PUB_SUB,
} from '../common/pubsub/pubsub.constants'
import { Order } from './order.entity'

@Injectable()
export class OrderEventsService {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  async publishOrderCreated(order: Order): Promise<void> {
    await this.pubSub.publish(ORDER_CREATED_EVENT, { orderCreated: order })
  }

  async publishOrderUpdated(order: Order): Promise<void> {
    await this.pubSub.publish(ORDER_UPDATED_EVENT, { orderUpdated: order })
  }
}

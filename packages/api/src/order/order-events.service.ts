import { Inject, Injectable } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'

import {
  ADMIN_OPERATIONS_FEED_EVENT,
  ORDER_CREATED_EVENT,
  ORDER_UPDATED_EVENT,
  PUB_SUB,
} from '../common/pubsub/pubsub.constants'
import { Vaccine } from '../vaccine/vaccine.entity'
import {
  AdminOperationsEventType,
  AdminOperationsFeedEvent,
} from './admin-operations-feed.type'
import { Order } from './order.entity'

@Injectable()
export class OrderEventsService {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  async publishOrderCreated(order: Order): Promise<void> {
    await this.pubSub.publish(ORDER_CREATED_EVENT, { orderCreated: order })
    await this.publishAdminOperationsFeed({
      eventType: AdminOperationsEventType.NEW_ORDER,
      occurredAt: order.submittedAt ?? new Date(),
      order,
      message: `Nieuwe bestelling ${order.id} (${order.totalQuantity} dosissen)`,
    })
  }

  async publishOrderUpdated(order: Order): Promise<void> {
    await this.pubSub.publish(ORDER_UPDATED_EVENT, { orderUpdated: order })
  }

  async publishOrderStatusChanged(order: Order): Promise<void> {
    await this.publishOrderUpdated(order)
    await this.publishAdminOperationsFeed({
      eventType: AdminOperationsEventType.ORDER_STATUS_CHANGED,
      occurredAt: new Date(),
      order,
      message: `Bestelling ${order.id} status: ${order.status}`,
    })
  }

  async publishAdminLowStock(
    vaccine: Vaccine,
    quantityAfter: number,
  ): Promise<void> {
    await this.publishAdminOperationsFeed({
      eventType: AdminOperationsEventType.LOW_STOCK,
      occurredAt: new Date(),
      vaccine,
      message: `${vaccine.name} heeft nog ${quantityAfter} dosissen (drempel: ${vaccine.stockWarningThreshold}).`,
    })
  }

  private async publishAdminOperationsFeed(
    event: AdminOperationsFeedEvent,
  ): Promise<void> {
    await this.pubSub.publish(ADMIN_OPERATIONS_FEED_EVENT, {
      adminOperationsFeed: event,
    })
  }
}

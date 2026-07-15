import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { OrderStatusHistoryEntry } from './order-status-history.type'
import { Order } from './order.entity'
import { OrderStatus } from './order-status.enum'

@Injectable()
export class OrderNormalizationService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: MongoRepository<Order>,
  ) {}

  needsStatusHistoryNormalization(order: Order): boolean {
    return !Array.isArray(order.statusHistory) || order.statusHistory.length === 0
  }

  buildInitialStatusHistory(order: Order): OrderStatusHistoryEntry[] {
    const submittedAt = order.submittedAt ?? order.createdAt ?? new Date()
    const actorId = order.apothekerId.toString()

    const pendingEntry: OrderStatusHistoryEntry = {
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      changedAt: submittedAt,
      changedByUserId: actorId,
      reason: null,
    }

    if (order.status === OrderStatus.PENDING) {
      return [pendingEntry]
    }

    if (order.status === OrderStatus.CANCELLED) {
      const cancelledAt =
        order.cancelledAt ?? order.updatedAt ?? submittedAt

      return [
        pendingEntry,
        {
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.CANCELLED,
          changedAt: cancelledAt,
          changedByUserId: actorId,
          reason: null,
        },
      ]
    }

    if (order.status === OrderStatus.PLANNED) {
      const plannedAt = order.updatedAt ?? submittedAt

      return [
        pendingEntry,
        {
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.PLANNED,
          changedAt: plannedAt,
          changedByUserId: actorId,
          reason: null,
        },
      ]
    }

    if (order.status === OrderStatus.DELIVERED) {
      const deliveredAt = order.updatedAt ?? submittedAt

      return [
        pendingEntry,
        {
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.DELIVERED,
          changedAt: deliveredAt,
          changedByUserId: actorId,
          reason: 'Legacy order — exact transition path unknown',
        },
      ]
    }

    return [pendingEntry]
  }

  async normalizeOrderIfNeeded(order: Order): Promise<Order> {
    if (!this.needsStatusHistoryNormalization(order)) {
      return order
    }

    const statusHistory = this.buildInitialStatusHistory(order)

    await this.orderRepository.updateOne(
      { _id: order._id },
      { $set: { statusHistory } },
    )

    order.statusHistory = statusHistory

    return order
  }

  async normalizeOrdersIfNeeded(orders: Order[]): Promise<Order[]> {
    return Promise.all(orders.map(order => this.normalizeOrderIfNeeded(order)))
  }
}

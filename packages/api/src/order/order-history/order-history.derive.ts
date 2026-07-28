import { Order } from '../order.entity'
import { OrderStatus } from '../order-status.enum'

/**
 * Latest CANCELLED statusHistory reason. Null when absent or not cancelled.
 * Does not invent reasons from updatedAt or other fields.
 */
export function deriveCancellationReason(order: Order): string | null {
  if (order.status !== OrderStatus.CANCELLED) {
    return null
  }

  const history = Array.isArray(order.statusHistory) ? order.statusHistory : []

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i]
    if (entry?.toStatus === OrderStatus.CANCELLED) {
      return entry.reason ?? null
    }
  }

  return null
}

export function orderIdString(order: Order): string {
  return typeof order._id === 'string' ? order._id : String(order._id)
}

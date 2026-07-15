import { OrderStatus } from './order-status.enum'

const ALLOWED_TRANSITIONS: ReadonlyMap<OrderStatus, ReadonlySet<OrderStatus>> =
  new Map([
    [
      OrderStatus.PENDING,
      new Set([
        OrderStatus.PLANNED,
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
      ]),
    ],
    [
      OrderStatus.PLANNED,
      new Set([OrderStatus.DELIVERED]),
    ],
    [OrderStatus.DELIVERED, new Set()],
    [OrderStatus.CANCELLED, new Set()],
  ])

export function canTransitionOrderStatus(
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
): boolean {
  if (fromStatus === toStatus) {
    return true
  }

  return ALLOWED_TRANSITIONS.get(fromStatus)?.has(toStatus) ?? false
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return (
    status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED
  )
}

export function canAdminCancelOrder(status: OrderStatus): boolean {
  return status === OrderStatus.PENDING
}

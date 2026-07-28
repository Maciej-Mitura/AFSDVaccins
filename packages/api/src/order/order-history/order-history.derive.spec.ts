import { Order } from '../order.entity'
import { OrderStatus } from '../order-status.enum'
import { deriveCancellationReason } from './order-history.derive'

describe('deriveCancellationReason', () => {
  it('returns the latest CANCELLED history reason', () => {
    const order = {
      status: OrderStatus.CANCELLED,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedAt: new Date('2026-07-14T10:00:00.000Z'),
          changedByUserId: 'u1',
          reason: null,
        },
        {
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.CANCELLED,
          changedAt: new Date('2026-07-14T11:00:00.000Z'),
          changedByUserId: 'u1',
          reason: 'Customer request',
        },
      ],
    } as Order

    expect(deriveCancellationReason(order)).toBe('Customer request')
  })

  it('returns null when cancelled without reason', () => {
    const order = {
      status: OrderStatus.CANCELLED,
      statusHistory: [
        {
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.CANCELLED,
          changedAt: new Date('2026-07-14T11:00:00.000Z'),
          changedByUserId: 'u1',
          reason: null,
        },
      ],
    } as Order

    expect(deriveCancellationReason(order)).toBeNull()
  })

  it('returns null for non-cancelled orders', () => {
    const order = {
      status: OrderStatus.DELIVERED,
      statusHistory: [],
    } as unknown as Order

    expect(deriveCancellationReason(order)).toBeNull()
  })
})

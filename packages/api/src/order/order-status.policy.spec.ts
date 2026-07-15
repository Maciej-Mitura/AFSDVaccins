import { OrderStatus } from './order-status.enum'
import {
  canAdminCancelOrder,
  canTransitionOrderStatus,
  isTerminalOrderStatus,
} from './order-status.policy'

describe('OrderStatusPolicy', () => {
  it('allows PENDING to PLANNED', () => {
    expect(canTransitionOrderStatus(OrderStatus.PENDING, OrderStatus.PLANNED)).toBe(
      true,
    )
  })

  it('allows PLANNED to DELIVERED', () => {
    expect(
      canTransitionOrderStatus(OrderStatus.PLANNED, OrderStatus.DELIVERED),
    ).toBe(true)
  })

  it('allows PENDING to DELIVERED shortcut', () => {
    expect(
      canTransitionOrderStatus(OrderStatus.PENDING, OrderStatus.DELIVERED),
    ).toBe(true)
  })

  it('allows PENDING to CANCELLED', () => {
    expect(
      canTransitionOrderStatus(OrderStatus.PENDING, OrderStatus.CANCELLED),
    ).toBe(true)
  })

  it('forbids PLANNED to CANCELLED', () => {
    expect(
      canTransitionOrderStatus(OrderStatus.PLANNED, OrderStatus.CANCELLED),
    ).toBe(false)
  })

  it('treats DELIVERED as terminal', () => {
    expect(isTerminalOrderStatus(OrderStatus.DELIVERED)).toBe(true)
    expect(
      canTransitionOrderStatus(OrderStatus.DELIVERED, OrderStatus.PLANNED),
    ).toBe(false)
  })

  it('treats CANCELLED as terminal', () => {
    expect(isTerminalOrderStatus(OrderStatus.CANCELLED)).toBe(true)
    expect(
      canTransitionOrderStatus(OrderStatus.CANCELLED, OrderStatus.PENDING),
    ).toBe(false)
  })

  it('allows idempotent same-status requests', () => {
    expect(canTransitionOrderStatus(OrderStatus.PLANNED, OrderStatus.PLANNED)).toBe(
      true,
    )
  })

  it('allows admin cancel only from PENDING', () => {
    expect(canAdminCancelOrder(OrderStatus.PENDING)).toBe(true)
    expect(canAdminCancelOrder(OrderStatus.PLANNED)).toBe(false)
    expect(canAdminCancelOrder(OrderStatus.DELIVERED)).toBe(false)
  })
})

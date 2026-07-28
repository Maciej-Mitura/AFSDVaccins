/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { OrderStatus } from '@vaccin-delivery/types'

import {
  buildOrderHistoryInput,
  createDefaultOrderHistoryFilters,
  hasActiveOrderHistoryFilters,
  shortOrderId,
} from '@/composables/order-history-filters'

describe('order-history-filters', () => {
  it('builds status filter', () => {
    const filters = createDefaultOrderHistoryFilters()
    filters.status = OrderStatus.Delivered
    const input = buildOrderHistoryInput(filters, {
      allowApothekerFilter: true,
    })
    expect(input.status).toBe(OrderStatus.Delivered)
    expect(input.first).toBe(25)
  })

  it('builds period filter from client clock for last 7 days', () => {
    const filters = createDefaultOrderHistoryFilters()
    filters.period = '7d'
    const now = new Date(2026, 6, 28, 15, 30, 0)
    const input = buildOrderHistoryInput(filters, {
      allowApothekerFilter: false,
      now,
    })
    expect(input.submittedFrom).toEqual(new Date(2026, 6, 21, 0, 0, 0, 0))
    expect(input.submittedTo).toEqual(new Date(2026, 6, 28, 23, 59, 59, 999))
    expect(input.deliveryDateFrom).toBeUndefined()
  })

  it('builds custom delivery date filters', () => {
    const filters = createDefaultOrderHistoryFilters()
    filters.period = 'custom'
    filters.deliveryDateFrom = '2026-07-01'
    filters.deliveryDateTo = '2026-07-15'
    const input = buildOrderHistoryInput(filters, {
      allowApothekerFilter: false,
    })
    expect(input.deliveryDateFrom).toBe('2026-07-01')
    expect(input.deliveryDateTo).toBe('2026-07-15')
    expect(input.submittedFrom).toBeUndefined()
  })

  it('omits apothekerId when not allowed', () => {
    const filters = createDefaultOrderHistoryFilters()
    filters.apothekerId = '507f1f77bcf86cd799439011'
    const input = buildOrderHistoryInput(filters, {
      allowApothekerFilter: false,
    })
    expect(input.apothekerId).toBeUndefined()
  })

  it('includes apothekerId for ADMIN', () => {
    const filters = createDefaultOrderHistoryFilters()
    filters.apothekerId = '507f1f77bcf86cd799439011'
    const input = buildOrderHistoryInput(filters, {
      allowApothekerFilter: true,
    })
    expect(input.apothekerId).toBe('507f1f77bcf86cd799439011')
  })

  it('detects active filters and clear defaults', () => {
    const filters = createDefaultOrderHistoryFilters()
    expect(hasActiveOrderHistoryFilters(filters)).toBe(false)
    filters.search = 'abc'
    expect(hasActiveOrderHistoryFilters(filters)).toBe(true)
  })

  it('shortens order ids', () => {
    expect(shortOrderId('6a569d2cbb2590db980429cd')).toBe('980429cd')
    expect(shortOrderId('abcd')).toBe('abcd')
  })
})

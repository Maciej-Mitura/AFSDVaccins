import { describe, expect, it } from 'vitest'

import {
  applyCancelMutationFailure,
  applyStatusMutationFailure,
  clearCancelActionError,
  clearStatusActionError,
  shouldRefetchAfterSuccessfulStatusMutation,
  shouldShowOrdersLoadError,
} from './admin-order-mutation-state'

describe('admin-order-mutation-state', () => {
  const baseState = {
    statusActionError: null,
    cancelActionError: null,
    ordersError: null,
  }

  it('failed mark-delivered preserves orders error separation', () => {
    const next = applyStatusMutationFailure(
      { ...baseState, ordersError: null },
      'Insufficient stock for this adjustment',
    )

    expect(next.statusActionError).toBe('Insufficient stock for this adjustment')
    expect(next.ordersError).toBeNull()
  })

  it('INSUFFICIENT_STOCK sets mutation error only', () => {
    const next = applyStatusMutationFailure(
      { ...baseState, ordersError: 'Query failed' },
      'Insufficient stock for this adjustment',
    )

    expect(next.statusActionError).toContain('Insufficient stock')
    expect(next.ordersError).toBe('Query failed')
  })

  it('query error state remains unchanged after mutation failure helper', () => {
    const next = applyStatusMutationFailure(
      {
        statusActionError: null,
        cancelActionError: null,
        ordersError: null,
      },
      'Insufficient stock for this adjustment',
    )

    expect(next.ordersError).toBeNull()
  })

  it('successful mutation should refetch', () => {
    expect(shouldRefetchAfterSuccessfulStatusMutation(true)).toBe(true)
    expect(shouldRefetchAfterSuccessfulStatusMutation(false)).toBe(false)
  })

  it('failed mutation should not trigger refetch helper', () => {
    expect(shouldRefetchAfterSuccessfulStatusMutation(false)).toBe(false)
  })

  it('mutation error can be cleared independently', () => {
    const cleared = clearStatusActionError({
      ...baseState,
      statusActionError: 'Insufficient stock for this adjustment',
    })

    expect(cleared.statusActionError).toBeNull()
    expect(cleared.cancelActionError).toBeNull()
  })

  it('cancel mutation error can be cleared independently', () => {
    const cleared = clearCancelActionError({
      ...baseState,
      cancelActionError: 'Cannot cancel',
    })

    expect(cleared.cancelActionError).toBeNull()
  })

  it('orders load error banner only when query failed and list empty', () => {
    expect(shouldShowOrdersLoadError('Load failed', 0)).toBe(true)
    expect(shouldShowOrdersLoadError('Load failed', 3)).toBe(false)
    expect(shouldShowOrdersLoadError(null, 0)).toBe(false)
  })

  it('cancel failure preserves orders query error separation', () => {
    const next = applyCancelMutationFailure(baseState, 'Cannot cancel')

    expect(next.cancelActionError).toBe('Cannot cancel')
    expect(next.ordersError).toBeNull()
  })
})

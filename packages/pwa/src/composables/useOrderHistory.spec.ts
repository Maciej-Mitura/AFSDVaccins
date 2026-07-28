/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderStatus } from '@vaccin-delivery/types'

const query = vi.fn()

vi.mock('@/composables/useGraphQL', () => ({
  default: () => ({
    apolloClient: { query },
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  mapGraphQLError: () => 'mapped-error',
}))

import { useOrderHistory } from '@/composables/useOrderHistory'
import { ORDER_HISTORY_QUERY } from '@/assets/graphql/order-history'

function edge(
  id: string,
  overrides: Record<string, unknown> = {},
): {
  cursor: string
  node: Record<string, unknown>
} {
  return {
    cursor: `cursor-${id}`,
    node: {
      id,
      status: OrderStatus.Delivered,
      orderLines: [
        {
          vaccineId: 'v1',
          vaccineName: 'Flu',
          manufacturer: 'Pharma',
          quantity: 2,
        },
      ],
      totalQuantity: 2,
      submittedAt: '2026-07-14T10:00:00.000Z',
      deliveryDate: '2026-07-15',
      cancelledAt: null,
      deliveredAt: '2026-07-15T12:00:00.000Z',
      cancellationReason: null,
      pharmacy: {
        apothekerUserId: 'u1',
        pharmacyName: 'Central Pharmacy',
        address: null,
      },
      completedByUserId: 'c1',
      completedByDisplayName: 'Courier Ada',
      deliveryMethod: 'QR',
      ...overrides,
    },
  }
}

function connection(
  ids: string[],
  options: { hasNextPage?: boolean; totalCount?: number } = {},
) {
  return {
    orderHistory: {
      totalCount: options.totalCount ?? ids.length,
      pageInfo: {
        hasNextPage: options.hasNextPage ?? false,
        endCursor: ids.length ? `cursor-${ids[ids.length - 1]}` : null,
      },
      edges: ids.map(id => edge(id)),
    },
  }
}

describe('useOrderHistory', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('loads first page', async () => {
    query.mockResolvedValueOnce({ data: connection(['a', 'b']) })
    const history = useOrderHistory({ allowApothekerFilter: true })
    await history.load()
    expect(history.orders.value.map(o => o.id)).toEqual(['a', 'b'])
    expect(history.loading.value).toBe(false)
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: ORDER_HISTORY_QUERY,
        variables: { input: expect.objectContaining({ first: 25 }) },
      }),
    )
  })

  it('APOTHEKER does not send apothekerId', async () => {
    query.mockResolvedValueOnce({ data: connection([]) })
    const history = useOrderHistory({ allowApothekerFilter: false })
    history.filters.apothekerId = 'should-not-send'
    await history.load()
    const variables = query.mock.calls[0]?.[0]?.variables as {
      input: { apothekerId?: string }
    }
    expect(variables.input.apothekerId).toBeUndefined()
  })

  it('exposes loading and empty states', async () => {
    let resolveQuery: (value: unknown) => void = () => undefined
    query.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveQuery = resolve
        }),
    )
    const history = useOrderHistory({ allowApothekerFilter: false })
    const pending = history.load()
    expect(history.loading.value).toBe(true)
    resolveQuery({ data: connection([]) })
    await pending
    expect(history.isEmpty.value).toBe(true)
    expect(history.isFilteredEmpty.value).toBe(false)
  })

  it('exposes filtered empty state', async () => {
    query.mockResolvedValueOnce({ data: connection([]) })
    const history = useOrderHistory({ allowApothekerFilter: false })
    history.filters.status = OrderStatus.Cancelled
    await history.load()
    expect(history.isFilteredEmpty.value).toBe(true)
  })

  it('exposes error state', async () => {
    query.mockRejectedValueOnce(new Error('boom'))
    const history = useOrderHistory({ allowApothekerFilter: false })
    await history.load()
    expect(history.errorMessage.value).toBe('mapped-error')
    expect(history.orders.value).toEqual([])
  })

  it('loads next page without duplicates', async () => {
    query
      .mockResolvedValueOnce({
        data: connection(['a', 'b'], { hasNextPage: true }),
      })
      .mockResolvedValueOnce({
        data: {
          orderHistory: {
            totalCount: 3,
            pageInfo: { hasNextPage: false, endCursor: 'cursor-c' },
            edges: [edge('b'), edge('c')],
          },
        },
      })

    const history = useOrderHistory({ allowApothekerFilter: false })
    await history.load()
    await history.loadMore()
    expect(history.orders.value.map(o => o.id)).toEqual(['a', 'b', 'c'])
    expect(history.hasNextPage.value).toBe(false)
  })

  it('clearFilters resets and reloads', async () => {
    query.mockResolvedValueOnce({ data: connection(['a']) })
    const history = useOrderHistory({ allowApothekerFilter: true })
    history.filters.search = 'abc'
    history.filters.status = OrderStatus.Pending
    history.filters.period = '30d'
    await history.clearFilters()
    expect(history.filters.search).toBe('')
    expect(history.filters.status).toBeUndefined()
    expect(history.filters.period).toBe('all')
    expect(history.orders.value.map(o => o.id)).toEqual(['a'])
  })
})

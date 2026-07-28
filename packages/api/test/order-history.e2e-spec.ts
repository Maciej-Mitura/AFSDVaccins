import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import {
  firstErrorMessage,
  graphqlRequest,
} from './helpers/e2e-graphql.helper'
import { OrderStatus } from '../src/order/order-status.enum'

const CREATE_ORDER = `
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      status
      deliveryDate
      submittedAt
    }
  }
`

const ORDER_HISTORY = `
  query OrderHistory($input: OrderHistoryInput!) {
    orderHistory(input: $input) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        cursor
        node {
          id
          status
          deliveryDate
          submittedAt
          deliveredAt
          cancelledAt
          cancellationReason
          completedByUserId
          completedByDisplayName
          deliveryMethod
          routeId
          pharmacy { apothekerUserId pharmacyName }
          orderLines { vaccineName quantity }
        }
      }
    }
  }
`

const CANCEL_OWN = `
  mutation CancelOwn($id: ID!) {
    cancelOwnOrder(id: $id) { id status cancelledAt }
  }
`

const ADMIN_ORDERS = `
  query AdminOrders {
    adminOrders { id }
  }
`

describe('GraphQL E2E — orderHistory', () => {
  let harness: E2eTestApp
  let fixtures: E2eFixtureBuilder
  let vaccineId: string
  let apotheker1UserId: string
  let apotheker2UserId: string

  beforeAll(async () => {
    harness = await createE2eTestApp()
    fixtures = new E2eFixtureBuilder(harness.dataSource)
  })

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
    await fixtures.createAdmin()
    const a1 = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const a2 = await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    apotheker1UserId = a1.user.id.toString()
    apotheker2UserId = a2.user.id.toString()
    await fixtures.ensureSettings({ orderingClosingTime: '14:00' })
    const vaccine = await fixtures.createVaccine({
      name: 'History Flu',
      stockQuantity: 100,
    })
    vaccineId = vaccine.id
  })

  async function createOrderFor(token: string): Promise<string> {
    const response = await graphqlRequest<{
      createOrder: { id: string }
    }>(harness.app, {
      query: CREATE_ORDER,
      token,
      variables: {
        input: { lines: [{ vaccineId, quantity: 2 }] },
      },
    })
    expect(response.errors).toBeUndefined()
    return response.data!.createOrder.id
  }

  it('ADMIN sees orders across pharmacies and can filter by apothekerId', async () => {
    const id1 = await createOrderFor(E2E_TOKENS.apotheker1)
    const id2 = await createOrderFor(E2E_TOKENS.apotheker2)

    const all = await graphqlRequest<{
      orderHistory: {
        totalCount: number
        edges: Array<{ node: { id: string } }>
      }
    }>(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.admin,
      variables: { input: { first: 25 } },
    })

    expect(all.errors).toBeUndefined()
    expect(all.data?.orderHistory.totalCount).toBe(2)
    const ids = all.data!.orderHistory.edges.map(e => e.node.id)
    expect(ids).toEqual(expect.arrayContaining([id1, id2]))

    const filtered = await graphqlRequest<{
      orderHistory: {
        totalCount: number
        edges: Array<{ node: { id: string; pharmacy: { apothekerUserId: string } } }>
      }
    }>(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.admin,
      variables: { input: { first: 25, apothekerId: apotheker1UserId } },
    })

    expect(filtered.errors).toBeUndefined()
    expect(filtered.data?.orderHistory.totalCount).toBe(1)
    expect(filtered.data?.orderHistory.edges[0].node.id).toBe(id1)
    expect(
      filtered.data?.orderHistory.edges[0].node.pharmacy.apothekerUserId,
    ).toBe(apotheker1UserId)
  })

  it('APOTHEKER sees only own orders and ignores foreign apothekerId', async () => {
    const ownId = await createOrderFor(E2E_TOKENS.apotheker1)
    await createOrderFor(E2E_TOKENS.apotheker2)

    const own = await graphqlRequest<{
      orderHistory: {
        totalCount: number
        edges: Array<{ node: { id: string } }>
      }
    }>(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.apotheker1,
      variables: { input: { first: 25, apothekerId: apotheker2UserId } },
    })

    expect(own.errors).toBeUndefined()
    expect(own.data?.orderHistory.totalCount).toBe(1)
    expect(own.data?.orderHistory.edges[0].node.id).toBe(ownId)
  })

  it('forbids BEZORGER and unauthenticated access', async () => {
    await createOrderFor(E2E_TOKENS.apotheker1)

    const bezorger = await graphqlRequest(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.bezorger1,
      variables: { input: { first: 10 } },
    })
    expect(firstErrorMessage(bezorger.errors)).toContain('Forbidden')

    const anon = await graphqlRequest(harness.app, {
      query: ORDER_HISTORY,
      variables: { input: { first: 10 } },
    })
    expect(firstErrorMessage(anon.errors)).toMatch(/Unauthorized|Forbidden/)
  })

  it('supports status filter, order-id search, and pagination', async () => {
    const id1 = await createOrderFor(E2E_TOKENS.apotheker1)
    await createOrderFor(E2E_TOKENS.apotheker1)

    const cancelled = await graphqlRequest(harness.app, {
      query: CANCEL_OWN,
      token: E2E_TOKENS.apotheker1,
      variables: { id: id1 },
    })
    expect(cancelled.errors).toBeUndefined()

    const byStatus = await graphqlRequest<{
      orderHistory: {
        edges: Array<{
          node: {
            id: string
            status: string
            cancelledAt: string | null
            cancellationReason: string | null
          }
        }>
      }
    }>(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.admin,
      variables: { input: { first: 25, status: OrderStatus.CANCELLED } },
    })

    expect(byStatus.errors).toBeUndefined()
    expect(byStatus.data?.orderHistory.edges).toHaveLength(1)
    expect(byStatus.data?.orderHistory.edges[0].node.id).toBe(id1)
    expect(byStatus.data?.orderHistory.edges[0].node.cancelledAt).toBeTruthy()
    expect(
      byStatus.data?.orderHistory.edges[0].node.cancellationReason,
    ).toBeNull()

    const bySearch = await graphqlRequest<{
      orderHistory: { edges: Array<{ node: { id: string } }> }
    }>(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.admin,
      variables: { input: { first: 10, search: id1 } },
    })
    expect(bySearch.errors).toBeUndefined()
    expect(bySearch.data?.orderHistory.edges).toHaveLength(1)
    expect(bySearch.data?.orderHistory.edges[0].node.id).toBe(id1)

    const page1 = await graphqlRequest<{
      orderHistory: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        edges: Array<{ node: { id: string } }>
      }
    }>(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.admin,
      variables: { input: { first: 1 } },
    })
    expect(page1.errors).toBeUndefined()
    expect(page1.data?.orderHistory.edges).toHaveLength(1)
    expect(page1.data?.orderHistory.pageInfo.hasNextPage).toBe(true)

    const page2 = await graphqlRequest<{
      orderHistory: {
        pageInfo: { hasNextPage: boolean }
        edges: Array<{ node: { id: string } }>
      }
    }>(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          first: 1,
          after: page1.data!.orderHistory.pageInfo.endCursor,
        },
      },
    })
    expect(page2.errors).toBeUndefined()
    expect(page2.data?.orderHistory.edges).toHaveLength(1)
    expect(page2.data?.orderHistory.edges[0].node.id).not.toBe(
      page1.data!.orderHistory.edges[0].node.id,
    )
  })

  it('rejects inverted ranges and oversize first; invalid ObjectId does not 500', async () => {
    const inverted = await graphqlRequest(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          first: 10,
          deliveryDateFrom: '2026-07-20',
          deliveryDateTo: '2026-07-10',
        },
      },
    })
    expect(firstErrorMessage(inverted.errors)).toBeTruthy()

    const oversized = await graphqlRequest(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.admin,
      variables: { input: { first: 51 } },
    })
    expect(firstErrorMessage(oversized.errors)).toBeTruthy()

    const invalidId = await graphqlRequest<{
      orderHistory: { totalCount: number; edges: unknown[] }
    }>(harness.app, {
      query: ORDER_HISTORY,
      token: E2E_TOKENS.admin,
      variables: { input: { first: 10, apothekerId: 'not-valid' } },
    })
    expect(invalidId.errors).toBeUndefined()
    expect(invalidId.data?.orderHistory.totalCount).toBe(0)
    expect(invalidId.data?.orderHistory.edges).toEqual([])
  })

  it('does not regress existing adminOrders query', async () => {
    await createOrderFor(E2E_TOKENS.apotheker1)

    const response = await graphqlRequest<{
      adminOrders: Array<{ id: string }>
    }>(harness.app, {
      query: ADMIN_ORDERS,
      token: E2E_TOKENS.admin,
    })

    expect(response.errors).toBeUndefined()
    expect(response.data?.adminOrders).toHaveLength(1)
  })
})

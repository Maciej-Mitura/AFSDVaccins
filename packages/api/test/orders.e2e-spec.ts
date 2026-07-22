import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { countCollection } from './helpers/e2e-collections'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import {
  firstErrorCode,
  firstErrorMessage,
  graphqlRequest,
} from './helpers/e2e-graphql.helper'
import { resolveDeliveryDate } from '../src/order/delivery-date.util'
import { Order } from '../src/order/order.entity'
import { StockAdjustment } from '../src/stock/stock-adjustment.entity'
import { DEFAULT_TIMEZONE } from '../src/settings/settings.constants'

const CREATE_ORDER = `
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      status
      totalQuantity
      deliveryDate
      orderLines { vaccineId quantity vaccineName }
      statusHistory { toStatus }
    }
  }
`

const MY_ORDER = `
  query MyOrder($id: ID!) {
    myOrder(id: $id) { id totalQuantity }
  }
`

const UPDATE_STATUS = `
  mutation UpdateStatus($id: ID!, $status: OrderStatus!, $reason: String) {
    updateOrderStatus(id: $id, status: $status, reason: $reason) {
      id
      status
      stockDecrementedAt
      statusHistory { fromStatus toStatus }
    }
  }
`

const VACCINE = `
  query Vaccine($id: ID!) {
    vaccine(id: $id) { stockQuantity }
  }
`

describe('GraphQL E2E — orders', () => {
  let harness: E2eTestApp
  let fixtures: E2eFixtureBuilder
  let vaccineId: string

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
    await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    await fixtures.ensureSettings({ orderingClosingTime: '14:00' })
    const vaccine = await fixtures.createVaccine({
      name: 'Order Flu',
      stockQuantity: 100,
    })
    vaccineId = vaccine.id
  })

  it('lets APOTHEKER create an order with MVP deliveryDate and persisted lines', async () => {
    const now = new Date()
    const expectedDeliveryDate = resolveDeliveryDate(
      now,
      DEFAULT_TIMEZONE,
      '14:00',
    )

    const response = await graphqlRequest<{
      createOrder: {
        id: string
        status: string
        totalQuantity: number
        deliveryDate: string
        orderLines: Array<{ quantity: number }>
      }
    }>(harness.app, {
      query: CREATE_ORDER,
      token: E2E_TOKENS.apotheker1,
      variables: {
        input: {
          lines: [{ vaccineId, quantity: 3 }],
        },
      },
    })

    expect(response.errors).toBeUndefined()
    expect(response.data?.createOrder).toMatchObject({
      status: 'PENDING',
      totalQuantity: 3,
      deliveryDate: expectedDeliveryDate,
    })
    expect(response.data?.createOrder.orderLines).toHaveLength(1)
    expect(await countCollection(harness.dataSource, Order)).toBe(1)
  })

  it('blocks another pharmacist from reading the order', async () => {
    const created = await graphqlRequest<{
      createOrder: { id: string }
    }>(harness.app, {
      query: CREATE_ORDER,
      token: E2E_TOKENS.apotheker1,
      variables: {
        input: { lines: [{ vaccineId, quantity: 1 }] },
      },
    })

    const denied = await graphqlRequest(harness.app, {
      query: MY_ORDER,
      token: E2E_TOKENS.apotheker2,
      variables: { id: created.data!.createOrder.id },
    })

    expect(denied.data?.['myOrder' as never]).toBeFalsy()
    expect(firstErrorMessage(denied.errors)).toBeTruthy()
  })

  it('supports ADMIN status transitions, rejects invalid ones, and delivers stock once', async () => {
    const created = await graphqlRequest<{
      createOrder: { id: string }
    }>(harness.app, {
      query: CREATE_ORDER,
      token: E2E_TOKENS.apotheker1,
      variables: {
        input: { lines: [{ vaccineId, quantity: 4 }] },
      },
    })
    const orderId = created.data!.createOrder.id

    const planned = await graphqlRequest<{
      updateOrderStatus: { status: string }
    }>(harness.app, {
      query: UPDATE_STATUS,
      token: E2E_TOKENS.admin,
      variables: { id: orderId, status: 'PLANNED' },
    })
    expect(planned.errors).toBeUndefined()
    expect(planned.data?.updateOrderStatus.status).toBe('PLANNED')

    const invalid = await graphqlRequest(harness.app, {
      query: UPDATE_STATUS,
      token: E2E_TOKENS.admin,
      variables: { id: orderId, status: 'PENDING' },
    })
    expect(invalid.data?.['updateOrderStatus' as never]).toBeFalsy()
    expect(firstErrorMessage(invalid.errors)).toBeTruthy()

    const adjustmentsBefore = await countCollection(
      harness.dataSource,
      StockAdjustment,
    )

    const delivered = await graphqlRequest<{
      updateOrderStatus: {
        status: string
        stockDecrementedAt: string | null
        statusHistory: Array<{ toStatus: string }>
      }
    }>(harness.app, {
      query: UPDATE_STATUS,
      token: E2E_TOKENS.admin,
      variables: { id: orderId, status: 'DELIVERED' },
    })

    expect(delivered.errors).toBeUndefined()
    expect(delivered.data?.updateOrderStatus.status).toBe('DELIVERED')
    expect(delivered.data?.updateOrderStatus.stockDecrementedAt).toBeTruthy()
    expect(
      delivered.data?.updateOrderStatus.statusHistory.some(
        h => h.toStatus === 'DELIVERED',
      ),
    ).toBe(true)

    const stock = await graphqlRequest<{
      vaccine: { stockQuantity: number }
    }>(harness.app, {
      query: VACCINE,
      token: E2E_TOKENS.admin,
      variables: { id: vaccineId },
    })
    expect(stock.data?.vaccine.stockQuantity).toBe(96)

    const deliveredAgain = await graphqlRequest<{
      updateOrderStatus: { status: string }
    }>(harness.app, {
      query: UPDATE_STATUS,
      token: E2E_TOKENS.admin,
      variables: { id: orderId, status: 'DELIVERED' },
    })
    expect(deliveredAgain.errors).toBeUndefined()
    expect(deliveredAgain.data?.updateOrderStatus.status).toBe('DELIVERED')

    const stockAgain = await graphqlRequest<{
      vaccine: { stockQuantity: number }
    }>(harness.app, {
      query: VACCINE,
      token: E2E_TOKENS.admin,
      variables: { id: vaccineId },
    })
    expect(stockAgain.data?.vaccine.stockQuantity).toBe(96)

    expect(await countCollection(harness.dataSource, StockAdjustment)).toBe(
      adjustmentsBefore + 1,
    )
    expect(firstErrorCode(invalid.errors) ?? 'INVALID').toBeTruthy()
  })
})

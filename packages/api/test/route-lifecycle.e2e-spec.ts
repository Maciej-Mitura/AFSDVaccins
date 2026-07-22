import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { countCollection } from './helpers/e2e-collections'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import {
  firstErrorMessage,
  graphqlRequest,
} from './helpers/e2e-graphql.helper'
import { OrderStatus } from '../src/order/order-status.enum'
import { Order } from '../src/order/order.entity'
import { StockAdjustment } from '../src/stock/stock-adjustment.entity'
import { RouteStatus } from '../src/routes/route-status.enum'

const UPDATE_ROUTE = `
  mutation UpdateRoute($id: ID!, $status: RouteStatus!, $reason: String) {
    updateRouteStatus(id: $id, status: $status, reason: $reason) {
      id
      status
      statusHistory { fromStatus toStatus }
    }
  }
`

describe('GraphQL E2E — route lifecycle', () => {
  let harness: E2eTestApp
  let fixtures: E2eFixtureBuilder

  beforeAll(async () => {
    harness = await createE2eTestApp()
    fixtures = new E2eFixtureBuilder(harness.dataSource)
  })

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
  })

  it('allows own courier start/complete, admin cancel, idempotent same-state, and no order/stock side effects', async () => {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({
      name: 'Lifecycle Flu',
      stockQuantity: 80,
    })

    await fixtures.createOrder({
      apothekerUserId: pharmacy.user.id,
      vaccine,
      quantity: 2,
      deliveryDate: fixtures.todayBrussels(),
      status: OrderStatus.PLANNED,
    })

    const template = await fixtures.createRouteTemplate({
      name: 'Lifecycle Template',
      bezorgerProfileId: courier.profile.id,
      apothekerProfileIds: [pharmacy.profile.id],
      createdByUserId: admin.id,
    })

    const route = await fixtures.createDeliveryRoute({
      routeTemplateId: template.id,
      bezorgerProfileId: courier.profile.id,
      deliveryDate: fixtures.todayBrussels(),
      generatedByUserId: admin.id,
      status: RouteStatus.ASSIGNED,
      stops: [
        {
          sequence: 1,
          apothekerProfileId: pharmacy.profile.id,
          apothekerUserId: pharmacy.user.id,
          pharmacyName: pharmacy.profile.pharmacyName,
          address: pharmacy.profile.address,
          orderIds: [],
          orderCount: 0,
          totalQuantity: 0,
          lines: [],
        },
      ],
    })

    const started = await graphqlRequest<{
      updateRouteStatus: {
        status: string
        statusHistory: Array<{ toStatus: string }>
      }
    }>(harness.app, {
      query: UPDATE_ROUTE,
      token: E2E_TOKENS.bezorger1,
      variables: { id: route.id, status: 'IN_PROGRESS' },
    })
    expect(started.errors).toBeUndefined()
    expect(started.data?.updateRouteStatus.status).toBe('IN_PROGRESS')
    expect(
      started.data?.updateRouteStatus.statusHistory.filter(
        h => h.toStatus === 'IN_PROGRESS',
      ),
    ).toHaveLength(1)

    const sameState = await graphqlRequest<{
      updateRouteStatus: {
        status: string
        statusHistory: Array<{ toStatus: string }>
      }
    }>(harness.app, {
      query: UPDATE_ROUTE,
      token: E2E_TOKENS.bezorger1,
      variables: { id: route.id, status: 'IN_PROGRESS' },
    })
    expect(sameState.errors).toBeUndefined()
    expect(sameState.data?.updateRouteStatus.status).toBe('IN_PROGRESS')
    expect(
      sameState.data?.updateRouteStatus.statusHistory.filter(
        h => h.toStatus === 'IN_PROGRESS',
      ),
    ).toHaveLength(1)

    const ordersBefore = await countCollection(harness.dataSource, Order)
    const stockAdjBefore = await countCollection(
      harness.dataSource,
      StockAdjustment,
    )

    const completed = await graphqlRequest<{
      updateRouteStatus: { status: string }
    }>(harness.app, {
      query: UPDATE_ROUTE,
      token: E2E_TOKENS.bezorger1,
      variables: { id: route.id, status: 'COMPLETED' },
    })
    expect(completed.errors).toBeUndefined()
    expect(completed.data?.updateRouteStatus.status).toBe('COMPLETED')

    expect(await countCollection(harness.dataSource, Order)).toBe(ordersBefore)
    expect(await countCollection(harness.dataSource, StockAdjustment)).toBe(
      stockAdjBefore,
    )

    const terminal = await graphqlRequest(harness.app, {
      query: UPDATE_ROUTE,
      token: E2E_TOKENS.bezorger1,
      variables: { id: route.id, status: 'IN_PROGRESS' },
    })
    expect(firstErrorMessage(terminal.errors)).toBeTruthy()

    // Fresh route for admin cancel path
    const cancellable = await fixtures.createDeliveryRoute({
      routeTemplateId: template.id,
      bezorgerProfileId: courier.profile.id,
      deliveryDate: '2099-12-31',
      generatedByUserId: admin.id,
      status: RouteStatus.ASSIGNED,
    })

    const cancelled = await graphqlRequest<{
      updateRouteStatus: { status: string }
    }>(harness.app, {
      query: UPDATE_ROUTE,
      token: E2E_TOKENS.admin,
      variables: {
        id: cancellable.id,
        status: 'CANCELLED',
        reason: 'E2E cancel',
      },
    })
    expect(cancelled.errors).toBeUndefined()
    expect(cancelled.data?.updateRouteStatus.status).toBe('CANCELLED')
  })
})

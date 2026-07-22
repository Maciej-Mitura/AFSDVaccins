import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import {
  firstErrorCode,
  firstErrorMessage,
  graphqlRequest,
} from './helpers/e2e-graphql.helper'
import { OrderStatus } from '../src/order/order-status.enum'

const ADMIN_AREA = `query { adminArea }`
const ADJUST_STOCK = `
  mutation Adjust($input: AdjustStockInput!) {
    adjustVaccineStock(input: $input) { id }
  }
`
const UPDATE_SETTINGS = `
  mutation UpdateSettings($input: UpdateApplicationSettingsInput!) {
    updateApplicationSettings(input: $input) { orderingClosingTime }
  }
`
const MY_ORDER = `
  query MyOrder($id: ID!) {
    myOrder(id: $id) { id }
  }
`
const GENERATE_ROUTE = `
  mutation Generate($routeTemplateId: ID!, $deliveryDate: String!) {
    generateDeliveryRoute(routeTemplateId: $routeTemplateId, deliveryDate: $deliveryDate) {
      id
    }
  }
`
const PREVIEW = `query { myTomorrowRoutePreview { deliveryDate totalOrders } }`
const UPDATE_ROUTE = `
  mutation UpdateRoute($id: ID!, $status: RouteStatus!) {
    updateRouteStatus(id: $id, status: $status) { id status }
  }
`

describe('GraphQL E2E — authorization boundaries', () => {
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

  it('blocks APOTHEKER and BEZORGER from ADMIN operations', async () => {
    await fixtures.createAdmin()
    await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({ name: 'Flu E2E' })

    for (const token of [E2E_TOKENS.apotheker1, E2E_TOKENS.bezorger1]) {
      const area = await graphqlRequest(harness.app, {
        query: ADMIN_AREA,
        token,
      })
      expect(firstErrorMessage(area.errors)).toMatch(/Forbidden/i)

      const settings = await graphqlRequest(harness.app, {
        query: UPDATE_SETTINGS,
        token,
        variables: { input: { orderingClosingTime: '15:00' } },
      })
      expect(firstErrorMessage(settings.errors)).toMatch(/Forbidden/i)

      const stock = await graphqlRequest(harness.app, {
        query: ADJUST_STOCK,
        token,
        variables: {
          input: {
            vaccineId: vaccine.id,
            type: 'RESTOCK',
            quantityDelta: 1,
            reason: 'unauthorized',
          },
        },
      })
      expect(firstErrorMessage(stock.errors)).toMatch(/Forbidden/i)
    }
  })

  it('rejects ADMIN on BEZORGER-only tomorrow preview', async () => {
    await fixtures.createAdmin()
    const response = await graphqlRequest(harness.app, {
      query: PREVIEW,
      token: E2E_TOKENS.admin,
    })
    expect(firstErrorMessage(response.errors)).toMatch(/Forbidden/i)
  })

  it('rejects APOTHEKER from route generation and BEZORGER from mutating another courier route', async () => {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const courier1 = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    const courier2 = await fixtures.createBezorger(E2E_TOKENS.bezorger2)
    await fixtures.ensureSettings()

    const template = await fixtures.createRouteTemplate({
      name: 'Authz Template',
      bezorgerProfileId: courier1.profile.id,
      apothekerProfileIds: [pharmacy.profile.id],
      createdByUserId: admin.id,
    })

    const generate = await graphqlRequest(harness.app, {
      query: GENERATE_ROUTE,
      token: E2E_TOKENS.apotheker1,
      variables: {
        routeTemplateId: template.id,
        deliveryDate: fixtures.todayBrussels(),
      },
    })
    expect(firstErrorMessage(generate.errors)).toMatch(/Forbidden/i)

    const otherRoute = await fixtures.createDeliveryRoute({
      routeTemplateId: template.id,
      bezorgerProfileId: courier2.profile.id,
      deliveryDate: fixtures.todayBrussels(),
      generatedByUserId: admin.id,
    })

    const mutateOther = await graphqlRequest(harness.app, {
      query: UPDATE_ROUTE,
      token: E2E_TOKENS.bezorger1,
      variables: {
        id: otherRoute.id,
        status: 'IN_PROGRESS',
      },
    })
    expect(firstErrorMessage(mutateOther.errors)).toMatch(
      /Forbidden|toegang/i,
    )
  })

  it('keeps pharmacist order data private across apothekers', async () => {
    await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const other = await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({ name: 'MMR E2E' })

    const order = await fixtures.createOrder({
      apothekerUserId: other.user.id,
      vaccine,
      quantity: 2,
      deliveryDate: fixtures.todayBrussels(),
      status: OrderStatus.PENDING,
    })

    const response = await graphqlRequest(harness.app, {
      query: MY_ORDER,
      token: E2E_TOKENS.apotheker1,
      variables: { id: order.id },
    })

    expect(response.data?.['myOrder' as never]).toBeFalsy()
    expect(firstErrorMessage(response.errors)).toBeTruthy()
    expect(firstErrorCode(response.errors) ?? firstErrorMessage(response.errors)).toBeTruthy()
  })
})

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
import { DeliveryRoute } from '../src/routes/delivery-route.entity'
import { Order } from '../src/order/order.entity'

const CREATE_TEMPLATE = `
  mutation CreateTemplate($input: CreateRouteTemplateInput!) {
    createRouteTemplate(input: $input) {
      deactivatedTemplateIds
      template {
        id
        name
        active
        bezorgerProfileId
        stops { sequence apothekerProfileId }
      }
    }
  }
`

const GENERATE = `
  mutation Generate($routeTemplateId: ID!, $deliveryDate: String!) {
    generateDeliveryRoute(routeTemplateId: $routeTemplateId, deliveryDate: $deliveryDate) {
      id
      deliveryDate
      bezorgerProfileId
      status
      stops { apothekerProfileId orderIds orderCount }
      skippedApothekerProfileIds
    }
  }
`

describe('GraphQL E2E — route templates and generation', () => {
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

  it('creates an active template and generates today’s route with skip / uniqueness / idempotent regen', async () => {
    const admin = await fixtures.createAdmin()
    const pharmacyWithOrder = await fixtures.createApotheker(
      E2E_TOKENS.apotheker1,
    )
    const emptyPharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({ name: 'Route Flu' })

    const today = fixtures.todayBrussels()
    const wrongDate = '2099-01-01'

    await fixtures.createOrder({
      apothekerUserId: pharmacyWithOrder.user.id,
      vaccine,
      quantity: 5,
      deliveryDate: today,
      status: OrderStatus.PENDING,
    })
    await fixtures.createOrder({
      apothekerUserId: pharmacyWithOrder.user.id,
      vaccine,
      quantity: 2,
      deliveryDate: wrongDate,
      status: OrderStatus.PENDING,
    })

    const template = await graphqlRequest<{
      createRouteTemplate: {
        deactivatedTemplateIds: string[]
        template: {
          id: string
          active: boolean
          bezorgerProfileId: string
          stops: Array<{ sequence: number; apothekerProfileId: string }>
        }
      }
    }>(harness.app, {
      query: CREATE_TEMPLATE,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          name: 'Brugge Morning',
          bezorgerProfileId: courier.profile.id,
          stops: [
            { apothekerProfileId: pharmacyWithOrder.profile.id },
            { apothekerProfileId: emptyPharmacy.profile.id },
          ],
        },
      },
    })

    expect(template.errors).toBeUndefined()
    expect(template.data?.createRouteTemplate.template.active).toBe(true)
    expect(
      String(template.data?.createRouteTemplate.template.bezorgerProfileId),
    ).toBe(String(courier.profile.id))
    expect(template.data?.createRouteTemplate.template.stops).toHaveLength(2)

    const generated = await graphqlRequest<{
      generateDeliveryRoute: {
        id: string
        deliveryDate: string
        status: string
        stops: Array<{ apothekerProfileId: string; orderCount: number }>
        skippedApothekerProfileIds: string[]
      }
    }>(harness.app, {
      query: GENERATE,
      token: E2E_TOKENS.admin,
      variables: {
        routeTemplateId: template.data!.createRouteTemplate.template.id,
        deliveryDate: today,
      },
    })

    expect(generated.errors).toBeUndefined()
    expect(generated.data?.generateDeliveryRoute.deliveryDate).toBe(today)
    expect(generated.data?.generateDeliveryRoute.status).toBe('ASSIGNED')
    expect(generated.data?.generateDeliveryRoute.stops).toHaveLength(1)
    expect(
      String(generated.data?.generateDeliveryRoute.stops[0].apothekerProfileId),
    ).toBe(String(pharmacyWithOrder.profile.id))
    expect(
      generated.data?.generateDeliveryRoute.skippedApothekerProfileIds.map(
        String,
      ),
    ).toContain(String(emptyPharmacy.profile.id))

    const plannedOrders = await harness.dataSource.getMongoRepository(Order).find({
      where: { status: OrderStatus.PLANNED },
    })
    expect(plannedOrders.length).toBe(1)

    const firstId = generated.data!.generateDeliveryRoute.id
    const regenerated = await graphqlRequest<{
      generateDeliveryRoute: { id: string }
    }>(harness.app, {
      query: GENERATE,
      token: E2E_TOKENS.admin,
      variables: {
        routeTemplateId: template.data!.createRouteTemplate.template.id,
        deliveryDate: today,
      },
    })

    expect(regenerated.errors).toBeUndefined()
    expect(regenerated.data?.generateDeliveryRoute.id).toBe(firstId)
    expect(await countCollection(harness.dataSource, DeliveryRoute)).toBe(1)

    const denied = await graphqlRequest(harness.app, {
      query: GENERATE,
      token: E2E_TOKENS.apotheker1,
      variables: {
        routeTemplateId: template.data!.createRouteTemplate.template.id,
        deliveryDate: today,
      },
    })
    expect(firstErrorMessage(denied.errors)).toMatch(/Forbidden/i)

    void admin
  })
})

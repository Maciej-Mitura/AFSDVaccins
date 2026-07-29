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
import { OrderService } from '../src/order/order.service'
import { OrderStatus } from '../src/order/order-status.enum'
import { Order } from '../src/order/order.entity'
import { DeliveryManifestDataService } from '../src/routes/manifest/delivery-manifest-data.service'
import { User } from '../src/user/user.entity'

const CREATE_ORDER = `
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      status
      totalQuantity
      orderLines { vaccineId quantity }
      deliveryDate
    }
  }
`

const GENERATE = `
  mutation Generate($routeTemplateId: ID!, $deliveryDate: String!) {
    generateDeliveryRoute(routeTemplateId: $routeTemplateId, deliveryDate: $deliveryDate) {
      route {
        id
        deliveryDate
        status
        generatedAt
        stops {
          apothekerProfileId
          pharmacyName
          orderIds
          orderCount
          totalQuantity
          lines { vaccineId vaccineName quantity }
        }
        skippedApothekerProfileIds
      }
      diagnostics {
        includedOrderCount
        includedStopCount
        skippedOrderCount
        skippedPharmacyCount
        regenerated
        regenerationNeeded
        skipGroups { code count pharmacyNames orderIds apothekerProfileIds }
      }
    }
  }
`

const PLANNING_DIAGNOSTICS = `
  query PlanningDiagnostics($deliveryDate: String!, $routeTemplateId: ID) {
    routePlanningDiagnostics(deliveryDate: $deliveryDate, routeTemplateId: $routeTemplateId) {
      deliveryDate
      routeTemplateId
      routeId
      routeGeneratedAt
      eligibleUnplannedOrderCount
      includedOrderCount
      includedStopCount
      skippedOrderCount
      skippedPharmacyCount
      regenerationNeeded
      canRegenerate
      skipGroups { code count pharmacyNames orderIds apothekerProfileIds }
    }
  }
`

type GenerationResult = {
  generateDeliveryRoute: {
    route: {
      id: string
      deliveryDate: string
      status: string
      generatedAt: string
      stops: Array<{
        apothekerProfileId: string
        pharmacyName: string
        orderIds: string[]
        orderCount: number
        totalQuantity: number
        lines: Array<{ vaccineId: string; vaccineName: string; quantity: number }>
      }>
      skippedApothekerProfileIds: string[]
    }
    diagnostics: {
      includedOrderCount: number
      includedStopCount: number
      skippedOrderCount: number
      skippedPharmacyCount: number
      regenerated: boolean
      regenerationNeeded: boolean
      skipGroups: Array<{
        code: string
        count: number
        pharmacyNames: string[]
        orderIds: string[]
        apothekerProfileIds: string[]
      }>
    }
  }
}

describe('GraphQL E2E — Phase 36C quantity=1 route/manifest correctness', () => {
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

  async function seedBase() {
    const admin = await fixtures.createAdmin()
    const pharmacyA = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const pharmacyB = await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({ name: 'One Dose Vax' })
    const vaccineB = await fixtures.createVaccine({ name: 'Second Dose Vax' })
    const today = fixtures.todayBrussels()

    return { admin, pharmacyA, pharmacyB, courier, vaccine, vaccineB, today }
  }

  it('quantity=1 order creates a route stop and manifest with exactly one dose', async () => {
    const { admin, pharmacyA, courier, vaccine, today } = await seedBase()

    const order = await fixtures.createOrder({
      apothekerUserId: pharmacyA.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
      status: OrderStatus.PENDING,
    })

    expect(order.totalQuantity).toBe(1)
    expect(order.orderLines[0].quantity).toBe(1)

    const qualifying = await harness.app
      .get(OrderService)
      .findQualifyingOrdersForRoute({
        apothekerUserId: pharmacyA.user.id.toString(),
        deliveryDate: today,
      })
    expect(qualifying.map(o => o.id.toString())).toContain(order.id.toString())

    const template = await fixtures.createRouteTemplate({
      name: 'Qty1 Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [String(pharmacyA.profile.id)],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<GenerationResult>(harness.app, {
      query: GENERATE,
      token: E2E_TOKENS.admin,
      variables: {
        routeTemplateId: String(template.id),
        deliveryDate: today,
      },
    })

    expect(generated.errors).toBeUndefined()
    const { route, diagnostics } = generated.data!.generateDeliveryRoute
    expect(diagnostics.includedOrderCount).toBe(1)
    expect(diagnostics.includedStopCount).toBe(1)
    expect(route.stops).toHaveLength(1)
    expect(route.stops[0].orderIds.map(String)).toContain(String(order.id))
    expect(route.stops[0].totalQuantity).toBe(1)
    expect(route.stops[0].lines).toHaveLength(1)
    expect(route.stops[0].lines[0].quantity).toBe(1)

    const planned = await harness.dataSource.getMongoRepository(Order).findOne({
      where: { _id: order._id },
    })
    expect(planned?.status).toBe(OrderStatus.PLANNED)

    const manifestService = harness.app.get(DeliveryManifestDataService)
    const adminEntity = await harness.dataSource
      .getMongoRepository(User)
      .findOne({ where: { _id: admin._id } })
    const manifest = await manifestService.buildRouteManifest(
      adminEntity!,
      route.id,
    )
    expect(manifest.stopCount).toBe(1)
    expect(manifest.stops[0].orders).toHaveLength(1)
    expect(manifest.stops[0].orders[0].lines).toHaveLength(1)
    expect(manifest.stops[0].orders[0].lines[0].quantity).toBe(1)
    expect(manifest.totalItemQuantity).toBe(1)
  })

  it('aggregates multiple one-dose lines and orders, and reports off-template skips', async () => {
    const { admin, pharmacyA, pharmacyB, courier, vaccine, vaccineB, today } =
      await seedBase()

    const multiLine = await fixtures.createOrder({
      apothekerUserId: pharmacyA.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
      extraLines: [{ vaccine: vaccineB, quantity: 1 }],
    })
    const second = await fixtures.createOrder({
      apothekerUserId: pharmacyA.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
    })
    const offTemplate = await fixtures.createOrder({
      apothekerUserId: pharmacyB.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
    })

    const template = await fixtures.createRouteTemplate({
      name: 'Aggregate Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [String(pharmacyA.profile.id)],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<GenerationResult>(harness.app, {
      query: GENERATE,
      token: E2E_TOKENS.admin,
      variables: {
        routeTemplateId: String(template.id),
        deliveryDate: today,
      },
    })

    expect(generated.errors).toBeUndefined()
    const { route, diagnostics } = generated.data!.generateDeliveryRoute
    expect(route.stops).toHaveLength(1)
    expect(route.stops[0].orderCount).toBe(2)
    expect(route.stops[0].totalQuantity).toBe(3)
    expect(route.stops[0].orderIds.map(String)).toEqual(
      expect.arrayContaining([String(multiLine.id), String(second.id)]),
    )

    const notInTemplate = diagnostics.skipGroups.find(
      group => group.code === 'PHARMACY_NOT_IN_ACTIVE_TEMPLATE',
    )
    expect(notInTemplate).toBeDefined()
    expect(notInTemplate!.orderIds.map(String)).toContain(String(offTemplate.id))
    expect(notInTemplate!.pharmacyNames).toContain(pharmacyB.profile.pharmacyName)
  })

  it('creates two stops for two template pharmacies with one-dose orders', async () => {
    const { admin, pharmacyA, pharmacyB, courier, vaccine, today } =
      await seedBase()

    await fixtures.createOrder({
      apothekerUserId: pharmacyA.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
    })
    await fixtures.createOrder({
      apothekerUserId: pharmacyB.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
    })

    const template = await fixtures.createRouteTemplate({
      name: 'Two Stop Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [
        String(pharmacyA.profile.id),
        String(pharmacyB.profile.id),
      ],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<GenerationResult>(harness.app, {
      query: GENERATE,
      token: E2E_TOKENS.admin,
      variables: {
        routeTemplateId: String(template.id),
        deliveryDate: today,
      },
    })

    expect(generated.errors).toBeUndefined()
    expect(generated.data!.generateDeliveryRoute.route.stops).toHaveLength(2)
    expect(
      generated.data!.generateDeliveryRoute.diagnostics.includedStopCount,
    ).toBe(2)
  })

  it('rejects zero, negative and decimal quantities at order creation', async () => {
    await seedBase()
    const vaccine = await fixtures.createVaccine({ name: 'Validation Vax' })

    for (const quantity of [0, -1, 1.5]) {
      const response = await graphqlRequest(harness.app, {
        query: CREATE_ORDER,
        token: E2E_TOKENS.apotheker1,
        variables: {
          input: {
            lines: [{ vaccineId: String(vaccine.id), quantity }],
          },
        },
      })
      expect(response.errors).toBeDefined()
      expect(firstErrorMessage(response.errors)).toBeTruthy()
    }
  })

  it('skips mismatched deliveryDate and non-eligible status with explicit reasons', async () => {
    const { admin, pharmacyA, courier, vaccine, today } = await seedBase()

    await fixtures.createOrder({
      apothekerUserId: pharmacyA.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: '2099-06-01',
      status: OrderStatus.PENDING,
    })
    await fixtures.createOrder({
      apothekerUserId: pharmacyA.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
      status: OrderStatus.CANCELLED,
    })

    const template = await fixtures.createRouteTemplate({
      name: 'Skip Reasons Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [String(pharmacyA.profile.id)],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<GenerationResult>(harness.app, {
      query: GENERATE,
      token: E2E_TOKENS.admin,
      variables: {
        routeTemplateId: String(template.id),
        deliveryDate: today,
      },
    })

    expect(generated.errors).toBeUndefined()
    const { route, diagnostics } = generated.data!.generateDeliveryRoute
    expect(route.stops).toHaveLength(0)
    expect(route.skippedApothekerProfileIds.map(String)).toContain(
      String(pharmacyA.profile.id),
    )

    const statusSkip = diagnostics.skipGroups.find(
      group => group.code === 'ORDER_STATUS_NOT_ELIGIBLE',
    )
    expect(statusSkip).toBeDefined()
    expect(statusSkip!.pharmacyNames).toContain(pharmacyA.profile.pharmacyName)
  })

  it('route generated before an order omits it; regeneration includes it; freshness warns', async () => {
    const { admin, pharmacyA, courier, vaccine, today } = await seedBase()

    const template = await fixtures.createRouteTemplate({
      name: 'Freshness Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [String(pharmacyA.profile.id)],
      createdByUserId: String(admin.id),
    })

    const first = await graphqlRequest<GenerationResult>(harness.app, {
      query: GENERATE,
      token: E2E_TOKENS.admin,
      variables: {
        routeTemplateId: String(template.id),
        deliveryDate: today,
      },
    })
    expect(first.errors).toBeUndefined()
    expect(first.data!.generateDeliveryRoute.route.stops).toHaveLength(0)

    const lateOrder = await fixtures.createOrder({
      apothekerUserId: pharmacyA.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
    })

    const freshness = await graphqlRequest<{
      routePlanningDiagnostics: {
        eligibleUnplannedOrderCount: number
        regenerationNeeded: boolean
        canRegenerate: boolean
      }
    }>(harness.app, {
      query: PLANNING_DIAGNOSTICS,
      token: E2E_TOKENS.admin,
      variables: {
        deliveryDate: today,
        routeTemplateId: String(template.id),
      },
    })
    expect(freshness.errors).toBeUndefined()
    expect(
      freshness.data!.routePlanningDiagnostics.eligibleUnplannedOrderCount,
    ).toBe(1)
    expect(freshness.data!.routePlanningDiagnostics.regenerationNeeded).toBe(
      true,
    )
    expect(freshness.data!.routePlanningDiagnostics.canRegenerate).toBe(true)

    const deniedFreshness = await graphqlRequest(harness.app, {
      query: PLANNING_DIAGNOSTICS,
      token: E2E_TOKENS.apotheker1,
      variables: { deliveryDate: today },
    })
    expect(firstErrorMessage(deniedFreshness.errors)).toMatch(/Forbidden/i)

    const deniedBezorger = await graphqlRequest(harness.app, {
      query: PLANNING_DIAGNOSTICS,
      token: E2E_TOKENS.bezorger1,
      variables: { deliveryDate: today },
    })
    expect(firstErrorMessage(deniedBezorger.errors)).toMatch(/Forbidden/i)

    const regenerated = await graphqlRequest<GenerationResult>(harness.app, {
      query: GENERATE,
      token: E2E_TOKENS.admin,
      variables: {
        routeTemplateId: String(template.id),
        deliveryDate: today,
      },
    })
    expect(regenerated.errors).toBeUndefined()
    expect(regenerated.data!.generateDeliveryRoute.diagnostics.regenerated).toBe(
      true,
    )
    expect(regenerated.data!.generateDeliveryRoute.route.stops).toHaveLength(1)
    expect(
      regenerated.data!.generateDeliveryRoute.route.stops[0].orderIds.map(String),
    ).toContain(String(lateOrder.id))
    expect(
      regenerated.data!.generateDeliveryRoute.route.stops[0].totalQuantity,
    ).toBe(1)
  })
})

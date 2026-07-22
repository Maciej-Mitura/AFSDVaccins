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
import { StockAdjustment } from '../src/stock/stock-adjustment.entity'
import { Vaccine } from '../src/vaccine/vaccine.entity'

const PREVIEW = `
  query Preview {
    myTomorrowRoutePreview {
      deliveryDate
      bezorgerProfileId
      routeTemplateId
      routeTemplateName
      totalStops
      totalOrders
      totalQuantity
      skippedApothekerProfileIds
      stops { apothekerProfileId orderCount }
    }
  }
`

describe('GraphQL E2E — tomorrow route preview', () => {
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

  it('returns own BEZORGER preview without persisting routes or mutating orders/stock', async () => {
    await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const emptyPharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.createBezorger(E2E_TOKENS.bezorger2)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({
      name: 'Preview Flu',
      stockQuantity: 40,
    })

    const tomorrow = fixtures.tomorrowBrussels()
    const today = fixtures.todayBrussels()

    await fixtures.createOrder({
      apothekerUserId: pharmacy.user.id,
      vaccine,
      quantity: 3,
      deliveryDate: tomorrow,
      status: OrderStatus.PENDING,
    })
    await fixtures.createOrder({
      apothekerUserId: pharmacy.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
      status: OrderStatus.PENDING,
    })

    const templateResponse = await graphqlRequest<{
      createRouteTemplate: { id: string }
    }>(harness.app, {
      query: `
        mutation CreateTemplate($input: CreateRouteTemplateInput!) {
          createRouteTemplate(input: $input) { id }
        }
      `,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          name: 'Preview Template',
          bezorgerProfileId: courier.profile.id,
          stops: [
            { apothekerProfileId: pharmacy.profile.id },
            { apothekerProfileId: emptyPharmacy.profile.id },
          ],
        },
      },
    })
    expect(templateResponse.errors).toBeUndefined()
    const templateId = templateResponse.data!.createRouteTemplate.id

    const routesBefore = await countCollection(harness.dataSource, DeliveryRoute)
    const ordersBefore = await countCollection(harness.dataSource, Order)
    const stockAdjBefore = await countCollection(
      harness.dataSource,
      StockAdjustment,
    )
    const stockBefore = (
      await harness.dataSource.getMongoRepository(Vaccine).findOneBy({
        _id: vaccine._id as never,
      })
    )?.stockQuantity

    const preview = await graphqlRequest<{
      myTomorrowRoutePreview: {
        deliveryDate: string
        bezorgerProfileId: string
        routeTemplateId: string
        totalStops: number
        totalOrders: number
        totalQuantity: number
        skippedApothekerProfileIds: string[]
      }
    }>(harness.app, {
      query: PREVIEW,
      token: E2E_TOKENS.bezorger1,
    })

    expect(preview.errors).toBeUndefined()
    expect(preview.data?.myTomorrowRoutePreview.deliveryDate).toBe(tomorrow)
    expect(String(preview.data?.myTomorrowRoutePreview.bezorgerProfileId)).toBe(
      String(courier.profile.id),
    )
    expect(String(preview.data?.myTomorrowRoutePreview.routeTemplateId)).toBe(
      String(templateId),
    )
    expect(preview.data?.myTomorrowRoutePreview.totalStops).toBe(1)
    expect(preview.data?.myTomorrowRoutePreview.totalOrders).toBe(1)
    expect(preview.data?.myTomorrowRoutePreview.totalQuantity).toBe(3)
    expect(
      preview.data?.myTomorrowRoutePreview.skippedApothekerProfileIds.map(
        String,
      ),
    ).toContain(String(emptyPharmacy.profile.id))

    expect(await countCollection(harness.dataSource, DeliveryRoute)).toBe(
      routesBefore,
    )
    expect(await countCollection(harness.dataSource, Order)).toBe(ordersBefore)
    expect(await countCollection(harness.dataSource, StockAdjustment)).toBe(
      stockAdjBefore,
    )
    const stockAfter = (
      await harness.dataSource.getMongoRepository(Vaccine).findOneBy({
        _id: vaccine._id as never,
      })
    )?.stockQuantity
    expect(stockAfter).toBe(stockBefore)

    const adminDenied = await graphqlRequest(harness.app, {
      query: PREVIEW,
      token: E2E_TOKENS.admin,
    })
    expect(firstErrorMessage(adminDenied.errors)).toMatch(/Forbidden/i)

    const apothekerDenied = await graphqlRequest(harness.app, {
      query: PREVIEW,
      token: E2E_TOKENS.apotheker1,
    })
    expect(firstErrorMessage(apothekerDenied.errors)).toMatch(/Forbidden/i)

    const noTemplate = await graphqlRequest(harness.app, {
      query: PREVIEW,
      token: E2E_TOKENS.bezorger2,
    })
    expect(firstErrorMessage(noTemplate.errors)).toMatch(
      /not assigned|template|Forbidden|not found/i,
    )
  })
})

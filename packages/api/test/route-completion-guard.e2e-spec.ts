import { ObjectId } from 'mongodb'
import type { Server } from 'node:http'
import request from 'supertest'

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
import { DeliveryRoute } from '../src/routes/delivery-route.entity'
import { RouteStatus } from '../src/routes/route-status.enum'
import { createGeneratedStopQrState } from '../src/routes/qr/create-generated-stop-qr-state'
import { DELIVERY_QR_TEST_SIGNING_SECRET } from '../src/routes/qr/delivery-qr.constants'
import { HmacDeliveryQrTokenService } from '../src/routes/qr/hmac-delivery-qr-token.service'

const UPDATE_ROUTE = `
  mutation UpdateRoute($id: ID!, $status: RouteStatus!, $reason: String) {
    updateRouteStatus(id: $id, status: $status, reason: $reason) {
      id
      status
    }
  }
`

describe('GraphQL E2E — Phase 36D route completion guard', () => {
  let harness: E2eTestApp
  let fixtures: E2eFixtureBuilder
  const tokenService = new HmacDeliveryQrTokenService(
    DELIVERY_QR_TEST_SIGNING_SECRET,
  )

  beforeAll(async () => {
    harness = await createE2eTestApp()
    fixtures = new E2eFixtureBuilder(harness.dataSource)
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
  })

  it('blocks COMPLETED while a deliverable stop lacks QR confirmation', async () => {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({
      name: '36D Flu',
      stockQuantity: 40,
    })
    const order = await fixtures.createOrder({
      apothekerUserId: pharmacy.user.id,
      vaccine,
      quantity: 2,
      deliveryDate: fixtures.todayBrussels(),
      status: OrderStatus.PLANNED,
    })

    const template = await fixtures.createRouteTemplate({
      name: '36D Template',
      bezorgerProfileId: courier.profile.id,
      apothekerProfileIds: [pharmacy.profile.id],
      createdByUserId: admin.id,
    })

    const route = await fixtures.createDeliveryRoute({
      routeTemplateId: template.id,
      bezorgerProfileId: courier.profile.id,
      deliveryDate: fixtures.todayBrussels(),
      generatedByUserId: admin.id,
      status: RouteStatus.IN_PROGRESS,
      stops: [
        {
          sequence: 1,
          apothekerProfileId: pharmacy.profile.id,
          apothekerUserId: pharmacy.user.id,
          pharmacyName: pharmacy.profile.pharmacyName,
          address: pharmacy.profile.address,
          orderIds: [String(order.id)],
          orderCount: 1,
          totalQuantity: 2,
          lines: [],
        },
      ],
    })

    const { stopId, qrConfirmation } = createGeneratedStopQrState({
      routeId: String(route.id),
      tokenService,
    })

    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const persisted = await repo.findOneBy({ _id: new ObjectId(String(route.id)) })
    expect(persisted).not.toBeNull()
    persisted!.stops[0] = {
      ...persisted!.stops[0],
      stopId,
      qrConfirmation,
      deliveryProof: null,
    }
    await repo.save(persisted!)

    const blocked = await graphqlRequest(harness.app, {
      query: UPDATE_ROUTE,
      token: E2E_TOKENS.bezorger1,
      variables: { id: String(route.id), status: 'COMPLETED' },
    })
    expect(firstErrorMessage(blocked.errors)).toBeTruthy()
    expect(
      firstErrorCode(blocked.errors) === 'ROUTE_COMPLETION_INCOMPLETE_STOPS' ||
        JSON.stringify(blocked.errors).includes(
          'ROUTE_COMPLETION_INCOMPLETE_STOPS',
        ),
    ).toBe(true)

    const confirm = await request(harness.app.getHttpServer() as Server)
      .post('/delivery-routes/qr/confirm')
      .set('Authorization', `Bearer ${E2E_TOKENS.bezorger1}`)
      .send({ token: qrConfirmation.encodedToken })
    expect(confirm.status).toBe(200)

    const completed = await graphqlRequest<{
      updateRouteStatus: { status: string }
    }>(harness.app, {
      query: UPDATE_ROUTE,
      token: E2E_TOKENS.bezorger1,
      variables: { id: String(route.id), status: 'COMPLETED' },
    })
    expect(completed.errors).toBeUndefined()
    expect(completed.data?.updateRouteStatus.status).toBe('COMPLETED')
  })

  it('allows COMPLETED for empty-order stops without inventing DELIVERED', async () => {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()

    const template = await fixtures.createRouteTemplate({
      name: '36D Empty',
      bezorgerProfileId: courier.profile.id,
      apothekerProfileIds: [pharmacy.profile.id],
      createdByUserId: admin.id,
    })

    const route = await fixtures.createDeliveryRoute({
      routeTemplateId: template.id,
      bezorgerProfileId: courier.profile.id,
      deliveryDate: fixtures.todayBrussels(),
      generatedByUserId: admin.id,
      status: RouteStatus.IN_PROGRESS,
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

    const completed = await graphqlRequest<{
      updateRouteStatus: { status: string }
    }>(harness.app, {
      query: UPDATE_ROUTE,
      token: E2E_TOKENS.bezorger1,
      variables: { id: String(route.id), status: 'COMPLETED' },
    })
    expect(completed.errors).toBeUndefined()
    expect(completed.data?.updateRouteStatus.status).toBe('COMPLETED')
  })
})

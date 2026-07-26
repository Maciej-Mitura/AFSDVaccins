import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'

import { createE2eTestApp, type E2eTestApp } from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import { graphqlRequest } from './helpers/e2e-graphql.helper'
import { OrderStatus } from '../src/order/order-status.enum'

const GENERATE = `
  mutation Generate($routeTemplateId: ID!, $deliveryDate: String!) {
    generateDeliveryRoute(routeTemplateId: $routeTemplateId, deliveryDate: $deliveryDate) {
      id
      status
      stops {
        stopId
        apothekerUserId
        orderIds
        orderCount
      }
    }
  }
`

const MY_PLANNED_DELIVERIES = `
  query MyPlannedDeliveries {
    myPlannedDeliveries {
      routeId
      stopId
      routeDate
      routeStatus
      stopSequence
      pharmacyName
      address { city street }
      orderCount
      orderIds
      orders {
        orderId
        status
        lines { vaccineId vaccineName quantity }
      }
      totalLineCount
      totalQuantity
      qrAvailable
      qrConsumed
      deliveredAt
      qrImagePath
    }
  }
`

describe('myPlannedDeliveries (e2e)', () => {
  let harness: E2eTestApp
  let app: INestApplication
  let fixtures: E2eFixtureBuilder
  let server: Server

  beforeAll(async () => {
    harness = await createE2eTestApp()
    app = harness.app
    server = app.getHttpServer() as Server
    fixtures = new E2eFixtureBuilder(harness.dataSource)
    void server
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
  })

  it('returns only the owning pharmacist stop groups with safe fields', async () => {
    const admin = await fixtures.createAdmin()
    const pharmacy1 = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const pharmacy2 = await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({ name: 'Planned Flu' })
    const today = fixtures.todayBrussels()

    const orderA = await fixtures.createOrder({
      apothekerUserId: pharmacy1.user.id,
      vaccine,
      quantity: 3,
      deliveryDate: today,
      status: OrderStatus.PENDING,
    })
    const orderB = await fixtures.createOrder({
      apothekerUserId: pharmacy1.user.id,
      vaccine,
      quantity: 2,
      deliveryDate: today,
      status: OrderStatus.PENDING,
    })
    await fixtures.createOrder({
      apothekerUserId: pharmacy2.user.id,
      vaccine,
      quantity: 1,
      deliveryDate: today,
      status: OrderStatus.PENDING,
    })

    const template = await fixtures.createRouteTemplate({
      name: 'Planned Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [
        String(pharmacy1.profile.id),
        String(pharmacy2.profile.id),
      ],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<{
      generateDeliveryRoute: {
        id: string
        stops: Array<{
          stopId: string
          apothekerUserId: string
          orderIds: string[]
          orderCount: number
        }>
      }
    }>(app, {
      query: GENERATE,
      token: E2E_TOKENS.admin,
      variables: {
        routeTemplateId: String(template.id),
        deliveryDate: today,
      },
    })

    expect(generated.errors).toBeUndefined()
    const stops = generated.data!.generateDeliveryRoute.stops
    const ownStop = stops.find(
      stop => stop.apothekerUserId === String(pharmacy1.user.id),
    )
    expect(ownStop).toBeDefined()
    expect(ownStop!.orderCount).toBe(2)
    expect(ownStop!.orderIds.sort()).toEqual(
      [String(orderA.id), String(orderB.id)].sort(),
    )

    const mine = await graphqlRequest<{
      myPlannedDeliveries: Array<{
        routeId: string
        stopId: string
        orderIds: string[]
        orders: Array<{ orderId: string }>
        qrAvailable: boolean
        qrImagePath: string | null
        pharmacyName: string
      }>
    }>(app, {
      query: MY_PLANNED_DELIVERIES,
      token: E2E_TOKENS.apotheker1,
    })

    expect(mine.errors).toBeUndefined()
    expect(mine.data?.myPlannedDeliveries).toHaveLength(1)
    const group = mine.data?.myPlannedDeliveries[0]
    expect(group?.stopId).toBe(ownStop?.stopId)
    expect(group?.orderIds.sort()).toEqual(ownStop?.orderIds.sort())
    expect(group?.orders.map(o => o.orderId).sort()).toEqual(
      ownStop?.orderIds.sort(),
    )
    expect(group?.qrAvailable).toBe(true)
    expect(group?.qrImagePath).toContain('/delivery-routes/')
    expect(JSON.stringify(mine.data)).not.toContain('encodedToken')
    expect(JSON.stringify(mine.data)).not.toContain('nonceHash')

    const other = await graphqlRequest<{
      myPlannedDeliveries: Array<{ stopId: string }>
    }>(app, {
      query: MY_PLANNED_DELIVERIES,
      token: E2E_TOKENS.apotheker2,
    })
    expect(other.errors).toBeUndefined()
    expect(other.data?.myPlannedDeliveries).toHaveLength(1)
    expect(other.data?.myPlannedDeliveries[0]?.stopId).not.toBe(ownStop?.stopId)

    const courierDenied = await graphqlRequest<{
      myPlannedDeliveries?: Array<{ stopId: string }> | null
    }>(app, {
      query: MY_PLANNED_DELIVERIES,
      token: E2E_TOKENS.bezorger1,
    })
    expect(courierDenied.errors).toBeDefined()
    expect(courierDenied.data?.myPlannedDeliveries ?? null).toBeNull()

    const adminDenied = await graphqlRequest<{
      myPlannedDeliveries?: Array<{ stopId: string }> | null
    }>(app, {
      query: MY_PLANNED_DELIVERIES,
      token: E2E_TOKENS.admin,
    })
    expect(adminDenied.errors).toBeDefined()
  })
})

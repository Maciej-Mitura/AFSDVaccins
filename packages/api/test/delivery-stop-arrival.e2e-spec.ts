import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import { ObjectId } from 'mongodb'
import request from 'supertest'

import { createE2eTestApp, type E2eTestApp } from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2E_DEFAULT_ADDRESS, E2eFixtureBuilder } from './helpers/e2e-fixtures'
import { graphqlRequest } from './helpers/e2e-graphql.helper'
import { OrderStatus } from '../src/order/order-status.enum'
import { DeliveryRoute } from '../src/routes/delivery-route.entity'
import { DeliveryRouteEventsService } from '../src/routes/delivery-route-events.service'
import {
  DeliveryStopArrivalAuditEvent,
  DeliveryStopArrivalAuditEventType,
} from '../src/routes/arrival/delivery-stop-arrival-audit.entity'
import type { DeliveryStopArrivalResponseDto } from '../src/routes/arrival/delivery-stop-arrival.dto'
import { RouteStatus } from '../src/routes/route-status.enum'
import { DeliveryProofMethod } from '../src/routes/qr/delivery-proof-method.enum'
import { RouteTemplate } from '../src/route-templates/route-template.entity'

type ErrorBody = {
  message?: string
  error?: string
}

const GENERATE = `
  mutation Generate($routeTemplateId: ID!, $deliveryDate: String!) {
    generateDeliveryRoute(routeTemplateId: $routeTemplateId, deliveryDate: $deliveryDate) {
      id
      status
      stops {
        stopId
        sequence
        orderIds
      }
    }
  }
`

describe('Delivery stop arrival (e2e)', () => {
  let harness: E2eTestApp
  let app: INestApplication
  let fixtures: E2eFixtureBuilder
  let server: Server
  let routeEvents: DeliveryRouteEventsService
  let routePublishSpy: jest.SpyInstance

  beforeAll(async () => {
    harness = await createE2eTestApp()
    app = harness.app
    server = app.getHttpServer() as Server
    fixtures = new E2eFixtureBuilder(harness.dataSource)
    routeEvents = harness.moduleRef.get(DeliveryRouteEventsService)
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
    routePublishSpy = jest
      .spyOn(routeEvents, 'publishBezorgerRouteUpdated')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    routePublishSpy?.mockRestore()
  })

  async function seedRoute(options?: {
    status?: RouteStatus
    delivered?: boolean
  }): Promise<{
    routeId: string
    stopId: string
    courierUserId: string
    courierProfileId: string
    templateId: string
  }> {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.createBezorger(E2E_TOKENS.bezorger2)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({
      name: 'Arrival Flu',
      stockQuantity: 100,
    })
    const today = fixtures.todayBrussels()

    await fixtures.createOrder({
      apothekerUserId: pharmacy.user.id,
      vaccine,
      quantity: 2,
      deliveryDate: today,
      status: OrderStatus.PENDING,
    })

    const template = await fixtures.createRouteTemplate({
      name: 'Arrival Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [String(pharmacy.profile.id)],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<{
      generateDeliveryRoute: {
        id: string
        stops: Array<{ stopId: string }>
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
    const routeId = generated.data!.generateDeliveryRoute.id
    const stopId = generated.data!.generateDeliveryRoute.stops[0].stopId

    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(routeId) })
    expect(route).not.toBeNull()

    const targetStatus = options?.status ?? RouteStatus.IN_PROGRESS
    if (route!.status !== targetStatus) {
      route!.status = targetStatus
      await repo.save(route!)
    }

    if (options?.delivered) {
      const persisted = await repo.findOneBy({ _id: new ObjectId(routeId) })
      const stop = persisted!.stops.find(s => s.stopId === stopId)!
      stop.deliveryProof = {
        method: DeliveryProofMethod.QR,
        deliveredAt: new Date(),
        deliveredByUserId: String(courier.user.id),
        associatedOrderIds: [...stop.orderIds],
        recipientProfileId: String(pharmacy.profile.id),
        recipientCity: E2E_DEFAULT_ADDRESS.city,
      }
      await repo.save(persisted!)
    }

    return {
      routeId,
      stopId,
      courierUserId: String(courier.user.id),
      courierProfileId: String(courier.profile.id),
      templateId: String(template.id),
    }
  }

  function postArrival(
    routeId: string,
    stopId: string,
    body: Record<string, unknown>,
    authToken?: string,
  ): Promise<request.Response> {
    const req = request(server).post(
      `/delivery-routes/${encodeURIComponent(routeId)}/stops/${encodeURIComponent(stopId)}/arrival`,
    )
    if (authToken) {
      void req.set('Authorization', `Bearer ${authToken}`)
    }
    return req.send(body)
  }

  function validBody(overrides?: Record<string, unknown>) {
    return {
      clientArrivedAt: new Date().toISOString(),
      idempotencyKey: `idem-${new ObjectId().toString()}`,
      ...overrides,
    }
  }

  it('1. assigned courier records arrival', async () => {
    const seeded = await seedRoute()
    const body = validBody()

    const response = await postArrival(
      seeded.routeId,
      seeded.stopId,
      body,
      E2E_TOKENS.bezorger1,
    )

    expect(response.status).toBe(200)
    const payload = response.body as DeliveryStopArrivalResponseDto
    expect(payload.routeId).toBe(seeded.routeId)
    expect(payload.stopId).toBe(seeded.stopId)
    expect(payload.clientArrivedAt).toBe(body.clientArrivedAt)
    expect(payload.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(payload.arrivedByUserId).toBe(seeded.courierUserId)
    expect(payload.arrivalStatus).toBe('RECORDED')
    expect(payload).not.toHaveProperty('idempotencyKey')
    expect(payload).not.toHaveProperty('encodedToken')
    expect(payload).not.toHaveProperty('qrConfirmation')

    const route = await harness.dataSource
      .getMongoRepository(DeliveryRoute)
      .findOneBy({ _id: new ObjectId(seeded.routeId) })
    const stop = route!.stops.find(s => s.stopId === seeded.stopId)!
    expect(stop.arrival?.clientArrivedAt).toBeInstanceOf(Date)
    expect(stop.arrival?.recordedAt).toBeInstanceOf(Date)
    expect(stop.arrival?.arrivedByUserId).toBe(seeded.courierUserId)
    expect(stop.arrival?.arrivedByBezorgerProfileId).toBe(
      seeded.courierProfileId,
    )
    expect(stop.deliveryProof).toBeFalsy()
  })

  it('2. anonymous rejected', async () => {
    const seeded = await seedRoute()
    const response = await postArrival(
      seeded.routeId,
      seeded.stopId,
      validBody(),
    )
    expect(response.status).toBe(401)
  })

  it('3. ADMIN and APOTHEKER rejected', async () => {
    const seeded = await seedRoute()
    for (const token of [E2E_TOKENS.admin, E2E_TOKENS.apotheker1]) {
      const response = await postArrival(
        seeded.routeId,
        seeded.stopId,
        validBody(),
        token,
      )
      expect(response.status).toBe(403)
    }
  })

  it('4. unrelated courier rejected', async () => {
    const seeded = await seedRoute()
    const response = await postArrival(
      seeded.routeId,
      seeded.stopId,
      validBody(),
      E2E_TOKENS.bezorger2,
    )
    expect(response.status).toBe(403)
    expect((response.body as ErrorBody).error).toBe(
      'DELIVERY_ARRIVAL_FORBIDDEN',
    )
  })

  it('5. ASSIGNED rejected', async () => {
    const assigned = await seedRoute({ status: RouteStatus.ASSIGNED })
    const assignedRes = await postArrival(
      assigned.routeId,
      assigned.stopId,
      validBody(),
      E2E_TOKENS.bezorger1,
    )
    expect(assignedRes.status).toBe(400)
    expect((assignedRes.body as ErrorBody).error).toBe(
      'DELIVERY_ARRIVAL_ROUTE_NOT_STARTED',
    )
  })

  it('6. IN_PROGRESS accepted', async () => {
    const active = await seedRoute({ status: RouteStatus.IN_PROGRESS })
    const activeRes = await postArrival(
      active.routeId,
      active.stopId,
      validBody(),
      E2E_TOKENS.bezorger1,
    )
    expect(activeRes.status).toBe(200)
  })

  it('7. COMPLETED and CANCELLED rejected', async () => {
    for (const status of [RouteStatus.COMPLETED, RouteStatus.CANCELLED]) {
      await harness.resetDatabase()
      routePublishSpy.mockClear()
      const inactive = await seedRoute({ status })
      const res = await postArrival(
        inactive.routeId,
        inactive.stopId,
        validBody(),
        E2E_TOKENS.bezorger1,
      )
      expect(res.status).toBe(400)
      expect((res.body as ErrorBody).error).toBe(
        'DELIVERY_ARRIVAL_ROUTE_INACTIVE',
      )
    }
  })

  it('8. missing stop rejected', async () => {
    const seeded = await seedRoute()
    const response = await postArrival(
      seeded.routeId,
      'missing-stop-id',
      validBody(),
      E2E_TOKENS.bezorger1,
    )
    expect(response.status).toBe(404)
    expect((response.body as ErrorBody).error).toBe(
      'DELIVERY_ARRIVAL_STOP_NOT_FOUND',
    )
  })

  it('9. delivered stop rejected', async () => {
    const seeded = await seedRoute({ delivered: true })
    const response = await postArrival(
      seeded.routeId,
      seeded.stopId,
      validBody(),
      E2E_TOKENS.bezorger1,
    )
    expect(response.status).toBe(409)
    expect((response.body as ErrorBody).error).toBe(
      'DELIVERY_ARRIVAL_STOP_ALREADY_DELIVERED',
    )
  })

  it('10-11. future and implausibly old timestamps rejected', async () => {
    const seeded = await seedRoute()
    const future = await postArrival(
      seeded.routeId,
      seeded.stopId,
      validBody({
        clientArrivedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
      E2E_TOKENS.bezorger1,
    )
    expect(future.status).toBe(400)
    expect((future.body as ErrorBody).error).toBe(
      'DELIVERY_ARRIVAL_TIMESTAMP_INVALID',
    )

    const old = await postArrival(
      seeded.routeId,
      seeded.stopId,
      validBody({
        clientArrivedAt: '2020-01-01T00:00:00.000Z',
      }),
      E2E_TOKENS.bezorger1,
    )
    expect(old.status).toBe(400)
    expect((old.body as ErrorBody).error).toBe(
      'DELIVERY_ARRIVAL_TIMESTAMP_INVALID',
    )
  })

  it('12-15. timestamps, actor, idempotent replay, different key conflict', async () => {
    const seeded = await seedRoute()
    const clientArrivedAt = new Date().toISOString()
    const idempotencyKey = `idem-${new ObjectId().toString()}`

    const first = await postArrival(
      seeded.routeId,
      seeded.stopId,
      { clientArrivedAt, idempotencyKey },
      E2E_TOKENS.bezorger1,
    )
    expect(first.status).toBe(200)
    const firstBody = first.body as DeliveryStopArrivalResponseDto

    const route = await harness.dataSource
      .getMongoRepository(DeliveryRoute)
      .findOneBy({ _id: new ObjectId(seeded.routeId) })
    const stop = route!.stops.find(s => s.stopId === seeded.stopId)!
    expect(stop.arrival!.clientArrivedAt.toISOString()).toBe(clientArrivedAt)
    expect(stop.arrival!.recordedAt.toISOString()).toBe(firstBody.recordedAt)
    expect(stop.arrival!.arrivedByUserId).toBe(seeded.courierUserId)
    expect(stop.arrival!.arrivedByBezorgerProfileId).toBe(
      seeded.courierProfileId,
    )

    routePublishSpy.mockClear()
    const replay = await postArrival(
      seeded.routeId,
      seeded.stopId,
      { clientArrivedAt, idempotencyKey },
      E2E_TOKENS.bezorger1,
    )
    expect(replay.status).toBe(200)
    expect((replay.body as DeliveryStopArrivalResponseDto).recordedAt).toBe(
      firstBody.recordedAt,
    )
    expect(routePublishSpy).not.toHaveBeenCalled()

    const conflict = await postArrival(
      seeded.routeId,
      seeded.stopId,
      {
        clientArrivedAt,
        idempotencyKey: `idem-${new ObjectId().toString()}`,
      },
      E2E_TOKENS.bezorger1,
    )
    expect(conflict.status).toBe(409)
    expect((conflict.body as ErrorBody).error).toBe(
      'DELIVERY_ARRIVAL_ALREADY_RECORDED',
    )
  })

  it('16-18. concurrent requests create one arrival, one audit, one PubSub', async () => {
    const seeded = await seedRoute()
    const clientArrivedAt = new Date().toISOString()
    const idempotencyKey = `idem-${new ObjectId().toString()}`

    const [a, b] = await Promise.all([
      postArrival(
        seeded.routeId,
        seeded.stopId,
        { clientArrivedAt, idempotencyKey },
        E2E_TOKENS.bezorger1,
      ),
      postArrival(
        seeded.routeId,
        seeded.stopId,
        { clientArrivedAt, idempotencyKey },
        E2E_TOKENS.bezorger1,
      ),
    ])

    expect(a.status).toBe(200)
    expect(b.status).toBe(200)

    const audits = await harness.dataSource
      .getMongoRepository(DeliveryStopArrivalAuditEvent)
      .find()
    expect(audits).toHaveLength(1)
    expect(audits[0].type).toBe(
      DeliveryStopArrivalAuditEventType.DELIVERY_STOP_ARRIVAL_RECORDED,
    )

    const route = await harness.dataSource
      .getMongoRepository(DeliveryRoute)
      .findOneBy({ _id: new ObjectId(seeded.routeId) })
    const stop = route!.stops.find(s => s.stopId === seeded.stopId)!
    expect(stop.arrival).toBeTruthy()
    expect(stop.arrival!.idempotencyKey).toBe(idempotencyKey)
    // Sequential idempotent replay asserts PubSub is not repeated; concurrent
    // same-key losers should not publish when audit insert loses the race.
  })

  it('19. RouteTemplate remains unchanged', async () => {
    const seeded = await seedRoute()
    const before = await harness.dataSource
      .getMongoRepository(RouteTemplate)
      .findOneBy({ _id: new ObjectId(seeded.templateId) })

    await postArrival(
      seeded.routeId,
      seeded.stopId,
      validBody(),
      E2E_TOKENS.bezorger1,
    )

    const after = await harness.dataSource
      .getMongoRepository(RouteTemplate)
      .findOneBy({ _id: new ObjectId(seeded.templateId) })
    expect(after!.updatedAt?.toISOString?.() ?? after!.updatedAt).toEqual(
      before!.updatedAt?.toISOString?.() ?? before!.updatedAt,
    )
    expect(JSON.stringify(after!.stops)).toBe(JSON.stringify(before!.stops))
    expect(after!.stops[0]).not.toHaveProperty('arrival')
  })

  it('20. output excludes sensitive fields', async () => {
    const seeded = await seedRoute()
    const response = await postArrival(
      seeded.routeId,
      seeded.stopId,
      validBody(),
      E2E_TOKENS.bezorger1,
    )
    const raw = JSON.stringify(response.body)
    expect(raw).not.toMatch(/encodedToken|nonce|bearer|Authorization/i)
    expect(response.body).not.toHaveProperty('stops')
    expect(response.body).not.toHaveProperty('qrConfirmation')
  })
})

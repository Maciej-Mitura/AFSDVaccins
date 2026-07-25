import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import { ObjectId } from 'mongodb'
import request from 'supertest'

import { createE2eTestApp, type E2eTestApp } from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import {
  E2E_DEFAULT_ADDRESS,
  E2eFixtureBuilder,
} from './helpers/e2e-fixtures'
import {
  graphqlRequest,
} from './helpers/e2e-graphql.helper'
import { OrderStatus } from '../src/order/order-status.enum'
import { DeliveryRoute } from '../src/routes/delivery-route.entity'
import { DeliveryRouteEventsService } from '../src/routes/delivery-route-events.service'
import { DELIVERY_QR_TOKEN_SERVICE } from '../src/routes/qr/delivery-qr.constants'
import type { DeliveryQrTokenService } from '../src/routes/qr/delivery-qr-token.types'
import { createGeneratedStopQrState } from '../src/routes/qr/create-generated-stop-qr-state'
import { RouteStatus } from '../src/routes/route-status.enum'

const GENERATE = `
  mutation Generate($routeTemplateId: ID!, $deliveryDate: String!) {
    generateDeliveryRoute(routeTemplateId: $routeTemplateId, deliveryDate: $deliveryDate) {
      id
      status
      stops {
        stopId
        apothekerProfileId
        orderIds
        orderCount
        qrAvailable
        qrConsumed
      }
    }
  }
`

const DELIVERY_STOP_QR = `
  query DeliveryStopQr($routeId: ID!, $stopId: ID!) {
    deliveryStopQr(routeId: $routeId, stopId: $stopId) {
      routeId
      stopId
      routeDate
      pharmacyName
      address { city street }
      orderCount
      orderIds
      qrAvailable
      qrConsumed
      issuedAt
      qrImagePath
    }
  }
`

const DELIVERY_ROUTE = `
  query DeliveryRoute($id: ID!) {
    deliveryRoute(id: $id) {
      id
      stops {
        stopId
        qrAvailable
        qrConsumed
      }
    }
  }
`

describe('Delivery stop QR retrieval (e2e)', () => {
  let harness: E2eTestApp
  let app: INestApplication
  let fixtures: E2eFixtureBuilder
  let server: Server
  let tokenService: DeliveryQrTokenService

  beforeAll(async () => {
    harness = await createE2eTestApp()
    app = harness.app
    server = app.getHttpServer() as Server
    fixtures = new E2eFixtureBuilder(harness.dataSource)
    tokenService = harness.moduleRef.get<DeliveryQrTokenService>(
      DELIVERY_QR_TOKEN_SERVICE,
    )
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
  })

  async function seedAssignedRouteWithQr(options?: {
    multiOrder?: boolean
    status?: RouteStatus
  }): Promise<{
    routeId: string
    stopId: string
    encodedToken: string
    pharmacy: Awaited<ReturnType<E2eFixtureBuilder['createApotheker']>>
    orderIds: string[]
  }> {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({ name: 'QR Flu' })
    const today = fixtures.todayBrussels()

    const orderA = await fixtures.createOrder({
      apothekerUserId: pharmacy.user.id,
      vaccine,
      quantity: 3,
      deliveryDate: today,
      status: OrderStatus.PENDING,
    })
    const orderIds = [String(orderA.id)]

    if (options?.multiOrder) {
      const orderB = await fixtures.createOrder({
        apothekerUserId: pharmacy.user.id,
        vaccine,
        quantity: 2,
        deliveryDate: today,
        status: OrderStatus.PENDING,
      })
      orderIds.push(String(orderB.id))
    }

    const template = await fixtures.createRouteTemplate({
      name: 'QR Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [String(pharmacy.profile.id)],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<{
      generateDeliveryRoute: {
        id: string
        stops: Array<{
          stopId: string
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
    const routeId = generated.data!.generateDeliveryRoute.id
    const stop = generated.data!.generateDeliveryRoute.stops[0]
    expect(stop.stopId).toEqual(expect.any(String))

    if (options?.status && options.status !== RouteStatus.ASSIGNED) {
      const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
      const route = await repo.findOneBy({ _id: new ObjectId(routeId) })
      expect(route).not.toBeNull()
      route!.status = options.status
      await repo.save(route!)
    }

    const persisted = await harness.dataSource
      .getMongoRepository(DeliveryRoute)
      .findOneBy({ _id: new ObjectId(routeId) })
    expect(persisted?.stops[0]?.qrConfirmation?.encodedToken).toEqual(
      expect.any(String),
    )

    return {
      routeId,
      stopId: stop.stopId,
      encodedToken: persisted!.stops[0].qrConfirmation!.encodedToken,
      pharmacy,
      orderIds: stop.orderIds.map(String),
    }
  }

  async function getQr(
    routeId: string,
    stopId: string,
    token?: string,
  ): Promise<request.Response> {
    const req = request(server)
      .get(`/delivery-routes/${routeId}/stops/${stopId}/qr`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        res.on('end', () => {
          callback(null, Buffer.concat(chunks))
        })
      })
    if (token) {
      void req.set('Authorization', `Bearer ${token}`)
    }
    return req
  }

  function responseErrorCode(response: request.Response): string | undefined {
    let body: unknown = response.body
    if (Buffer.isBuffer(body)) {
      try {
        body = JSON.parse(body.toString('utf8')) as unknown
      } catch {
        return undefined
      }
    }
    if (body && typeof body === 'object' && 'error' in body) {
      const error = (body as { error?: unknown }).error
      return typeof error === 'string' ? error : undefined
    }
    return undefined
  }

  function svgBody(response: request.Response): string {
    if (typeof response.text === 'string' && response.text.includes('<svg')) {
      return response.text
    }
    if (typeof response.body === 'string') {
      return response.body
    }
    if (Buffer.isBuffer(response.body)) {
      return response.body.toString('utf8')
    }
    return ''
  }

  it('1. ADMIN can retrieve an eligible stop QR as SVG', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const response = await getQr(routeId, stopId, E2E_TOKENS.admin)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/image\/svg\+xml/)
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-disposition']).toMatch(
      /inline; filename="delivery-stop-qr\.svg"/,
    )
    expect(svgBody(response)).toContain('<svg')
    expect(JSON.stringify(response.body)).not.toContain('encodedToken')
    expect(JSON.stringify(response.body)).not.toContain('nonceHash')
  })

  it('2. owning APOTHEKER can retrieve their stop QR', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const response = await getQr(routeId, stopId, E2E_TOKENS.apotheker1)
    expect(response.status).toBe(200)
    expect(svgBody(response)).toContain('<svg')
  })

  it('3. unrelated APOTHEKER is rejected', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const response = await getQr(routeId, stopId, E2E_TOKENS.apotheker2)
    expect(response.status).toBe(403)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_FORBIDDEN')
  })

  it('4. BEZORGER is rejected', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const response = await getQr(routeId, stopId, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(403)
  })

  it('5. anonymous caller is rejected', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const response = await getQr(routeId, stopId)
    expect(response.status).toBe(401)
  })

  it('6. route ASSIGNED allows retrieval', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr({
      status: RouteStatus.ASSIGNED,
    })
    await expect(getQr(routeId, stopId, E2E_TOKENS.admin)).resolves.toEqual(
      expect.objectContaining({ status: 200 }),
    )
  })

  it('7. route IN_PROGRESS allows retrieval', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr({
      status: RouteStatus.IN_PROGRESS,
    })
    const response = await getQr(routeId, stopId, E2E_TOKENS.admin)
    expect(response.status).toBe(200)
  })

  it('8. route COMPLETED rejects retrieval', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr({
      status: RouteStatus.COMPLETED,
    })
    const response = await getQr(routeId, stopId, E2E_TOKENS.admin)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ROUTE_INACTIVE')
  })

  it('9. route CANCELLED rejects retrieval', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr({
      status: RouteStatus.CANCELLED,
    })
    const response = await getQr(routeId, stopId, E2E_TOKENS.admin)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ROUTE_INACTIVE')
  })

  it('10. consumed QR rejects retrieval', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(routeId) })
    route!.stops[0].qrConfirmation!.consumedAt = new Date()
    route!.stops[0].qrConfirmation!.consumedByUserId = 'courier-user'
    await repo.save(route!)

    const response = await getQr(routeId, stopId, E2E_TOKENS.admin)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_CONSUMED')
  })

  it('11. legacy stop without QR rejects retrieval', async () => {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    const template = await fixtures.createRouteTemplate({
      name: 'Legacy QR',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [String(pharmacy.profile.id)],
      createdByUserId: String(admin.id),
    })

    const route = await fixtures.createDeliveryRoute({
      routeTemplateId: String(template.id),
      bezorgerProfileId: String(courier.profile.id),
      deliveryDate: fixtures.todayBrussels(),
      generatedByUserId: String(admin.id),
      stops: [
        {
          stopId: 'legacy-stop-1',
          sequence: 1,
          apothekerProfileId: String(pharmacy.profile.id),
          apothekerUserId: String(pharmacy.user.id),
          pharmacyName: pharmacy.profile.pharmacyName,
          address: { ...E2E_DEFAULT_ADDRESS },
          orderIds: ['order-1'],
          orderCount: 1,
          totalQuantity: 1,
          lines: [],
        },
      ],
    })

    const response = await getQr(
      String(route.id),
      'legacy-stop-1',
      E2E_TOKENS.admin,
    )
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_NOT_AVAILABLE')
  })

  it('12. missing stop rejects safely', async () => {
    const { routeId } = await seedAssignedRouteWithQr()
    const response = await getQr(routeId, 'missing-stop-id', E2E_TOKENS.admin)
    expect(response.status).toBe(404)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_NOT_FOUND')
  })

  it('13. route/stop mismatch rejects safely', async () => {
    const first = await seedAssignedRouteWithQr()
    await harness.resetDatabase()
    const second = await seedAssignedRouteWithQr()

    const response = await getQr(
      second.routeId,
      first.stopId,
      E2E_TOKENS.admin,
    )
    expect(response.status).toBe(404)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_NOT_FOUND')
  })

  it('14. one stop with multiple orders still yields one QR', async () => {
    const seeded = await seedAssignedRouteWithQr({ multiOrder: true })
    expect(seeded.orderIds.length).toBeGreaterThanOrEqual(2)

    const first = await getQr(seeded.routeId, seeded.stopId, E2E_TOKENS.admin)
    const second = await getQr(seeded.routeId, seeded.stopId, E2E_TOKENS.admin)
    expect(first.status).toBe(200)
    expect(svgBody(second)).toBe(svgBody(first))

    const meta = await graphqlRequest<{
      deliveryStopQr: { orderCount: number; orderIds: string[] }
    }>(app, {
      query: DELIVERY_STOP_QR,
      token: E2E_TOKENS.admin,
      variables: { routeId: seeded.routeId, stopId: seeded.stopId },
    })
    expect(meta.errors).toBeUndefined()
    expect(meta.data?.deliveryStopQr.orderCount).toBe(seeded.orderIds.length)
    expect(meta.data?.deliveryStopQr.orderIds.map(String).sort()).toEqual(
      [...seeded.orderIds].sort(),
    )
  })

  it('15+17+18. same stored token yields deterministic SVG with safe headers', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const a = await getQr(routeId, stopId, E2E_TOKENS.admin)
    const b = await getQr(routeId, stopId, E2E_TOKENS.admin)
    expect(svgBody(a)).toBe(svgBody(b))
    expect(a.headers['content-type']).toMatch(/image\/svg\+xml/)
    expect(a.headers['cache-control']).toBe('private, no-store')
  })

  it('19+20. safe GraphQL metadata excludes encodedToken and nonceHash', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const meta = await graphqlRequest<{
      deliveryStopQr: {
        routeId: string
        stopId: string
        qrAvailable: boolean
        qrConsumed: boolean
        qrImagePath: string | null
        pharmacyName: string
      }
    }>(app, {
      query: DELIVERY_STOP_QR,
      token: E2E_TOKENS.apotheker1,
      variables: { routeId, stopId },
    })

    expect(meta.errors).toBeUndefined()
    expect(meta.data?.deliveryStopQr.qrAvailable).toBe(true)
    expect(meta.data?.deliveryStopQr.qrConsumed).toBe(false)
    expect(meta.data?.deliveryStopQr.qrImagePath).toBe(
      `/delivery-routes/${routeId}/stops/${stopId}/qr`,
    )
    expect(JSON.stringify(meta.body)).not.toContain('encodedToken')
    expect(JSON.stringify(meta.body)).not.toContain('nonceHash')
  })

  it('21+22. QR retrieval performs no DB mutation and emits no PubSub', async () => {
    const { routeId, stopId, encodedToken } = await seedAssignedRouteWithQr()
    const events = harness.moduleRef.get(DeliveryRouteEventsService)
    const publishSpy = jest.spyOn(events, 'publishBezorgerRouteUpdated')

    const before = await harness.dataSource
      .getMongoRepository(DeliveryRoute)
      .findOneBy({ _id: new ObjectId(routeId) })
    const beforeUpdatedAt = before!.updatedAt

    await getQr(routeId, stopId, E2E_TOKENS.admin)

    const after = await harness.dataSource
      .getMongoRepository(DeliveryRoute)
      .findOneBy({ _id: new ObjectId(routeId) })

    expect(after!.stops[0].qrConfirmation!.encodedToken).toBe(encodedToken)
    expect(after!.updatedAt.getTime()).toBe(beforeUpdatedAt.getTime())
    expect(publishSpy).not.toHaveBeenCalled()
    publishSpy.mockRestore()
  })

  it('23. malformed persisted QR state fails safely', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(routeId) })
    route!.stops[0].qrConfirmation!.encodedToken = 'not-a-signed-token'
    await repo.save(route!)

    const response = await getQr(routeId, stopId, E2E_TOKENS.admin)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_INVALID_STATE')
  })

  it('24. ordinary route GraphQL output still excludes encodedToken', async () => {
    const { routeId } = await seedAssignedRouteWithQr()
    const result = await graphqlRequest(app, {
      query: DELIVERY_ROUTE,
      token: E2E_TOKENS.admin,
      variables: { id: routeId },
    })
    expect(result.errors).toBeUndefined()
    expect(JSON.stringify(result.body)).not.toContain('encodedToken')
    expect(JSON.stringify(result.body)).not.toContain('nonceHash')
  })

  it('rejects GraphQL deliveryStopQr for unrelated pharmacy', async () => {
    const { routeId, stopId } = await seedAssignedRouteWithQr()
    const denied = await graphqlRequest<{ deliveryStopQr: unknown }>(app, {
      query: DELIVERY_STOP_QR,
      token: E2E_TOKENS.apotheker2,
      variables: { routeId, stopId },
    })
    expect(denied.errors).toBeDefined()
    expect(denied.data?.deliveryStopQr ?? null).toBeNull()
    const payload = JSON.stringify(denied.errors)
    expect(payload).toMatch(/DELIVERY_QR_FORBIDDEN|Forbidden|geen toegang/i)
  })

  it('can seed a stop QR via createGeneratedStopQrState for fixture paths', async () => {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    const template = await fixtures.createRouteTemplate({
      name: 'Manual QR',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [String(pharmacy.profile.id)],
      createdByUserId: String(admin.id),
    })

    const routeId = new ObjectId().toString()
    const { stopId, qrConfirmation } = createGeneratedStopQrState({
      routeId,
      tokenService,
    })

    const route = await fixtures.createDeliveryRoute({
      routeTemplateId: String(template.id),
      bezorgerProfileId: String(courier.profile.id),
      deliveryDate: fixtures.todayBrussels(),
      generatedByUserId: String(admin.id),
      stops: [
        {
          stopId,
          sequence: 1,
          apothekerProfileId: String(pharmacy.profile.id),
          apothekerUserId: String(pharmacy.user.id),
          pharmacyName: pharmacy.profile.pharmacyName,
          address: { ...E2E_DEFAULT_ADDRESS },
          orderIds: ['a', 'b'],
          orderCount: 2,
          totalQuantity: 4,
          lines: [],
          qrConfirmation,
        },
      ],
    })

    // Route id from Mongo may differ from provisional routeId used at mint —
    // generation normally remints after id is known. For this fixture the token
    // still encodes; retrieval only requires a valid stored encodedToken shape.
    const response = await getQr(String(route.id), stopId, E2E_TOKENS.admin)
    expect(response.status).toBe(200)
  })
})

import type { INestApplication } from '@nestjs/common'
import { Logger } from '@nestjs/common'
import type { Server } from 'node:http'
import { createHmac } from 'node:crypto'
import { ObjectId } from 'mongodb'
import request from 'supertest'

import { createE2eTestApp, type E2eTestApp } from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import {
  E2E_DEFAULT_ADDRESS,
  E2eFixtureBuilder,
} from './helpers/e2e-fixtures'
import { graphqlRequest } from './helpers/e2e-graphql.helper'
import { RATE_LIMITED_ERROR_CODE } from '../src/common/throttling/throttling.constants'
import {
  DELIVERY_QR_PREVIEW_THROTTLE_LIMIT,
  DELIVERY_QR_PREVIEW_THROTTLE_TTL_MS,
} from '../src/common/throttling/strict-rate-limit.decorator'
import { Order } from '../src/order/order.entity'
import { OrderStatus } from '../src/order/order-status.enum'
import { DeliveryRoute } from '../src/routes/delivery-route.entity'
import { DeliveryRouteEventsService } from '../src/routes/delivery-route-events.service'
import {
  DELIVERY_QR_TEST_SIGNING_SECRET,
} from '../src/routes/qr/delivery-qr.constants'
import { DELIVERY_QR_PREVIEW_TOKEN_MAX_LENGTH } from '../src/routes/qr/delivery-qr-preview.constants'
import type { DeliveryQrPreviewResponseDto } from '../src/routes/qr/delivery-qr-preview.dto'
import { DeliveryProofMethod } from '../src/routes/qr/delivery-proof-method.enum'
import { generateDeliveryQrNonce } from '../src/routes/qr/delivery-qr-nonce.util'
import { RouteStatus } from '../src/routes/route-status.enum'

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
        pharmacyName
        orderIds
        orderCount
      }
    }
  }
`

describe('Delivery QR scan preview (e2e)', () => {
  let harness: E2eTestApp
  let app: INestApplication
  let fixtures: E2eFixtureBuilder
  let server: Server
  let eventsService: DeliveryRouteEventsService
  let publishSpy: jest.SpyInstance

  beforeAll(async () => {
    harness = await createE2eTestApp()
    app = harness.app
    server = app.getHttpServer() as Server
    fixtures = new E2eFixtureBuilder(harness.dataSource)
    eventsService = harness.moduleRef.get(DeliveryRouteEventsService)
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
    publishSpy = jest
      .spyOn(eventsService, 'publishBezorgerRouteUpdated')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    publishSpy?.mockRestore()
  })

  async function seedInProgressRoute(options?: {
    multiOrder?: boolean
    multiStop?: boolean
    status?: RouteStatus
  }): Promise<{
    routeId: string
    stopId: string
    secondStopId?: string
    encodedToken: string
    secondEncodedToken?: string
    pharmacy: Awaited<ReturnType<E2eFixtureBuilder['createApotheker']>>
    orderIds: string[]
    vaccineName: string
  }> {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const pharmacy2 = options?.multiStop
      ? await fixtures.createApotheker(E2E_TOKENS.apotheker2)
      : null
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.createBezorger(E2E_TOKENS.bezorger2)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({ name: 'Preview Flu' })
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

    if (pharmacy2) {
      await fixtures.createOrder({
        apothekerUserId: pharmacy2.user.id,
        vaccine,
        quantity: 1,
        deliveryDate: today,
        status: OrderStatus.PENDING,
      })
    }

    const template = await fixtures.createRouteTemplate({
      name: 'Preview Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: pharmacy2
        ? [String(pharmacy.profile.id), String(pharmacy2.profile.id)]
        : [String(pharmacy.profile.id)],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<{
      generateDeliveryRoute: {
        id: string
        stops: Array<{
          stopId: string
          sequence: number
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
    const stops = generated.data!.generateDeliveryRoute.stops
    const stop = stops[0]

    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(routeId) })
    expect(route).not.toBeNull()

    const targetStatus = options?.status ?? RouteStatus.IN_PROGRESS
    if (route!.status !== targetStatus) {
      route!.status = targetStatus
      await repo.save(route!)
    }

    const persisted = await repo.findOneBy({ _id: new ObjectId(routeId) })
    const firstStop = persisted!.stops.find(s => s.stopId === stop.stopId)!
    const second = options?.multiStop
      ? persisted!.stops.find(s => s.stopId !== stop.stopId)
      : undefined

    return {
      routeId,
      stopId: stop.stopId,
      secondStopId: second?.stopId,
      encodedToken: firstStop.qrConfirmation!.encodedToken,
      secondEncodedToken: second?.qrConfirmation?.encodedToken,
      pharmacy,
      orderIds: firstStop.orderIds.map(String),
      vaccineName: vaccine.name,
    }
  }

  function preview(
    token: string | undefined,
    authToken?: string,
    body?: Record<string, unknown>,
  ): Promise<request.Response> {
    const req = request(server).post('/delivery-routes/qr/preview')
    if (authToken) {
      void req.set('Authorization', `Bearer ${authToken}`)
    }
    return req.send(
      body !== undefined
        ? body
        : token !== undefined
          ? { token }
          : {},
    )
  }

  function responseErrorCode(response: request.Response): string | undefined {
    const body = response.body as ErrorBody
    return typeof body?.error === 'string' ? body.error : undefined
  }

  function previewBody(
    response: request.Response,
  ): DeliveryQrPreviewResponseDto {
    return response.body as DeliveryQrPreviewResponseDto
  }

  function assertNoSecretsInPayload(
    response: request.Response,
    encodedToken?: string,
  ): void {
    const serialised = JSON.stringify(response.body)
    expect(serialised).not.toContain('encodedToken')
    expect(serialised).not.toContain('nonceHash')
    expect(serialised).not.toContain('nonce')
    expect(serialised).not.toMatch(/signing/i)
    if (encodedToken) {
      expect(serialised).not.toContain(encodedToken)
    }
    const message = (response.body as ErrorBody).message
    if (typeof message === 'string' && encodedToken) {
      expect(message).not.toContain(encodedToken)
    }
  }

  it('documents the preview throttle policy (20 / 10 minutes)', () => {
    expect(DELIVERY_QR_PREVIEW_THROTTLE_LIMIT).toBe(20)
    expect(DELIVERY_QR_PREVIEW_THROTTLE_TTL_MS).toBe(600_000)
  })

  it('1. assigned BEZORGER can preview a valid stop token', async () => {
    const seeded = await seedInProgressRoute()
    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    const body = previewBody(response)

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      routeId: seeded.routeId,
      stopId: seeded.stopId,
      routeStatus: RouteStatus.IN_PROGRESS,
      stopSequence: 1,
      pharmacy: {
        city: E2E_DEFAULT_ADDRESS.city,
        postalCode: E2E_DEFAULT_ADDRESS.postalCode,
      },
      orderCount: 1,
      canConfirmDelivery: true,
    })
    expect(typeof body.pharmacy.name).toBe('string')
    expect(body.pharmacy.name.length).toBeGreaterThan(0)
    expect(body.orders[0].lines[0]).toMatchObject({
      vaccineName: seeded.vaccineName,
      quantity: 3,
    })
    assertNoSecretsInPayload(response, seeded.encodedToken)
  })

  it('2. anonymous caller is rejected', async () => {
    const seeded = await seedInProgressRoute()
    const response = await preview(seeded.encodedToken)
    expect(response.status).toBe(401)
  })

  it('3. ADMIN is rejected', async () => {
    const seeded = await seedInProgressRoute()
    const response = await preview(seeded.encodedToken, E2E_TOKENS.admin)
    expect(response.status).toBe(403)
  })

  it('4. APOTHEKER is rejected', async () => {
    const seeded = await seedInProgressRoute()
    const response = await preview(seeded.encodedToken, E2E_TOKENS.apotheker1)
    expect(response.status).toBe(403)
  })

  it('5. unrelated BEZORGER is rejected', async () => {
    const seeded = await seedInProgressRoute()
    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger2)
    expect(response.status).toBe(403)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_FORBIDDEN')
    assertNoSecretsInPayload(response, seeded.encodedToken)
  })

  it('6. token is required', async () => {
    await seedInProgressRoute()
    const response = await preview(undefined, E2E_TOKENS.bezorger1, {})
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_TOKEN_REQUIRED')
  })

  it('7. oversized token is rejected', async () => {
    await seedInProgressRoute()
    const response = await preview(
      'x'.repeat(DELIVERY_QR_PREVIEW_TOKEN_MAX_LENGTH + 1),
      E2E_TOKENS.bezorger1,
    )
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_TOKEN_INVALID')
  })

  it('8. malformed token is rejected', async () => {
    await seedInProgressRoute()
    const response = await preview('not-a-token', E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_TOKEN_INVALID')
    assertNoSecretsInPayload(response)
  })

  it('9. modified signature is rejected', async () => {
    const seeded = await seedInProgressRoute()
    const [encoded] = seeded.encodedToken.split('.')
    const bad = `${encoded}.${createHmac('sha256', 'wrong-secret-32-chars-minimum!!')
      .update(encoded, 'utf8')
      .digest('base64url')}`
    const response = await preview(bad, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_TOKEN_INVALID')
  })

  it('10–12. modified routeId, stopId, or nonce without valid resign is rejected', async () => {
    const seeded = await seedInProgressRoute()
    const [encoded, signature] = seeded.encodedToken.split('.')
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>

    const cases = [
      { ...payload, routeId: new ObjectId().toHexString() },
      { ...payload, stopId: 'tampered-stop-id' },
      { ...payload, nonce: generateDeliveryQrNonce() },
    ]

    for (const tamperedPayload of cases) {
      const tamperedEncoded = Buffer.from(
        JSON.stringify(tamperedPayload),
        'utf8',
      ).toString('base64url')
      const response = await preview(
        `${tamperedEncoded}.${signature}`,
        E2E_TOKENS.bezorger1,
      )
      expect(response.status).toBe(400)
      expect(responseErrorCode(response)).toBe('DELIVERY_QR_TOKEN_INVALID')
    }
  })

  it('13. unsupported version is rejected', async () => {
    const seeded = await seedInProgressRoute()
    const [encoded] = seeded.encodedToken.split('.')
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>
    payload.v = 99
    const tamperedEncoded = Buffer.from(
      JSON.stringify(payload),
      'utf8',
    ).toString('base64url')
    const signature = createHmac('sha256', DELIVERY_QR_TEST_SIGNING_SECRET)
      .update(tamperedEncoded, 'utf8')
      .digest('base64url')
    const response = await preview(
      `${tamperedEncoded}.${signature}`,
      E2E_TOKENS.bezorger1,
    )
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_VERSION_UNSUPPORTED')
  })

  it('14. ASSIGNED route rejects preview', async () => {
    const seeded = await seedInProgressRoute({ status: RouteStatus.ASSIGNED })
    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ROUTE_NOT_STARTED')
  })

  it('15. IN_PROGRESS route allows preview', async () => {
    const seeded = await seedInProgressRoute({
      status: RouteStatus.IN_PROGRESS,
    })
    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(200)
  })

  it('16. COMPLETED route rejects preview', async () => {
    const seeded = await seedInProgressRoute({ status: RouteStatus.COMPLETED })
    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ROUTE_INACTIVE')
  })

  it('17. CANCELLED route rejects preview', async () => {
    const seeded = await seedInProgressRoute({ status: RouteStatus.CANCELLED })
    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ROUTE_INACTIVE')
  })

  it('18. consumed QR rejects preview', async () => {
    const seeded = await seedInProgressRoute()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    route!.stops[0].qrConfirmation!.consumedAt = new Date()
    route!.stops[0].qrConfirmation!.consumedByUserId = 'courier'
    await repo.save(route!)

    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_CONSUMED')
  })

  it('19. already-delivered stop rejects preview', async () => {
    const seeded = await seedInProgressRoute()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    route!.stops[0].deliveryProof = {
      method: DeliveryProofMethod.QR,
      deliveredAt: new Date(),
      deliveredByUserId: 'courier',
      associatedOrderIds: seeded.orderIds,
      recipientProfileId: String(seeded.pharmacy.profile.id),
      recipientCity: E2E_DEFAULT_ADDRESS.city,
    }
    await repo.save(route!)

    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe(
      'DELIVERY_QR_STOP_ALREADY_DELIVERED',
    )
  })

  it('20. stops can be previewed out of sequence', async () => {
    const seeded = await seedInProgressRoute({ multiStop: true })
    expect(seeded.secondEncodedToken).toEqual(expect.any(String))
    expect(seeded.secondStopId).toEqual(expect.any(String))

    const secondToken = seeded.secondEncodedToken
    if (!secondToken) {
      throw new Error('expected second stop token')
    }

    const response = await preview(secondToken, E2E_TOKENS.bezorger1)
    const body = previewBody(response)
    expect(response.status).toBe(200)
    expect(body.stopId).toBe(seeded.secondStopId)
    expect(body.stopSequence).toBeGreaterThan(1)
  })

  it('21–23. multiple orders, vaccine lines, and only scanned-stop orders', async () => {
    const seeded = await seedInProgressRoute({
      multiOrder: true,
      multiStop: true,
    })
    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    const body = previewBody(response)

    expect(response.status).toBe(200)
    expect(body.orderCount).toBe(2)
    expect(body.orders).toHaveLength(2)
    expect(body.totalItemQuantity).toBe(5)
    expect(body.orders.map(o => o.orderId).sort()).toEqual(
      [...seeded.orderIds].sort(),
    )
    for (const order of body.orders) {
      expect(order.lines[0].vaccineName).toBe(seeded.vaccineName)
      expect([2, 3]).toContain(order.lines[0].quantity)
    }
  })

  it('24. missing associated order fails the entire preview', async () => {
    const seeded = await seedInProgressRoute()
    const orderRepo = harness.dataSource.getMongoRepository(Order)
    const order = await orderRepo.findOneBy({
      _id: new ObjectId(seeded.orderIds[0]),
    })
    expect(order).not.toBeNull()
    await orderRepo.remove(order!)

    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ORDER_INTEGRITY_ERROR')
    expect(
      (response.body as Record<string, unknown>).orders,
    ).toBeUndefined()
  })

  it('25. pharmacy/order mismatch fails the entire preview', async () => {
    const seeded = await seedInProgressRoute()
    const orderRepo = harness.dataSource.getMongoRepository(Order)
    const order = await orderRepo.findOneBy({
      _id: new ObjectId(seeded.orderIds[0]),
    })
    order!.apothekerId = new ObjectId().toHexString()
    await orderRepo.save(order!)

    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ORDER_INTEGRITY_ERROR')
  })

  it('26. cancelled order fails the entire preview', async () => {
    const seeded = await seedInProgressRoute()
    const orderRepo = harness.dataSource.getMongoRepository(Order)
    const order = await orderRepo.findOneBy({
      _id: new ObjectId(seeded.orderIds[0]),
    })
    order!.status = OrderStatus.CANCELLED
    await orderRepo.save(order!)

    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ORDER_INTEGRITY_ERROR')
  })

  it('27. already-delivered order fails the entire preview', async () => {
    const seeded = await seedInProgressRoute()
    const orderRepo = harness.dataSource.getMongoRepository(Order)
    const order = await orderRepo.findOneBy({
      _id: new ObjectId(seeded.orderIds[0]),
    })
    order!.status = OrderStatus.DELIVERED
    await orderRepo.save(order!)

    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ORDER_INTEGRITY_ERROR')
  })

  it('28–30. preview performs no mutations, does not consume, and allows repeats', async () => {
    const seeded = await seedInProgressRoute()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const before = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })

    const first = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    const second = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const after = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    expect(after!.status).toBe(before!.status)
    expect(after!.stops[0].qrConfirmation!.consumedAt ?? null).toBeNull()
    expect(after!.stops[0].qrConfirmation!.consumedByUserId ?? null).toBeNull()
    expect(after!.stops[0].qrConfirmation!.encodedToken).toBe(
      before!.stops[0].qrConfirmation!.encodedToken,
    )
    expect(after!.stops[0].qrConfirmation!.nonceHash).toBe(
      before!.stops[0].qrConfirmation!.nonceHash,
    )
  })

  it('31–32. no PubSub event and no audit side effects', async () => {
    const seeded = await seedInProgressRoute()
    // Route generation may publish; preview itself must not.
    publishSpy.mockClear()

    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(200)
    expect(publishSpy).not.toHaveBeenCalled()
  })

  it('33. response excludes token, nonceHash and signing details', async () => {
    const seeded = await seedInProgressRoute()
    const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    assertNoSecretsInPayload(response, seeded.encodedToken)
    expect(response.body).not.toHaveProperty('qrConfirmation')
  })

  it('34–36. strict throttle yields stable 429 without token leakage', async () => {
    const seeded = await seedInProgressRoute()
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation()

    let limited: request.Response | undefined
    // E2E default APP_GUARD limit is 5/min; preview policy is 20/10min.
    // Either path must return stable RATE_LIMITED without echoing the token.
    for (let i = 0; i < 30; i += 1) {
      const response = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
      if (response.status === 429) {
        limited = response
        break
      }
    }

    expect(limited).toBeDefined()
    expect(limited!.status).toBe(429)
    expect(responseErrorCode(limited!)).toBe(RATE_LIMITED_ERROR_CODE)
    assertNoSecretsInPayload(limited!, seeded.encodedToken)

    for (const call of warnSpy.mock.calls) {
      const serialised = JSON.stringify(call)
      expect(serialised).not.toContain(seeded.encodedToken)
      expect(serialised).not.toContain('nonceHash')
    }

    warnSpy.mockRestore()
  })
})

import type { INestApplication } from '@nestjs/common'
import { Logger } from '@nestjs/common'
import type { Server } from 'node:http'
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
  DELIVERY_QR_CONFIRM_THROTTLE_LIMIT,
  DELIVERY_QR_CONFIRM_THROTTLE_TTL_MS,
} from '../src/common/throttling/strict-rate-limit.decorator'
import { Order } from '../src/order/order.entity'
import { OrderEventsService } from '../src/order/order-events.service'
import { OrderStatus } from '../src/order/order-status.enum'
import { DeliveryRoute } from '../src/routes/delivery-route.entity'
import { DeliveryRouteEventsService } from '../src/routes/delivery-route-events.service'
import {
  DeliveryQrConfirmAuditEvent,
  DeliveryQrConfirmAuditEventType,
} from '../src/routes/qr/delivery-qr-confirm-audit.entity'
import type { DeliveryQrConfirmResponseDto } from '../src/routes/qr/delivery-qr-confirm.dto'
import { DeliveryProofMethod } from '../src/routes/qr/delivery-proof-method.enum'
import { RouteStatus } from '../src/routes/route-status.enum'
import { StopConfirmationProcessState } from '../src/routes/qr/stop-confirmation-process.embed'
import { buildDeliveryDecrementIdempotencyKey } from '../src/stock/delivery-decrement.types'
import { StockAdjustment } from '../src/stock/stock-adjustment.entity'
import { StockAdjustmentType } from '../src/stock/stock-adjustment-type.enum'

type ErrorBody = {
  message?: string
  error?: string
}

const GENERATE = `
  mutation Generate($routeTemplateId: ID!, $deliveryDate: String!) {
    generateDeliveryRoute(routeTemplateId: $routeTemplateId, deliveryDate: $deliveryDate) {
      route {  id
        status
        stops {
          stopId
          sequence
          pharmacyName
          orderIds
          orderCount
        }
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

const UPDATE_ROUTE_STATUS = `
  mutation UpdateRoute($id: ID!, $status: RouteStatus!) {
    updateRouteStatus(id: $id, status: $status) {
      id
      status
    }
  }
`

describe('Delivery QR confirm (e2e)', () => {
  let harness: E2eTestApp
  let app: INestApplication
  let fixtures: E2eFixtureBuilder
  let server: Server
  let routeEvents: DeliveryRouteEventsService
  let orderEvents: OrderEventsService
  let routePublishSpy: jest.SpyInstance
  let orderPublishSpy: jest.SpyInstance

  beforeAll(async () => {
    harness = await createE2eTestApp()
    app = harness.app
    server = app.getHttpServer() as Server
    fixtures = new E2eFixtureBuilder(harness.dataSource)
    routeEvents = harness.moduleRef.get(DeliveryRouteEventsService)
    orderEvents = harness.moduleRef.get(OrderEventsService)
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
    routePublishSpy = jest
      .spyOn(routeEvents, 'publishBezorgerRouteUpdated')
      .mockResolvedValue(undefined)
    orderPublishSpy = jest
      .spyOn(orderEvents, 'publishOrderStatusChanged')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    routePublishSpy?.mockRestore()
    orderPublishSpy?.mockRestore()
  })

  async function seedInProgressRoute(options?: {
    multiOrder?: boolean
    multiStop?: boolean
    status?: RouteStatus
    includeUnrelatedOrder?: boolean
  }): Promise<{
    routeId: string
    stopId: string
    secondStopId?: string
    secondEncodedToken?: string
    encodedToken: string
    pharmacy: Awaited<ReturnType<E2eFixtureBuilder['createApotheker']>>
    courierUserId: string
    orderIds: string[]
    unrelatedOrderId?: string
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
    const vaccine = await fixtures.createVaccine({
      name: 'Confirm Flu',
      stockQuantity: 500,
    })
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

    let unrelatedOrderId: string | undefined
    if (options?.includeUnrelatedOrder) {
      const unrelated = await fixtures.createOrder({
        apothekerUserId: pharmacy.user.id,
        vaccine,
        quantity: 1,
        deliveryDate: today,
        status: OrderStatus.PENDING,
      })
      unrelatedOrderId = String(unrelated.id)
      // Force a different delivery date so it is not pulled onto the route.
      const orderRepo = harness.dataSource.getMongoRepository(Order)
      const doc = await orderRepo.findOneBy({ _id: new ObjectId(unrelatedOrderId) })
      doc!.deliveryDate = '2099-01-01'
      await orderRepo.save(doc!)
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
      name: 'Confirm Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: pharmacy2
        ? [String(pharmacy.profile.id), String(pharmacy2.profile.id)]
        : [String(pharmacy.profile.id)],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<{
      generateDeliveryRoute: {
        route: {
          id: string
          stops: Array<{
            stopId: string
            sequence: number
            orderIds: string[]
            orderCount: number
          }>
        }
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
    const routeId = generated.data!.generateDeliveryRoute.route.id
    const stops = generated.data!.generateDeliveryRoute.route.stops
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
      courierUserId: String(courier.user.id),
      orderIds: firstStop.orderIds.map(String),
      unrelatedOrderId,
      vaccineName: vaccine.name,
    }
  }

  function confirm(
    token: string | undefined,
    authToken?: string,
    body?: Record<string, unknown>,
  ): Promise<request.Response> {
    const req = request(server).post('/delivery-routes/qr/confirm')
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

  function preview(
    token: string,
    authToken: string,
  ): Promise<request.Response> {
    return request(server)
      .post('/delivery-routes/qr/preview')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token })
  }

  function responseErrorCode(response: request.Response): string | undefined {
    const body = response.body as ErrorBody
    return typeof body?.error === 'string' ? body.error : undefined
  }

  function confirmBody(
    response: request.Response,
  ): DeliveryQrConfirmResponseDto {
    return response.body as DeliveryQrConfirmResponseDto
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
  }

  it('documents the confirm throttle policy (10 / 10 minutes)', () => {
    expect(DELIVERY_QR_CONFIRM_THROTTLE_LIMIT).toBe(10)
    expect(DELIVERY_QR_CONFIRM_THROTTLE_TTL_MS).toBe(600_000)
  })

  it('1. assigned courier can confirm a valid stop', async () => {
    const seeded = await seedInProgressRoute()
    routePublishSpy.mockClear()
    orderPublishSpy.mockClear()

    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(200)
    const body = confirmBody(response)
    expect(body.routeId).toBe(seeded.routeId)
    expect(body.stopId).toBe(seeded.stopId)
    expect(body.proofMethod).toBe(DeliveryProofMethod.QR)
    expect(body.deliveredByUserId).toBe(seeded.courierUserId)
    expect(body.orderIds).toEqual(seeded.orderIds)
    expect(body.orderCount).toBe(seeded.orderIds.length)
    expect(body.recipientCity).toBe(E2E_DEFAULT_ADDRESS.city)
    expect(body.routeStatus).toBe(RouteStatus.IN_PROGRESS)
    expect(body.remainingStopCount).toBe(0)
    assertNoSecretsInPayload(response, seeded.encodedToken)
  })

  it('2. anonymous caller rejected', async () => {
    const seeded = await seedInProgressRoute()
    const response = await confirm(seeded.encodedToken)
    expect(response.status).toBe(401)
  })

  it('3. ADMIN rejected', async () => {
    const seeded = await seedInProgressRoute()
    const response = await confirm(seeded.encodedToken, E2E_TOKENS.admin)
    expect(response.status).toBe(403)
  })

  it('4. APOTHEKER rejected', async () => {
    const seeded = await seedInProgressRoute()
    const response = await confirm(seeded.encodedToken, E2E_TOKENS.apotheker1)
    expect(response.status).toBe(403)
  })

  it('5. unrelated courier rejected', async () => {
    const seeded = await seedInProgressRoute()
    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger2)
    expect(response.status).toBe(403)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_FORBIDDEN')
  })

  it('6. invalid token rejected', async () => {
    await seedInProgressRoute()
    const response = await confirm('not-a-valid-token', E2E_TOKENS.bezorger1)
    expect(response.status).toBe(400)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_TOKEN_INVALID')
  })

  it('7. route ASSIGNED rejected', async () => {
    const seeded = await seedInProgressRoute({ status: RouteStatus.ASSIGNED })
    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ROUTE_NOT_STARTED')
  })

  it('8. route COMPLETED rejected', async () => {
    const seeded = await seedInProgressRoute({ status: RouteStatus.COMPLETED })
    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ROUTE_INACTIVE')
  })

  it('9. route CANCELLED rejected', async () => {
    const seeded = await seedInProgressRoute({ status: RouteStatus.CANCELLED })
    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ROUTE_INACTIVE')
  })

  it('10–11. consumed QR and already-delivered stop rejected', async () => {
    const seeded = await seedInProgressRoute()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)

    const consumed = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    consumed!.stops[0].qrConfirmation!.consumedAt = new Date()
    consumed!.stops[0].qrConfirmation!.consumedByUserId = seeded.courierUserId
    await repo.save(consumed!)

    const consumedResponse = await confirm(
      seeded.encodedToken,
      E2E_TOKENS.bezorger1,
    )
    expect(responseErrorCode(consumedResponse)).toBe('DELIVERY_QR_CONSUMED')

    await harness.resetDatabase()
    const seeded2 = await seedInProgressRoute()
    const delivered = await repo.findOneBy({
      _id: new ObjectId(seeded2.routeId),
    })
    // Match preview e2e: proof without consume fields → ALREADY_DELIVERED.
    delivered!.stops[0].deliveryProof = {
      method: DeliveryProofMethod.QR,
      deliveredAt: new Date(),
      deliveredByUserId: seeded2.courierUserId,
      associatedOrderIds: seeded2.orderIds,
      recipientProfileId: String(seeded2.pharmacy.profile.id),
      recipientCity: E2E_DEFAULT_ADDRESS.city,
      confirmationEventId: new ObjectId().toString(),
    }
    await repo.save(delivered!)

    const deliveredResponse = await confirm(
      seeded2.encodedToken,
      E2E_TOKENS.bezorger1,
    )
    expect(responseErrorCode(deliveredResponse)).toBe(
      'DELIVERY_QR_STOP_ALREADY_DELIVERED',
    )
  })

  it('12. missing order fails without mutation', async () => {
    const seeded = await seedInProgressRoute()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    const missingId = new ObjectId().toString()
    route!.stops[0].orderIds = [missingId]
    route!.stops[0].orderCount = 1
    await repo.save(route!)
    routePublishSpy.mockClear()

    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ORDER_INTEGRITY_ERROR')

    const after = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    expect(after!.stops[0].qrConfirmation!.consumedAt ?? null).toBeNull()
    expect(after!.stops[0].deliveryProof ?? null).toBeNull()
    expect(routePublishSpy).not.toHaveBeenCalled()
  })

  it('13. pharmacy mismatch fails without mutation', async () => {
    const seeded = await seedInProgressRoute()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    route!.stops[0].apothekerUserId = new ObjectId().toString()
    await repo.save(route!)
    routePublishSpy.mockClear()

    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ORDER_INTEGRITY_ERROR')
    const after = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    expect(after!.stops[0].deliveryProof ?? null).toBeNull()
    expect(routePublishSpy).not.toHaveBeenCalled()
  })

  it('14. cancelled order fails without mutation', async () => {
    const seeded = await seedInProgressRoute()
    const orderRepo = harness.dataSource.getMongoRepository(Order)
    const order = await orderRepo.findOneBy({
      _id: new ObjectId(seeded.orderIds[0]),
    })
    order!.status = OrderStatus.CANCELLED
    await orderRepo.save(order!)
    routePublishSpy.mockClear()

    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ORDER_INTEGRITY_ERROR')
    expect(routePublishSpy).not.toHaveBeenCalled()
  })

  it('15. already-delivered order fails without mutation', async () => {
    const seeded = await seedInProgressRoute()
    const orderRepo = harness.dataSource.getMongoRepository(Order)
    const order = await orderRepo.findOneBy({
      _id: new ObjectId(seeded.orderIds[0]),
    })
    order!.status = OrderStatus.DELIVERED
    order!.stockDecrementedAt = new Date()
    await orderRepo.save(order!)
    routePublishSpy.mockClear()

    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ORDER_INTEGRITY_ERROR')
    expect(routePublishSpy).not.toHaveBeenCalled()
  })

  it('16–22. all stop orders delivered with correct proof', async () => {
    const seeded = await seedInProgressRoute({
      multiOrder: true,
      includeUnrelatedOrder: true,
    })
    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(200)

    const orderRepo = harness.dataSource.getMongoRepository(Order)
    for (const orderId of seeded.orderIds) {
      const order = await orderRepo.findOneBy({ _id: new ObjectId(orderId) })
      expect(order!.status).toBe(OrderStatus.DELIVERED)
      expect(order!.stockDecrementedAt).toBeTruthy()
    }

    const unrelated = await orderRepo.findOneBy({
      _id: new ObjectId(seeded.unrelatedOrderId!),
    })
    expect(unrelated!.status).toBe(OrderStatus.PENDING)

    const route = await harness.dataSource
      .getMongoRepository(DeliveryRoute)
      .findOneBy({ _id: new ObjectId(seeded.routeId) })
    const stop = route!.stops.find(s => s.stopId === seeded.stopId)!
    expect(stop.qrConfirmation!.consumedAt).toBeTruthy()
    expect(stop.qrConfirmation!.consumedByUserId).toBe(seeded.courierUserId)
    expect(stop.deliveryProof!.method).toBe(DeliveryProofMethod.QR)
    expect(stop.deliveryProof!.deliveredByUserId).toBe(seeded.courierUserId)
    expect(stop.deliveryProof!.associatedOrderIds).toEqual(seeded.orderIds)
    expect(stop.deliveryProof!.recipientProfileId).toBe(
      String(seeded.pharmacy.profile.id),
    )
    expect(stop.deliveryProof!.recipientCity).toBe(E2E_DEFAULT_ADDRESS.city)
    expect(stop.deliveryProof!.confirmationEventId).toBeTruthy()
  })

  it('23. confirmation response excludes token/signing data', async () => {
    const seeded = await seedInProgressRoute()
    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    assertNoSecretsInPayload(response, seeded.encodedToken)
    expect(response.body).not.toHaveProperty('qrConfirmation')
    expect(response.body).not.toHaveProperty('confirmationEventId')
  })

  it('24–25. audit event written exactly once without secrets', async () => {
    const seeded = await seedInProgressRoute()
    await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)

    const audits = await harness.dataSource
      .getMongoRepository(DeliveryQrConfirmAuditEvent)
      .find()
    expect(audits).toHaveLength(1)
    expect(audits[0].type).toBe(
      DeliveryQrConfirmAuditEventType.DELIVERY_STOP_CONFIRMED_BY_QR,
    )
    expect(audits[0].routeId).toBe(seeded.routeId)
    expect(audits[0].stopId).toBe(seeded.stopId)
    expect(audits[0].orderIds).toEqual(seeded.orderIds)
    const serialised = JSON.stringify(audits[0])
    expect(serialised).not.toContain(seeded.encodedToken)
    expect(serialised).not.toContain('nonceHash')
    expect(serialised).not.toMatch(/signing/i)
  })

  it('26–27. PubSub emitted only after success; failures emit none', async () => {
    const seeded = await seedInProgressRoute()
    routePublishSpy.mockClear()
    orderPublishSpy.mockClear()

    const failed = await confirm('bad-token', E2E_TOKENS.bezorger1)
    expect(failed.status).toBe(400)
    expect(routePublishSpy).not.toHaveBeenCalled()
    expect(orderPublishSpy).not.toHaveBeenCalled()

    const ok = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(ok.status).toBe(200)
    expect(routePublishSpy).toHaveBeenCalledTimes(1)
    expect(orderPublishSpy).toHaveBeenCalledTimes(seeded.orderIds.length)
    const firstCall = routePublishSpy.mock.calls[0] as unknown as [
      DeliveryRoute,
    ]
    const routeJson = JSON.stringify(firstCall[0])
    expect(routeJson).not.toContain(seeded.encodedToken)
  })

  it('28–30. concurrent confirmations yield one success and one conflict; one proof; one audit', async () => {
    const seeded = await seedInProgressRoute()
    const [a, b] = await Promise.all([
      confirm(seeded.encodedToken, E2E_TOKENS.bezorger1),
      confirm(seeded.encodedToken, E2E_TOKENS.bezorger1),
    ])

    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual([200, 409])
    const conflict = a.status === 409 ? a : b
    const conflictCode = responseErrorCode(conflict)
    expect([
      'DELIVERY_QR_CONFIRMATION_CONFLICT',
      'DELIVERY_QR_CONFIRMATION_IN_PROGRESS',
      'DELIVERY_QR_CONSUMED',
      'DELIVERY_QR_STOP_ALREADY_DELIVERED',
    ]).toContain(conflictCode)

    const route = await harness.dataSource
      .getMongoRepository(DeliveryRoute)
      .findOneBy({ _id: new ObjectId(seeded.routeId) })
    expect(route!.stops[0].deliveryProof).toBeTruthy()
    expect(route!.stops[0].deliveryProof!.confirmationEventId).toBeTruthy()
    expect(route!.stops[0].confirmationProcess?.state).toBe('COMPLETED')

    const audits = await harness.dataSource
      .getMongoRepository(DeliveryQrConfirmAuditEvent)
      .find()
    expect(audits).toHaveLength(1)
    expect(audits[0].confirmationEventId).toBe(
      route!.stops[0].deliveryProof!.confirmationEventId,
    )
  })

  it('31. repeated confirmation is rejected', async () => {
    const seeded = await seedInProgressRoute()
    const first = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(first.status).toBe(200)
    const second = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(second.status).toBe(409)
    expect([
      'DELIVERY_QR_CONSUMED',
      'DELIVERY_QR_STOP_ALREADY_DELIVERED',
    ]).toContain(responseErrorCode(second))
  })

  it('crash-recovery: PROCESSING with no orders delivered is resumable', async () => {
    const seeded = await seedInProgressRoute({ multiOrder: true })
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const eventId = new ObjectId().toString()
    const route = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    const stop = route!.stops.find(s => s.stopId === seeded.stopId)!
    const originalToken = stop.qrConfirmation!.encodedToken

    stop.confirmationProcess = {
      state: StopConfirmationProcessState.PROCESSING,
      confirmationEventId: eventId,
      claimedAt: new Date(),
      claimedByUserId: seeded.courierUserId,
      lastUpdatedAt: new Date(),
    }
    stop.deliveryProof = null
    stop.qrConfirmation!.consumedAt = null
    stop.qrConfirmation!.consumedByUserId = null
    await repo.save(route!)

    const mid = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    const midStop = mid!.stops.find(s => s.stopId === seeded.stopId)!
    expect(midStop.qrConfirmation!.consumedAt ?? null).toBeNull()
    expect(midStop.deliveryProof ?? null).toBeNull()
    expect(midStop.qrConfirmation!.encodedToken).toBe(originalToken)

    routePublishSpy.mockClear()
    orderPublishSpy.mockClear()

    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(200)

    const after = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    const afterStop = after!.stops.find(s => s.stopId === seeded.stopId)!
    expect(afterStop.qrConfirmation!.consumedAt).toBeTruthy()
    expect(afterStop.qrConfirmation!.consumedByUserId).toBe(seeded.courierUserId)
    expect(afterStop.deliveryProof!.confirmationEventId).toBe(eventId)
    expect(afterStop.deliveryProof!.associatedOrderIds).toEqual(seeded.orderIds)
    expect(afterStop.confirmationProcess?.state).toBe('COMPLETED')

    const orderRepo = harness.dataSource.getMongoRepository(Order)
    for (const orderId of seeded.orderIds) {
      const order = await orderRepo.findOneBy({ _id: new ObjectId(orderId) })
      expect(order!.status).toBe(OrderStatus.DELIVERED)
      expect(order!.deliveryConfirmationEventId).toBe(eventId)
      expect(order!.deliveryMethod).toBe('QR')
    }

    const audits = await harness.dataSource
      .getMongoRepository(DeliveryQrConfirmAuditEvent)
      .find()
    expect(audits).toHaveLength(1)
    expect(audits[0].confirmationEventId).toBe(eventId)
    expect(routePublishSpy).toHaveBeenCalledTimes(1)
    expect(orderPublishSpy).toHaveBeenCalledTimes(seeded.orderIds.length)
  })

  it('crash-recovery: PROCESSING after partial order delivery is resumable without double stock', async () => {
    const seeded = await seedInProgressRoute({ multiOrder: true })
    expect(seeded.orderIds.length).toBeGreaterThanOrEqual(2)

    const eventId = new ObjectId().toString()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    const stop = route!.stops.find(s => s.stopId === seeded.stopId)!
    stop.confirmationProcess = {
      state: StopConfirmationProcessState.PROCESSING,
      confirmationEventId: eventId,
      claimedAt: new Date(),
      claimedByUserId: seeded.courierUserId,
      lastUpdatedAt: new Date(),
    }
    await repo.save(route!)

    const orderRepo = harness.dataSource.getMongoRepository(Order)
    const firstOrder = await orderRepo.findOneBy({
      _id: new ObjectId(seeded.orderIds[0]),
    })
    firstOrder!.status = OrderStatus.DELIVERED
    firstOrder!.stockDecrementedAt = new Date()
    firstOrder!.deliveredAt = new Date()
    firstOrder!.deliveredByUserId = seeded.courierUserId
    firstOrder!.deliveryMethod = 'QR'
    firstOrder!.deliveryConfirmationEventId = eventId
    await orderRepo.save(firstOrder!)

    // Simulate stock already decremented for the first order only.
    const vaccineId = firstOrder!.orderLines[0].vaccineId.toString()
    const stockRepo = harness.dataSource.getMongoRepository(StockAdjustment)
    await stockRepo.save(
      stockRepo.create({
        vaccineObjectId: new ObjectId(vaccineId),
        type: StockAdjustmentType.DELIVERY_DEDUCTION,
        quantityDelta: -firstOrder!.orderLines[0].quantity,
        quantityBefore: 100,
        quantityAfter: 100 - firstOrder!.orderLines[0].quantity,
        reason: `Delivery decrement for order ${seeded.orderIds[0]}`,
        performedByUserId: seeded.courierUserId,
        relatedOrderId: seeded.orderIds[0],
        idempotencyKey: buildDeliveryDecrementIdempotencyKey(
          seeded.orderIds[0],
          vaccineId,
        ),
      }),
    )

    const beforeAdjustments = await stockRepo.find({
      where: { relatedOrderId: seeded.orderIds[0] },
    })
    const beforeCount = beforeAdjustments.length

    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(response.status).toBe(200)

    for (const orderId of seeded.orderIds) {
      const order = await orderRepo.findOneBy({ _id: new ObjectId(orderId) })
      expect(order!.status).toBe(OrderStatus.DELIVERED)
      expect(order!.deliveryConfirmationEventId).toBe(eventId)
    }

    const afterAdjustments = await stockRepo.find({
      where: { relatedOrderId: seeded.orderIds[0] },
    })
    expect(afterAdjustments.length).toBe(beforeCount)

    const afterRoute = await repo.findOneBy({
      _id: new ObjectId(seeded.routeId),
    })
    expect(afterRoute!.stops[0].deliveryProof!.confirmationEventId).toBe(eventId)
    expect(afterRoute!.stops[0].qrConfirmation!.consumedAt).toBeTruthy()
  })

  it('crash-recovery: unrelated pre-delivered order still fails integrity', async () => {
    const seeded = await seedInProgressRoute()
    const eventId = new ObjectId().toString()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    route!.stops[0].confirmationProcess = {
      state: StopConfirmationProcessState.PROCESSING,
      confirmationEventId: eventId,
      claimedAt: new Date(),
      claimedByUserId: seeded.courierUserId,
      lastUpdatedAt: new Date(),
    }
    await repo.save(route!)

    const orderRepo = harness.dataSource.getMongoRepository(Order)
    const order = await orderRepo.findOneBy({
      _id: new ObjectId(seeded.orderIds[0]),
    })
    order!.status = OrderStatus.DELIVERED
    order!.stockDecrementedAt = new Date()
    order!.deliveryMethod = 'ADMIN'
    order!.deliveryConfirmationEventId = null
    await orderRepo.save(order!)

    const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(responseErrorCode(response)).toBe('DELIVERY_QR_ORDER_INTEGRITY_ERROR')

    const after = await repo.findOneBy({ _id: new ObjectId(seeded.routeId) })
    expect(after!.stops[0].deliveryProof ?? null).toBeNull()
    expect(after!.stops[0].qrConfirmation!.consumedAt ?? null).toBeNull()
  })

  it('32–34. out-of-sequence multi-stop confirm and progress', async () => {
    const seeded = await seedInProgressRoute({ multiStop: true })
    expect(seeded.secondEncodedToken).toBeTruthy()

    // Confirm second stop first (out of sequence).
    const second = await confirm(
      seeded.secondEncodedToken,
      E2E_TOKENS.bezorger1,
    )
    expect(second.status).toBe(200)
    expect(confirmBody(second).remainingStopCount).toBe(1)
    expect(confirmBody(second).routeStatus).toBe(RouteStatus.IN_PROGRESS)

    const first = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(first.status).toBe(200)
    expect(confirmBody(first).remainingStopCount).toBe(0)
    expect(confirmBody(first).routeStatus).toBe(RouteStatus.IN_PROGRESS)
  })

  it('35. route completion succeeds only after QR confirmation (Phase 36D)', async () => {
    const seeded = await seedInProgressRoute()
    const blocked = await graphqlRequest(app, {
      query: UPDATE_ROUTE_STATUS,
      token: E2E_TOKENS.bezorger1,
      variables: {
        id: seeded.routeId,
        status: RouteStatus.COMPLETED,
      },
    })
    expect(blocked.errors).toBeDefined()

    const confirmed = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(confirmed.status).toBe(200)
    expect(confirmBody(confirmed).routeStatus).toBe(RouteStatus.IN_PROGRESS)

    const completed = await graphqlRequest<{
      updateRouteStatus: { id: string; status: RouteStatus }
    }>(app, {
      query: UPDATE_ROUTE_STATUS,
      token: E2E_TOKENS.bezorger1,
      variables: {
        id: seeded.routeId,
        status: RouteStatus.COMPLETED,
      },
    })
    expect(completed.errors).toBeUndefined()
    expect(completed.data!.updateRouteStatus.status).toBe(RouteStatus.COMPLETED)
  })

  it('36–37. strict confirmation throttle applies with stable 429', async () => {
    const seeded = await seedInProgressRoute()
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation()

    let limited: request.Response | undefined
    for (let i = 0; i < 20; i += 1) {
      const response = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
      if (response.status === 429) {
        limited = response
        break
      }
    }

    expect(limited).toBeDefined()
    expect(limited!.status).toBe(429)
    expect(responseErrorCode(limited!)).toBe(RATE_LIMITED_ERROR_CODE)
    assertNoSecretsInPayload(limited!, seeded.encodedToken)
    warnSpy.mockRestore()
  })

  it('39. existing preview still works before confirm and rejects after', async () => {
    const seeded = await seedInProgressRoute()
    const before = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(before.status).toBe(200)

    const confirmed = await confirm(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect(confirmed.status).toBe(200)

    const after = await preview(seeded.encodedToken, E2E_TOKENS.bezorger1)
    expect([
      'DELIVERY_QR_CONSUMED',
      'DELIVERY_QR_STOP_ALREADY_DELIVERED',
      'DELIVERY_QR_TOKEN_INVALID',
    ]).toContain(responseErrorCode(after))
  })
})

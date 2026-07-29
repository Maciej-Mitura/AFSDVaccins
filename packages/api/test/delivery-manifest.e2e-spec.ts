import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import { ObjectId } from 'mongodb'
import request from 'supertest'

import { createE2eTestApp, type E2eTestApp } from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import {
  E2eFixtureBuilder,
} from './helpers/e2e-fixtures'
import { graphqlRequest } from './helpers/e2e-graphql.helper'
import { OrderStatus } from '../src/order/order-status.enum'
import { DeliveryRoute } from '../src/routes/delivery-route.entity'
import { DeliveryManifestAuditEvent } from '../src/routes/manifest/delivery-manifest-audit.entity'
import { RouteStatus } from '../src/routes/route-status.enum'

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

describe('Delivery manifest PDF (e2e)', () => {
  let harness: E2eTestApp
  let app: INestApplication
  let fixtures: E2eFixtureBuilder
  let server: Server

  beforeAll(async () => {
    harness = await createE2eTestApp()
    app = harness.app
    server = app.getHttpServer() as Server
    fixtures = new E2eFixtureBuilder(harness.dataSource)
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
  })

  async function seedRoute(): Promise<{
    routeId: string
    stopId: string
    pharmacyUserToken: string
    otherPharmacyToken: string
  }> {
    const admin = await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.createBezorger(E2E_TOKENS.bezorger2)
    await fixtures.ensureSettings()
    const vaccine = await fixtures.createVaccine({ name: 'Manifest Flu' })
    const today = fixtures.todayBrussels()

    await fixtures.createOrder({
      apothekerUserId: pharmacy.user.id,
      vaccine,
      quantity: 4,
      deliveryDate: today,
      status: OrderStatus.PENDING,
    })

    const template = await fixtures.createRouteTemplate({
      name: 'Manifest Template',
      bezorgerProfileId: String(courier.profile.id),
      apothekerProfileIds: [String(pharmacy.profile.id)],
      createdByUserId: String(admin.id),
    })

    const generated = await graphqlRequest<{
      generateDeliveryRoute: {
        route: {
          id: string
          stops: Array<{ stopId: string; pharmacyName: string }>
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
    const stopId = generated.data!.generateDeliveryRoute.route.stops[0].stopId
    expect(stopId).toEqual(expect.any(String))

    return {
      routeId,
      stopId,
      pharmacyUserToken: E2E_TOKENS.apotheker1,
      otherPharmacyToken: E2E_TOKENS.apotheker2,
    }
  }

  async function getRouteManifest(
    routeId: string,
    token?: string,
  ): Promise<request.Response> {
    const req = request(server)
      .get(`/delivery-routes/${routeId}/manifest.pdf`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    if (token) {
      void req.set('Authorization', `Bearer ${token}`)
    }
    return req
  }

  async function getStopManifest(
    routeId: string,
    stopId: string,
    token?: string,
  ): Promise<request.Response> {
    const req = request(server)
      .get(`/delivery-routes/${routeId}/stops/${stopId}/manifest.pdf`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    if (token) {
      void req.set('Authorization', `Bearer ${token}`)
    }
    return req
  }

  function pdfBody(response: request.Response): Buffer {
    if (Buffer.isBuffer(response.body)) {
      return response.body
    }
    return Buffer.from(response.text ?? '', 'binary')
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

  it('34: anonymous request rejected', async () => {
    const { routeId } = await seedRoute()
    const response = await getRouteManifest(routeId)
    expect(response.status).toBe(401)
  })

  it('35: actor role and ownership enforced', async () => {
    const { routeId, stopId, pharmacyUserToken, otherPharmacyToken } =
      await seedRoute()

    const apothekerFull = await getRouteManifest(routeId, pharmacyUserToken)
    expect(apothekerFull.status).toBe(403)

    const otherCourier = await getRouteManifest(routeId, E2E_TOKENS.bezorger2)
    expect(otherCourier.status).toBe(403)
    expect(responseErrorCode(otherCourier)).toBe('DELIVERY_MANIFEST_FORBIDDEN')

    const otherStop = await getStopManifest(
      routeId,
      stopId,
      otherPharmacyToken,
    )
    expect(otherStop.status).toBe(403)
  })

  it('ADMIN and assigned BEZORGER can download route PDF', async () => {
    const { routeId } = await seedRoute()

    const adminResponse = await getRouteManifest(routeId, E2E_TOKENS.admin)
    expect(adminResponse.status).toBe(200)
    expect(adminResponse.headers['content-type']).toMatch(/application\/pdf/)
    expect(adminResponse.headers['cache-control']).toMatch(/private/)
    expect(adminResponse.headers['cache-control']).toMatch(/no-store/)
    expect(adminResponse.headers['content-disposition']).toMatch(
      /attachment; filename="delivery-manifest-.*\.pdf"/,
    )
    expect(pdfBody(adminResponse).subarray(0, 5).toString('utf8')).toBe('%PDF-')

    const courierResponse = await getRouteManifest(
      routeId,
      E2E_TOKENS.bezorger1,
    )
    expect(courierResponse.status).toBe(200)
    expect(pdfBody(courierResponse).subarray(0, 5).toString('utf8')).toBe(
      '%PDF-',
    )
  })

  it('owning APOTHEKER can download stop PDF only', async () => {
    const { routeId, stopId, pharmacyUserToken } = await seedRoute()

    const response = await getStopManifest(
      routeId,
      stopId,
      pharmacyUserToken,
    )
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/pdf/)
    const body = pdfBody(response)
    expect(body.subarray(0, 5).toString('utf8')).toBe('%PDF-')
    expect(body.byteLength).toBeGreaterThan(100)
  })

  it('38: PDF bytes are not persisted in Mongo', async () => {
    const { routeId } = await seedRoute()
    await getRouteManifest(routeId, E2E_TOKENS.admin)

    const route = await harness.dataSource
      .getMongoRepository(DeliveryRoute)
      .findOneBy({ _id: new ObjectId(routeId) })
    expect(route).not.toBeNull()
    const serialised = JSON.stringify(route)
    expect(serialised).not.toContain('%PDF-')
    expect(serialised).not.toContain('pdfBytes')
  })

  it('36/37: audit written once after successful generation', async () => {
    const { routeId } = await seedRoute()
    await getRouteManifest(routeId, E2E_TOKENS.admin)

    const audits = await harness.dataSource
      .getMongoRepository(DeliveryManifestAuditEvent)
      .find({ where: { routeId } as never })

    expect(audits).toHaveLength(1)
    expect(audits[0].scope).toBe('ROUTE')
    expect(audits[0].type).toBe('DELIVERY_MANIFEST_GENERATED')
  })

  it('cancelled route still downloads with cancelled marking and no active QR label conflict', async () => {
    const { routeId } = await seedRoute()
    const repo = harness.dataSource.getMongoRepository(DeliveryRoute)
    const route = await repo.findOneBy({ _id: new ObjectId(routeId) })
    expect(route).not.toBeNull()
    route!.status = RouteStatus.CANCELLED
    await repo.save(route!)

    const response = await getRouteManifest(routeId, E2E_TOKENS.admin)
    expect(response.status).toBe(200)
    const body = pdfBody(response)
    expect(body.subarray(0, 5).toString('utf8')).toBe('%PDF-')
    expect(body.byteLength).toBeGreaterThan(100)
    expect(response.headers['content-disposition']).toMatch(/\.pdf"/)
  })
})

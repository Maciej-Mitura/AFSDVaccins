import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import request from 'supertest'

import { createE2eTestApp, type E2eTestApp } from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import {
  createSvgBytes,
  createTestPng,
} from '../src/vaccine/image/__tests__/test-image.fixtures'

type UploadResponseBody = {
  vaccineId: string
  image: {
    originalFilename: string
    mimeType: string
    width: number
    height: number
    validationStatus: string
  }
}

type DeleteResponseBody = {
  vaccineId: string
  deleted: boolean
}

type OverrideResponseBody = {
  vaccineId: string
  image: {
    validationStatus: string
  }
}

describe('Vaccine image lifecycle (e2e)', () => {
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

  it('rejects unauthenticated upload', async () => {
    const vaccine = await fixtures.createVaccine({ name: 'Flu E2E' })
    const vaccineId = String(vaccine.id)
    const png = createTestPng(200, 200)

    await request(server)
      .post(`/vaccines/${vaccineId}/image`)
      .attach('image', png, 'vial.png')
      .expect(401)
  })

  it('rejects non-ADMIN upload', async () => {
    await fixtures.createApotheker()
    const vaccine = await fixtures.createVaccine({ name: 'Flu E2E' })
    const vaccineId = String(vaccine.id)
    const png = createTestPng(200, 200)

    await request(server)
      .post(`/vaccines/${vaccineId}/image`)
      .set('Authorization', `Bearer ${E2E_TOKENS.apotheker1}`)
      .attach('image', png, 'vial.png')
      .expect(403)
  })

  it('allows ADMIN upload and keeps storageKey out of the response', async () => {
    await fixtures.createAdmin()
    const vaccine = await fixtures.createVaccine({ name: 'Flu E2E' })
    const vaccineId = String(vaccine.id)
    const png = createTestPng(200, 200)

    const response = await request(server)
      .post(`/vaccines/${vaccineId}/image`)
      .set('Authorization', `Bearer ${E2E_TOKENS.admin}`)
      .attach('image', png, 'vial.png')
      .expect(200)

    const body = response.body as UploadResponseBody
    expect(body.vaccineId).toBe(vaccineId)
    expect(body.image.originalFilename).toBe('vial.png')
    expect(body.image.mimeType).toBe('image/png')
    expect(body.image.width).toBe(200)
    expect(body.image.height).toBe(200)
    expect(body.image.validationStatus).toBeDefined()
    expect(JSON.stringify(body)).not.toContain('storageKey')
    expect(JSON.stringify(body)).not.toMatch(/AccountKey|SAS/i)
  })

  it('rejects SVG uploads for ADMIN', async () => {
    await fixtures.createAdmin()
    const vaccine = await fixtures.createVaccine({ name: 'Flu E2E' })
    const vaccineId = String(vaccine.id)

    await request(server)
      .post(`/vaccines/${vaccineId}/image`)
      .set('Authorization', `Bearer ${E2E_TOKENS.admin}`)
      .attach('image', createSvgBytes(), 'image.svg')
      .expect(400)
  })

  it('delete is idempotent and override requires ADMIN + reason', async () => {
    await fixtures.createAdmin()
    await fixtures.createApotheker()
    const vaccine = await fixtures.createVaccine({ name: 'Flu E2E' })
    const vaccineId = String(vaccine.id)

    await request(server)
      .delete(`/vaccines/${vaccineId}/image`)
      .set('Authorization', `Bearer ${E2E_TOKENS.admin}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as DeleteResponseBody
        expect(body).toEqual({ vaccineId, deleted: false })
      })

    const png = createTestPng(200, 200)
    await request(server)
      .post(`/vaccines/${vaccineId}/image`)
      .set('Authorization', `Bearer ${E2E_TOKENS.admin}`)
      .attach('image', png, 'vial.png')
      .expect(200)

    await request(server)
      .post(`/vaccines/${vaccineId}/image/override`)
      .set('Authorization', `Bearer ${E2E_TOKENS.apotheker1}`)
      .send({ decision: 'ACCEPTED', reason: 'Looks good' })
      .expect(403)

    await request(server)
      .post(`/vaccines/${vaccineId}/image/override`)
      .set('Authorization', `Bearer ${E2E_TOKENS.admin}`)
      .send({ decision: 'ACCEPTED', reason: '   ' })
      .expect(400)

    const overridden = await request(server)
      .post(`/vaccines/${vaccineId}/image/override`)
      .set('Authorization', `Bearer ${E2E_TOKENS.admin}`)
      .send({ decision: 'ACCEPTED', reason: 'Admin reviewed packaging' })
      .expect(200)

    const overrideBody = overridden.body as OverrideResponseBody
    expect(overrideBody.image.validationStatus).toBe('ACCEPTED')
    expect(JSON.stringify(overrideBody)).not.toContain('storageKey')

    await request(server)
      .delete(`/vaccines/${vaccineId}/image`)
      .set('Authorization', `Bearer ${E2E_TOKENS.admin}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as DeleteResponseBody
        expect(body.deleted).toBe(true)
      })
  })
})

import http from 'node:http'
import type { AddressInfo } from 'node:net'
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
import { RATE_LIMITED_ERROR_CODE } from '../src/common/throttling/throttling.constants'
import {
  GRAPHQL_COMPLEXITY_EXCEEDED_CODE,
  GRAPHQL_DEPTH_EXCEEDED_CODE,
} from '../src/common/graphql/query-protection'

async function ensureServerListening(server: Server): Promise<number> {
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
  }
  const address = server.address() as AddressInfo | null
  if (!address || typeof address.port !== 'number') {
    throw new Error('E2E HTTP server has no bound port')
  }
  return address.port
}

/**
 * POST /graphql with Transfer-Encoding: chunked and no Content-Length.
 * Proves the Express parser limit (not an early Content-Length gate) is authoritative.
 */
async function postGraphqlChunked(
  server: Server,
  body: string,
): Promise<{ status: number; text: string }> {
  const port = await ensureServerListening(server)

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Transfer-Encoding': 'chunked',
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    const mid = Math.max(1, Math.floor(body.length / 2))
    req.write(body.slice(0, mid))
    req.write(body.slice(mid))
    req.end()
  })
}

/**
 * Note on env overrides: `@nestjs/config` ConfigModule.forRoot validates and
 * freezes env at AppModule import time (before Jest beforeAll). Low depth /
 * throttle overrides for this suite are therefore applied via unit tests and
 * the security-limits Jest project setup file when needed.
 *
 * This suite validates headers, body size (Express parser), cache behaviour,
 * and a complexity burst that exceeds the default GRAPHQL_MAX_COMPLEXITY=500.
 */
describe('GraphQL E2E — Phase 22 security foundation', () => {
  let harness: E2eTestApp
  let fixtures: E2eFixtureBuilder

  beforeAll(async () => {
    harness = await createE2eTestApp()
    fixtures = new E2eFixtureBuilder(harness.dataSource)
  })

  afterAll(async () => {
    await harness?.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
    await fixtures.createAdmin()
    await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    await fixtures.ensureSettings()
  })

  it('keeps GET /health available and includes security headers', async () => {
    const server = harness.app.getHttpServer() as Server
    const response = await request(server).get('/health')

    expect(response.status).toBe(200)
    const body = response.body as { status?: string }
    expect(body.status).toBeDefined()
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('accepts a small normal GraphQL JSON request', async () => {
    const result = await graphqlRequest(harness.app, {
      query: `query { health { status service } }`,
    })
    expect(result.errors).toBeUndefined()
    expect(result.data).toBeTruthy()
  })

  it('accepts JSON larger than the old Express 100kb default but under 1mb', async () => {
    const server = harness.app.getHttpServer() as Server
    // ~150kb pad — above Express default 100kb, below API_JSON_BODY_LIMIT=1mb
    const pad = 'x'.repeat(150 * 1024)
    const response = await request(server)
      .post('/graphql')
      .set('Content-Type', 'application/json')
      .send(`{"query":"{ health { status } }","pad":"${pad}"}`)

    expect(response.status).toBe(200)
    const payload = response.body as {
      data?: { health?: { status?: string } }
      errors?: unknown
    }
    expect(payload.errors).toBeUndefined()
    expect(typeof payload.data?.health?.status).toBe('string')
  })

  it('rejects bodies above API_JSON_BODY_LIMIT with Content-Length via HTTP 413', async () => {
    const server = harness.app.getHttpServer() as Server
    const huge = 'x'.repeat(1.5 * 1024 * 1024)
    const response = await request(server)
      .post('/graphql')
      .set('Content-Type', 'application/json')
      .send(`{"query":"{ health { status } }","pad":"${huge}"}`)

    expect(response.status).toBe(413)
    expect(JSON.stringify(response.body)).not.toMatch(/at |Error:|stack/i)
    expect(response.body).toMatchObject({
      statusCode: 413,
      message: 'Request entity too large',
    })
  })

  it('rejects oversized chunked bodies without Content-Length via HTTP 413', async () => {
    const server = harness.app.getHttpServer() as Server
    const huge = 'x'.repeat(1.5 * 1024 * 1024)
    const body = `{"query":"{ health { status } }","pad":"${huge}"}`
    const response = await postGraphqlChunked(server, body)

    expect(response.status).toBe(413)
    expect(response.text).not.toMatch(/at |\.ts:|node_modules/i)
    expect(response.text).toMatch(/too large|entity/i)
  })

  it('rejects malformed JSON with a safe HTTP 400', async () => {
    const server = harness.app.getHttpServer() as Server
    const response = await request(server)
      .post('/graphql')
      .set('Content-Type', 'application/json')
      .send('{"query":')

    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).not.toMatch(
      /SyntaxError|stack|node_modules/i,
    )
    expect(response.body).toMatchObject({
      statusCode: 400,
      message: 'Malformed JSON',
    })
  })

  it('rejects excessive complexity with a stable code', async () => {
    // With default max 500 (main suite) or 40 (security-limits suite),
    // 120 aliases × 5 fields exceeds both.
    const fields = Array.from(
      { length: 120 },
      (_, i) => `a${i}: health { status service timestamp environment }`,
    ).join('\n')
    const result = await graphqlRequest(harness.app, {
      query: `query Abuse { ${fields} }`,
    })

    expect(firstErrorCode(result.errors)).toBe(GRAPHQL_COMPLEXITY_EXCEEDED_CODE)
    expect(firstErrorMessage(result.errors)).toMatch(/complexity/i)
  })

  it('rejects excessive GraphQL depth when security limits are active', async () => {
    if (process.env.PHASE22_SECURITY_LIMITS !== 'true') {
      return
    }

    const result = await graphqlRequest(harness.app, {
      query: `
        query TooDeep {
          deliveryRoutes {
            stops {
              address {
                street
              }
            }
          }
        }
      `,
      token: E2E_TOKENS.admin,
    })

    expect(firstErrorMessage(result.errors)).toMatch(
      /maximum depth|exceeds maximum depth/i,
    )
    const code = firstErrorCode(result.errors)
    expect(
      code === GRAPHQL_DEPTH_EXCEEDED_CODE ||
        code === 'GRAPHQL_VALIDATION_FAILED',
    ).toBe(true)
  })

  it('invalidates settings cache after update (GraphQL variables still work)', async () => {
    const read = `
      query {
        applicationSettings {
          orderingClosingTime
          weeklyDoseCap
        }
      }
    `
    const update = `
      mutation($input: UpdateApplicationSettingsInput!) {
        updateApplicationSettings(input: $input) {
          orderingClosingTime
          weeklyDoseCap
        }
      }
    `

    const before = await graphqlRequest<{
      applicationSettings: { weeklyDoseCap: number }
    }>(harness.app, {
      query: read,
      token: E2E_TOKENS.admin,
    })

    const nextCap = (before.data?.applicationSettings.weeklyDoseCap ?? 200) + 1

    const mutated = await graphqlRequest(harness.app, {
      query: update,
      token: E2E_TOKENS.admin,
      variables: { input: { weeklyDoseCap: nextCap } },
    })
    expect(mutated.errors).toBeUndefined()

    const after = await graphqlRequest<{
      applicationSettings: { weeklyDoseCap: number }
    }>(harness.app, {
      query: read,
      token: E2E_TOKENS.admin,
    })

    expect(after.data?.applicationSettings.weeklyDoseCap).toBe(nextCap)
  })

  it('does not leak inactive vaccines to apotheker via shared cache', async () => {
    await fixtures.createVaccine({ name: 'Visible Flu', active: true })
    await fixtures.createVaccine({ name: 'Hidden Flu', active: false })

    const list = `
      query($includeInactive: Boolean!) {
        vaccines(includeInactive: $includeInactive) {
          name
          active
        }
      }
    `

    await graphqlRequest(harness.app, {
      query: list,
      token: E2E_TOKENS.admin,
      variables: { includeInactive: true },
    })

    const apothekerView = await graphqlRequest<{
      vaccines: Array<{ name: string; active: boolean }>
    }>(harness.app, {
      query: list,
      token: E2E_TOKENS.apotheker1,
      variables: { includeInactive: true },
    })

    expect(apothekerView.errors).toBeUndefined()
    expect(
      apothekerView.data?.vaccines.every((vaccine) => vaccine.active),
    ).toBe(true)
    expect(
      apothekerView.data?.vaccines.some(
        (vaccine) => vaccine.name === 'Hidden Flu',
      ),
    ).toBe(false)
  })
})

describe('GraphQL E2E — Phase 22 rate limiting (security-limits setup)', () => {
  /**
   * This describe is skipped unless THROTTLE_DEFAULT_LIMIT was set before
   * AppModule import (see test/e2e-setup-security-limits.cjs + jest-e2e-security.json).
   */
  const securityLimitsActive =
    process.env.PHASE22_SECURITY_LIMITS === 'true' &&
    Number(process.env.THROTTLE_DEFAULT_LIMIT) <= 10

  let harness: E2eTestApp

  beforeAll(async () => {
    if (!securityLimitsActive) {
      return
    }
    harness = await createE2eTestApp()
  })

  afterAll(async () => {
    await harness?.close()
  })

  const maybeIt = securityLimitsActive ? it : it.skip

  maybeIt('rate-limits burst GraphQL requests with RATE_LIMITED', async () => {
    const query = `query { health { status } }`
    let limited: Awaited<ReturnType<typeof graphqlRequest>> | undefined

    for (let i = 0; i < 20; i += 1) {
      const response = await graphqlRequest(harness.app, { query })
      if (firstErrorCode(response.errors) === RATE_LIMITED_ERROR_CODE) {
        limited = response
        break
      }
    }

    expect(limited).toBeDefined()
    expect(firstErrorCode(limited?.errors)).toBe(RATE_LIMITED_ERROR_CODE)
    expect(firstErrorMessage(limited?.errors)).toMatch(/too many requests/i)
    expect(limited?.errors?.[0]?.extensions?.retryAfterSeconds).toBeDefined()
    expect(JSON.stringify(limited?.body)).not.toMatch(/app:|fb:|ip:/)
  })

  maybeIt('still allows GET /health after GraphQL throttling', async () => {
    const server = harness.app.getHttpServer() as Server
    for (let i = 0; i < 15; i += 1) {
      await graphqlRequest(harness.app, {
        query: `query { health { status } }`,
      })
    }

    const health = await request(server).get('/health')
    expect(health.status).toBe(200)
  })
})

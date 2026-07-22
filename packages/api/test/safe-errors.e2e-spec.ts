import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { E2E_TOKENS, E2E_IDENTITIES } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import {
  firstErrorMessage,
  graphqlRequest,
} from './helpers/e2e-graphql.helper'
import { OrderStatus } from '../src/order/order-status.enum'
import { User } from '../src/user/user.entity'

const MY_ORDER = `
  query MyOrder($id: ID!) {
    myOrder(id: $id) { id }
  }
`

const CREATE_VACCINE = `
  mutation CreateVaccine($input: CreateVaccineInput!) {
    createVaccine(input: $input) { id }
  }
`

const UPDATE_STATUS = `
  mutation UpdateStatus($id: ID!, $status: OrderStatus!) {
    updateOrderStatus(id: $id, status: $status) { id status }
  }
`

const ADMIN_AREA = `query { adminArea }`
const CURRENT_USER = `query { currentUser { id } }`

function assertSafeErrorPayload(body: unknown): void {
  const serialized = JSON.stringify(body)
  expect(serialized).not.toMatch(/MongoServerError|E11000|mongodb:\/\//i)
  expect(serialized).not.toMatch(/firebase-service-account|GOOGLE_APPLICATION/i)
  expect(serialized).not.toMatch(/\\\\Users\\\\|C:\\\\/i)
  expect(serialized).not.toMatch(/ObjectId\(/i)
}

describe('GraphQL E2E — safe GraphQL errors', () => {
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

  it('returns safe errors for malformed ID, missing entity, forbidden, unauth, duplicate, invalid transition', async () => {
    const unauth = await graphqlRequest(harness.app, {
      query: CURRENT_USER,
    })
    expect(firstErrorMessage(unauth.errors)).toMatch(/Unauthorized/i)
    assertSafeErrorPayload(unauth.body)

    const forbidden = await graphqlRequest(harness.app, {
      query: ADMIN_AREA,
      token: E2E_TOKENS.apotheker1,
    })
    expect(firstErrorMessage(forbidden.errors)).toMatch(/Forbidden|toegang/i)
    assertSafeErrorPayload(forbidden.body)

    const malformed = await graphqlRequest(harness.app, {
      query: MY_ORDER,
      token: E2E_TOKENS.apotheker1,
      variables: { id: 'not-an-object-id' },
    })
    expect(firstErrorMessage(malformed.errors)).toBeTruthy()
    assertSafeErrorPayload(malformed.body)

    const missing = await graphqlRequest(harness.app, {
      query: MY_ORDER,
      token: E2E_TOKENS.apotheker1,
      variables: { id: '507f1f77bcf86cd799439011' },
    })
    expect(firstErrorMessage(missing.errors)).toBeTruthy()
    assertSafeErrorPayload(missing.body)

    await fixtures.createVaccine({ name: 'Dup Safe' })
    const duplicate = await graphqlRequest(harness.app, {
      query: CREATE_VACCINE,
      token: E2E_TOKENS.admin,
      variables: {
        input: { name: 'Dup Safe', manufacturer: 'X' },
      },
    })
    expect(firstErrorMessage(duplicate.errors)).toMatch(/already exists/i)
    assertSafeErrorPayload(duplicate.body)

    const vaccine = await fixtures.createVaccine({ name: 'Transition Flu' })
    const apotheker = await harness.dataSource.getMongoRepository(User).findOne({
      where: { firebaseUid: E2E_IDENTITIES[E2E_TOKENS.apotheker1].uid },
    })

    const order = await fixtures.createOrder({
      apothekerUserId: apotheker!._id.toString(),
      vaccine,
      quantity: 1,
      deliveryDate: fixtures.todayBrussels(),
      status: OrderStatus.CANCELLED,
    })

    const invalidTransition = await graphqlRequest(harness.app, {
      query: UPDATE_STATUS,
      token: E2E_TOKENS.admin,
      variables: { id: order.id, status: 'PLANNED' },
    })
    expect(firstErrorMessage(invalidTransition.errors)).toBeTruthy()
    assertSafeErrorPayload(invalidTransition.body)
  })
})

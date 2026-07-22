import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import {
  firstErrorMessage,
  graphqlRequest,
} from './helpers/e2e-graphql.helper'

const CURRENT_USER = `
  query CurrentUser {
    currentUser {
      id
      email
      role
      firstName
      lastName
    }
  }
`

const CURRENT_FIREBASE_USER = `
  query CurrentFirebaseUser {
    currentFirebaseUser {
      uid
      email
    }
  }
`

const CREATE_OWN_USER = `
  mutation CreateOwnUser($input: CreateOwnUserInput!) {
    createOwnUser(input: $input) {
      id
      email
      role
    }
  }
`

describe('GraphQL E2E — authentication and users', () => {
  let harness: E2eTestApp
  let fixtures: E2eFixtureBuilder

  beforeAll(async () => {
    harness = await createE2eTestApp()
    fixtures = new E2eFixtureBuilder(harness.dataSource)
  })

  afterAll(async () => {
    await harness.close()
  })

  beforeEach(async () => {
    await harness.resetDatabase()
  })

  it('rejects unauthenticated protected queries', async () => {
    const response = await graphqlRequest(harness.app, {
      query: CURRENT_USER,
    })

    expect(response.httpStatus).toBe(200)
    expect(response.data?.['currentUser' as never]).toBeFalsy()
    expect(firstErrorMessage(response.errors)).toMatch(/Unauthorized/i)
  })

  it('rejects malformed tokens safely', async () => {
    const response = await graphqlRequest(harness.app, {
      query: CURRENT_FIREBASE_USER,
      token: 'not-a-valid-e2e-token',
    })

    expect(response.httpStatus).toBe(200)
    expect(firstErrorMessage(response.errors)).toMatch(/Unauthorized/i)
    expect(JSON.stringify(response.body)).not.toMatch(/firebase-service-account|GOOGLE_APPLICATION|stack/i)
  })

  it('returns USER_NOT_REGISTERED semantics for Firebase identity without Mongo user', async () => {
    const firebase = await graphqlRequest<{
      currentFirebaseUser: { uid: string; email: string }
    }>(harness.app, {
      query: CURRENT_FIREBASE_USER,
      token: E2E_TOKENS.unregistered,
    })

    expect(firebase.errors).toBeUndefined()
    expect(firebase.data?.currentFirebaseUser.uid).toBe(
      'e2e-firebase-unregistered',
    )

    const current = await graphqlRequest(harness.app, {
      query: CURRENT_USER,
      token: E2E_TOKENS.unregistered,
    })

    expect(firstErrorMessage(current.errors)).toMatch(/not registered/i)
  })

  it('resolves currentUser for APOTHEKER, BEZORGER, and ADMIN', async () => {
    await fixtures.createAdmin()
    await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    await fixtures.createBezorger(E2E_TOKENS.bezorger1)

    for (const [token, role] of [
      [E2E_TOKENS.admin, 'ADMIN'],
      [E2E_TOKENS.apotheker1, 'APOTHEKER'],
      [E2E_TOKENS.bezorger1, 'BEZORGER'],
    ] as const) {
      const response = await graphqlRequest<{
        currentUser: { role: string; email: string }
      }>(harness.app, {
        query: CURRENT_USER,
        token,
      })

      expect(response.errors).toBeUndefined()
      expect(response.data?.currentUser.role).toBe(role)
    }
  })

  it('rejects ADMIN self-registration at the GraphQL validation layer', async () => {
    const response = await graphqlRequest(harness.app, {
      query: CREATE_OWN_USER,
      token: E2E_TOKENS.unregistered,
      variables: {
        input: {
          firstName: 'Nope',
          lastName: 'Admin',
          role: 'ADMIN',
        },
      },
    })

    expect(response.data?.['createOwnUser' as never]).toBeFalsy()
    expect(response.errors?.length).toBeGreaterThan(0)
    expect(JSON.stringify(response.errors)).toMatch(/SelfRegistrationRole|ADMIN|enum|value/i)
  })

  it('allows APOTHEKER and BEZORGER self-registration', async () => {
    const apotheker = await graphqlRequest<{
      createOwnUser: { role: string; email: string }
    }>(harness.app, {
      query: CREATE_OWN_USER,
      token: E2E_TOKENS.apotheker1,
      variables: {
        input: {
          firstName: 'Anna',
          lastName: 'Apotheker',
          role: 'APOTHEKER',
        },
      },
    })

    expect(apotheker.errors).toBeUndefined()
    expect(apotheker.data?.createOwnUser.role).toBe('APOTHEKER')

    const bezorger = await graphqlRequest<{
      createOwnUser: { role: string }
    }>(harness.app, {
      query: CREATE_OWN_USER,
      token: E2E_TOKENS.bezorger1,
      variables: {
        input: {
          firstName: 'Ben',
          lastName: 'Bezorger',
          role: 'BEZORGER',
        },
      },
    })

    expect(bezorger.errors).toBeUndefined()
    expect(bezorger.data?.createOwnUser.role).toBe('BEZORGER')
  })
})

import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { countCollection } from './helpers/e2e-collections'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import {
  firstErrorMessage,
  graphqlRequest,
} from './helpers/e2e-graphql.helper'
import { Notification } from '../src/notifications/notification.entity'

const CREATE_ORDER = `
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
    }
  }
`

const MY_NOTIFICATIONS = `
  query MyNotifications {
    myNotifications {
      id
      title
      read
      relatedOrderId
    }
  }
`

const MARK_READ = `
  mutation MarkRead($id: ID!) {
    markNotificationRead(id: $id) {
      id
      read
    }
  }
`

describe('GraphQL E2E — notifications', () => {
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
    await fixtures.createAdmin()
    await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    await fixtures.createApotheker(E2E_TOKENS.apotheker2)
    await fixtures.ensureSettings()
  })

  it('creates notifications on order placement, scopes to owner, and persists mark-as-read', async () => {
    const vaccine = await fixtures.createVaccine({ name: 'Notify Flu' })

    const created = await graphqlRequest<{
      createOrder: { id: string }
    }>(harness.app, {
      query: CREATE_ORDER,
      token: E2E_TOKENS.apotheker1,
      variables: {
        input: { lines: [{ vaccineId: vaccine.id, quantity: 1 }] },
      },
    })
    expect(created.errors).toBeUndefined()

    expect(await countCollection(harness.dataSource, Notification)).toBeGreaterThan(
      0,
    )

    const mine = await graphqlRequest<{
      myNotifications: Array<{ id: string; read: boolean; relatedOrderId?: string }>
    }>(harness.app, {
      query: MY_NOTIFICATIONS,
      token: E2E_TOKENS.apotheker1,
    })
    expect(mine.errors).toBeUndefined()
    expect(mine.data!.myNotifications.length).toBeGreaterThan(0)

    const other = await graphqlRequest<{
      myNotifications: Array<{ id: string }>
    }>(harness.app, {
      query: MY_NOTIFICATIONS,
      token: E2E_TOKENS.apotheker2,
    })
    expect(other.errors).toBeUndefined()
    expect(other.data?.myNotifications ?? []).toHaveLength(0)

    const notificationId = mine.data!.myNotifications[0].id
    const marked = await graphqlRequest<{
      markNotificationRead: { id: string; read: boolean }
    }>(harness.app, {
      query: MARK_READ,
      token: E2E_TOKENS.apotheker1,
      variables: { id: notificationId },
    })
    expect(marked.errors).toBeUndefined()
    expect(marked.data?.markNotificationRead.read).toBe(true)

    const denied = await graphqlRequest(harness.app, {
      query: MARK_READ,
      token: E2E_TOKENS.apotheker2,
      variables: { id: notificationId },
    })
    expect(firstErrorMessage(denied.errors)).toBeTruthy()
  })
})

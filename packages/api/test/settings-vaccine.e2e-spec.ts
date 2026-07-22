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
import { ApplicationSettings } from '../src/settings/settings.entity'

const SETTINGS_QUERY = `
  query Settings {
    applicationSettings {
      id
      orderingClosingTime
      weeklyDoseCap
      timezone
    }
  }
`

const UPDATE_SETTINGS = `
  mutation UpdateSettings($input: UpdateApplicationSettingsInput!) {
    updateApplicationSettings(input: $input) {
      orderingClosingTime
      weeklyDoseCap
    }
  }
`

const CREATE_VACCINE = `
  mutation CreateVaccine($input: CreateVaccineInput!) {
    createVaccine(input: $input) {
      id
      name
      active
      stockQuantity
    }
  }
`

const UPDATE_VACCINE = `
  mutation UpdateVaccine($id: ID!, $input: UpdateVaccineInput!) {
    updateVaccine(id: $id, input: $input) {
      id
      name
      active
    }
  }
`

const SET_ACTIVE = `
  mutation SetActive($id: ID!, $active: Boolean!) {
    setVaccineActive(id: $id, active: $active) {
      id
      active
    }
  }
`

const VACCINES = `
  query Vaccines($includeInactive: Boolean!) {
    vaccines(includeInactive: $includeInactive) {
      id
      name
      active
    }
  }
`

describe('GraphQL E2E — settings and vaccines', () => {
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
  })

  it('allows ADMIN to read and update settings; non-admin cannot update', async () => {
    const read = await graphqlRequest<{
      applicationSettings: { orderingClosingTime: string; timezone: string }
    }>(harness.app, {
      query: SETTINGS_QUERY,
      token: E2E_TOKENS.admin,
    })

    expect(read.errors).toBeUndefined()
    expect(read.data?.applicationSettings.timezone).toBe('Europe/Brussels')

    const update = await graphqlRequest<{
      updateApplicationSettings: { orderingClosingTime: string }
    }>(harness.app, {
      query: UPDATE_SETTINGS,
      token: E2E_TOKENS.admin,
      variables: { input: { orderingClosingTime: '15:30' } },
    })

    expect(update.errors).toBeUndefined()
    expect(update.data?.updateApplicationSettings.orderingClosingTime).toBe(
      '15:30',
    )

    const denied = await graphqlRequest(harness.app, {
      query: UPDATE_SETTINGS,
      token: E2E_TOKENS.apotheker1,
      variables: { input: { orderingClosingTime: '16:00' } },
    })
    expect(firstErrorMessage(denied.errors)).toMatch(/Forbidden/i)
  })

  it('keeps application settings as a singleton', async () => {
    await graphqlRequest(harness.app, {
      query: SETTINGS_QUERY,
      token: E2E_TOKENS.admin,
    })
    await graphqlRequest(harness.app, {
      query: SETTINGS_QUERY,
      token: E2E_TOKENS.admin,
    })

    expect(await countCollection(harness.dataSource, ApplicationSettings)).toBe(
      1,
    )
  })

  it('allows ADMIN to create vaccines and rejects duplicate normalized names safely', async () => {
    const created = await graphqlRequest<{
      createVaccine: { id: string; name: string; stockQuantity: number }
    }>(harness.app, {
      query: CREATE_VACCINE,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          name: 'Influenza',
          manufacturer: 'E2E Labs',
        },
      },
    })

    expect(created.errors).toBeUndefined()
    expect(created.data?.createVaccine.stockQuantity).toBe(0)

    const duplicate = await graphqlRequest(harness.app, {
      query: CREATE_VACCINE,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          name: ' influenza ',
          manufacturer: 'Other',
        },
      },
    })

    expect(duplicate.data?.['createVaccine' as never]).toBeFalsy()
    expect(JSON.stringify(duplicate.errors)).toMatch(
      /ALREADY_EXISTS|already exists|Conflict/i,
    )
  })

  it('hides inactive vaccines from apotheker catalogue by default', async () => {
    const created = await graphqlRequest<{
      createVaccine: { id: string }
    }>(harness.app, {
      query: CREATE_VACCINE,
      token: E2E_TOKENS.admin,
      variables: {
        input: { name: 'COVID E2E', manufacturer: 'E2E' },
      },
    })

    const id = created.data!.createVaccine.id

    await graphqlRequest(harness.app, {
      query: SET_ACTIVE,
      token: E2E_TOKENS.admin,
      variables: { id, active: false },
    })

    const list = await graphqlRequest<{
      vaccines: Array<{ id: string; active: boolean }>
    }>(harness.app, {
      query: VACCINES,
      token: E2E_TOKENS.apotheker1,
      variables: { includeInactive: false },
    })

    expect(list.errors).toBeUndefined()
    expect(list.data?.vaccines.some(v => v.id === id)).toBe(false)

    await graphqlRequest(harness.app, {
      query: UPDATE_VACCINE,
      token: E2E_TOKENS.admin,
      variables: { id, input: { name: 'COVID E2E Updated' } },
    })
  })
})

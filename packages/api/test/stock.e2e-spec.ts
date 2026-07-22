import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { countCollection } from './helpers/e2e-collections'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import {
  firstErrorCode,
  firstErrorMessage,
  graphqlRequest,
} from './helpers/e2e-graphql.helper'
import { StockAdjustment } from '../src/stock/stock-adjustment.entity'
import { Vaccine } from '../src/vaccine/vaccine.entity'

const ADJUST = `
  mutation Adjust($input: AdjustStockInput!) {
    adjustVaccineStock(input: $input) {
      id
      quantityBefore
      quantityAfter
      quantityDelta
      type
    }
  }
`

const VACCINE = `
  query Vaccine($id: ID!) {
    vaccine(id: $id) {
      id
      stockQuantity
    }
  }
`

describe('GraphQL E2E — stock', () => {
  let harness: E2eTestApp
  let fixtures: E2eFixtureBuilder
  let vaccineId: string

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
    const vaccine = await fixtures.createVaccine({
      name: 'Stock Flu',
      stockQuantity: 50,
    })
    vaccineId = vaccine.id
  })

  it('persists a valid stock adjustment exactly once', async () => {
    const beforeCount = await countCollection(
      harness.dataSource,
      StockAdjustment,
    )

    const response = await graphqlRequest<{
      adjustVaccineStock: {
        quantityBefore: number
        quantityAfter: number
        quantityDelta: number
      }
    }>(harness.app, {
      query: ADJUST,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          vaccineId,
          type: 'RESTOCK',
          quantityDelta: 10,
          reason: 'E2E restock',
        },
      },
    })

    expect(response.errors).toBeUndefined()
    expect(response.data?.adjustVaccineStock).toMatchObject({
      quantityBefore: 50,
      quantityAfter: 60,
      quantityDelta: 10,
    })

    expect(await countCollection(harness.dataSource, StockAdjustment)).toBe(
      beforeCount + 1,
    )

    const vaccine = await graphqlRequest<{
      vaccine: { stockQuantity: number }
    }>(harness.app, {
      query: VACCINE,
      token: E2E_TOKENS.admin,
      variables: { id: vaccineId },
    })
    expect(vaccine.data?.vaccine.stockQuantity).toBe(60)
  })

  it('rejects invalid adjustments and unauthorized roles without leaking Mongo errors', async () => {
    const invalid = await graphqlRequest(harness.app, {
      query: ADJUST,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          vaccineId,
          type: 'MANUAL_DECREASE',
          quantityDelta: 999,
          reason: 'too much',
        },
      },
    })

    expect(invalid.data?.['adjustVaccineStock' as never]).toBeFalsy()
    expect(firstErrorMessage(invalid.errors)).toBeTruthy()
    expect(JSON.stringify(invalid.body)).not.toMatch(
      /MongoServerError|E11000|mongodb:\/\//i,
    )

    const stored = await harness.dataSource
      .getMongoRepository(Vaccine)
      .findOneBy({ _id: vaccineId as never })
    expect(stored?.stockQuantity).toBe(50)

    const forbidden = await graphqlRequest(harness.app, {
      query: ADJUST,
      token: E2E_TOKENS.apotheker1,
      variables: {
        input: {
          vaccineId,
          type: 'RESTOCK',
          quantityDelta: 1,
          reason: 'nope',
        },
      },
    })
    expect(firstErrorMessage(forbidden.errors)).toMatch(/Forbidden/i)
    expect(firstErrorCode(forbidden.errors) ?? 'FORBIDDEN').toBeTruthy()
  })
})

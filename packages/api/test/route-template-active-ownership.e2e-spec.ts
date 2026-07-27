import { ObjectId } from 'mongodb'
import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { E2E_TOKENS } from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import { firstErrorCode, graphqlRequest } from './helpers/e2e-graphql.helper'
import { ROUTE_TEMPLATE_ACTIVE_OWNER_INDEX_NAME } from '../src/route-templates/route-template-persistence.service'
import { RouteTemplate } from '../src/route-templates/route-template.entity'

describe('GraphQL E2E — route template active ownership invariant', () => {
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

  it('creating a second active template deactivates the previous one for the same courier', async () => {
    await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()

    const first = await graphqlRequest<{
      createRouteTemplate: {
        deactivatedTemplateIds: string[]
        template: { id: string; active: boolean }
      }
    }>(harness.app, {
      query: `
        mutation Create($input: CreateRouteTemplateInput!) {
          createRouteTemplate(input: $input) {
            deactivatedTemplateIds
            template { id active }
          }
        }
      `,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          name: 'First Active',
          bezorgerProfileId: courier.profile.id,
          stops: [{ apothekerProfileId: pharmacy.profile.id }],
        },
      },
    })

    expect(first.errors).toBeUndefined()
    const firstId = first.data!.createRouteTemplate.template.id

    const second = await graphqlRequest<{
      createRouteTemplate: {
        deactivatedTemplateIds: string[]
        template: { id: string; active: boolean }
      }
    }>(harness.app, {
      query: `
        mutation Create($input: CreateRouteTemplateInput!) {
          createRouteTemplate(input: $input) {
            deactivatedTemplateIds
            template { id active }
          }
        }
      `,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          name: 'Second Active',
          bezorgerProfileId: courier.profile.id,
          stops: [{ apothekerProfileId: pharmacy.profile.id }],
        },
      },
    })

    expect(second.errors).toBeUndefined()
    expect(second.data!.createRouteTemplate.template.active).toBe(true)
    expect(
      second.data!.createRouteTemplate.deactivatedTemplateIds.map(String),
    ).toContain(String(firstId))

    const repo = harness.dataSource.getMongoRepository(RouteTemplate)
    const active = await repo.find({
      where: {
        bezorgerProfileId: String(courier.profile.id),
        active: true,
      },
    })
    expect(active).toHaveLength(1)
    expect(String(active[0]._id)).toBe(
      String(second.data!.createRouteTemplate.template.id),
    )

    const historical = await repo.find({
      where: { bezorgerProfileId: String(courier.profile.id) },
    })
    expect(historical).toHaveLength(2)
  })

  it('preview returns stable integrity error when duplicate actives somehow exist', async () => {
    await fixtures.createAdmin()
    const pharmacy = await fixtures.createApotheker(E2E_TOKENS.apotheker1)
    const courier = await fixtures.createBezorger(E2E_TOKENS.bezorger1)
    await fixtures.ensureSettings()

    const created = await graphqlRequest<{
      createRouteTemplate: { template: { id: string } }
    }>(harness.app, {
      query: `
        mutation Create($input: CreateRouteTemplateInput!) {
          createRouteTemplate(input: $input) {
            template { id }
          }
        }
      `,
      token: E2E_TOKENS.admin,
      variables: {
        input: {
          name: 'Integrity Base',
          bezorgerProfileId: courier.profile.id,
          stops: [{ apothekerProfileId: pharmacy.profile.id }],
        },
      },
    })
    expect(created.errors).toBeUndefined()

    const repo = harness.dataSource.getMongoRepository(RouteTemplate)
    try {
      await repo.dropCollectionIndex(ROUTE_TEMPLATE_ACTIVE_OWNER_INDEX_NAME)
    } catch {
      // Index may already be absent.
    }

    const base = await repo.findOne({
      where: {
        _id: new ObjectId(created.data!.createRouteTemplate.template.id),
      },
    })
    expect(base).toBeTruthy()

    await repo.insert({
      name: 'Integrity Duplicate',
      normalizedName: 'integrity duplicate',
      description: 'forced duplicate for integrity e2e',
      active: true,
      bezorgerProfileId: base!.bezorgerProfileId,
      stops: base!.stops,
      createdByUserId: base!.createdByUserId,
      updatedByUserId: base!.updatedByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const preview = await graphqlRequest<{
      myTomorrowRoutePreview: { routeTemplateId: string } | null
    }>(harness.app, {
      query: `
        query Preview {
          myTomorrowRoutePreview { routeTemplateId }
        }
      `,
      token: E2E_TOKENS.bezorger1,
    })

    expect(preview.data?.myTomorrowRoutePreview ?? null).toBeNull()
    expect(firstErrorCode(preview.errors)).toBe(
      'ROUTE_TEMPLATE_MULTIPLE_ACTIVE_FOR_COURIER',
    )
  })
})

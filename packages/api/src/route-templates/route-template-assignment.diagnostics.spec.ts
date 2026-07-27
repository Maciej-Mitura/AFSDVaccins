import {
  applyRepairPlan,
  buildRepairPlan,
  diagnoseRouteTemplateAssignments,
  formatDiagnosisReport,
  ROUTE_TEMPLATE_REPAIR_ACTOR_ID,
} from './route-template-assignment.diagnostics'
import {
  ROUTE_TEMPLATE_ACTIVE_OWNER_INDEX_NAME,
  ROUTE_TEMPLATE_ACTIVE_OWNER_PARTIAL_INDEX,
  RouteTemplatePersistenceService,
} from './route-template-persistence.service'
import { RouteTemplate } from './route-template.entity'
import { MongoRepository } from 'typeorm'
import { ObjectId } from 'mongodb'

describe('RouteTemplatePersistenceService', () => {
  let service: RouteTemplatePersistenceService
  let repository: jest.Mocked<
    Pick<MongoRepository<RouteTemplate>, 'createCollectionIndex'>
  >

  beforeEach(() => {
    repository = {
      createCollectionIndex: jest.fn(),
    }
    service = new RouteTemplatePersistenceService(
      repository as unknown as MongoRepository<RouteTemplate>,
    )
  })

  it('creates a partial unique index only for active templates', async () => {
    repository.createCollectionIndex.mockResolvedValue('ok')

    await service.ensureActiveOwnerPartialUniqueIndex()

    expect(repository.createCollectionIndex).toHaveBeenCalledWith(
      ROUTE_TEMPLATE_ACTIVE_OWNER_PARTIAL_INDEX.key,
      {
        name: ROUTE_TEMPLATE_ACTIVE_OWNER_INDEX_NAME,
        unique: true,
        partialFilterExpression: { active: true },
      },
    )
  })

  it('soft-fails when duplicate active rows block index creation', async () => {
    repository.createCollectionIndex.mockRejectedValue({
      code: 11000,
      codeName: 'DuplicateKey',
    })

    await expect(
      service.ensureActiveOwnerPartialUniqueIndex(),
    ).resolves.toBeUndefined()
  })
})

describe('route-template-assignment diagnostics', () => {
  function memoryDb(docs: Array<Record<string, unknown>>) {
    const store = docs.map(doc => ({ ...doc }))
    return {
      collection: () => ({
        find: () => ({
          toArray: () => Promise.resolve(store),
        }),
        updateMany: (
          filter: {
            _id: { $in: ObjectId[] }
            bezorgerProfileId: string
            active: boolean
          },
          update: { $set: Record<string, unknown> },
        ) => {
          let modifiedCount = 0
          const ids = new Set(filter._id.$in.map(id => id.toString()))
          for (const doc of store) {
            if (
              ids.has(String(doc._id)) &&
              doc.bezorgerProfileId === filter.bezorgerProfileId &&
              doc.active === true
            ) {
              Object.assign(doc, update.$set)
              modifiedCount += 1
            }
          }
          return Promise.resolve({ modifiedCount })
        },
      }),
    }
  }

  const courierA = '607f1f77bcf86cd799439022'
  const keepId = '507f1f77bcf86cd799439011'
  const dropId = '507f1f77bcf86cd799439012'

  it('finds duplicate active assignments and recommends seed-named keep', async () => {
    const db = memoryDb([
      {
        _id: keepId,
        name: 'Seed Demo Route Bezorger 1',
        normalizedName: 'seed demo route bezorger 1',
        active: true,
        bezorgerProfileId: courierA,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        stops: [{}, {}, {}],
      },
      {
        _id: dropId,
        name: 'aaa',
        normalizedName: 'aaa',
        active: true,
        bezorgerProfileId: courierA,
        createdAt: new Date('2026-07-26T00:00:00.000Z'),
        updatedAt: new Date('2026-07-26T00:00:00.000Z'),
        stops: [{}, {}],
      },
      {
        _id: '507f1f77bcf86cd799439013',
        name: 'inactive history',
        normalizedName: 'inactive history',
        active: false,
        bezorgerProfileId: courierA,
        stops: [],
      },
    ])

    const diagnosis = await diagnoseRouteTemplateAssignments(db as never)
    expect(diagnosis.duplicateCourierCount).toBe(1)
    expect(diagnosis.duplicateGroups[0].recommendedKeepId).toBe(keepId)
    expect(formatDiagnosisReport(diagnosis).join('\n')).toContain(courierA)

    const dryPlan = buildRepairPlan({
      diagnosis,
      bezorgerProfileId: courierA,
      keepTemplateId: keepId,
      dryRun: true,
    })
    expect(dryPlan.deactivateTemplateIds).toEqual([dropId])

    const dryResult = await applyRepairPlan(db as never, dryPlan)
    expect(dryResult.deactivatedCount).toBe(0)
    expect(db.collection().find().toArray).toBeDefined()
    const afterDry = await db.collection().find().toArray()
    expect(afterDry.filter(doc => doc.active === true)).toHaveLength(2)

    const applyPlan = buildRepairPlan({
      diagnosis,
      bezorgerProfileId: courierA,
      keepTemplateId: keepId,
      dryRun: false,
    })
    const applied = await applyRepairPlan(db as never, applyPlan)
    expect(applied.deactivatedCount).toBe(1)

    const after = await db.collection().find().toArray()
    const kept = after.find(doc => String(doc._id) === keepId)
    const dropped = after.find(doc => String(doc._id) === dropId)
    const history = after.find(
      doc => String(doc._id) === '507f1f77bcf86cd799439013',
    )

    expect(kept?.active).toBe(true)
    expect(dropped?.active).toBe(false)
    expect(dropped?.updatedByUserId).toBe(ROUTE_TEMPLATE_REPAIR_ACTOR_ID)
    expect(history?.active).toBe(false)
    expect(after).toHaveLength(3)
  })
})

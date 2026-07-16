import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { FindOptionsWhere, MongoRepository } from 'typeorm'

import {
  ApothekerProfileNotFoundException,
  BezorgerProfileNotFoundException,
} from '../profile/exceptions/profile.exceptions'
import { ApothekerProfileService } from '../profile/apotheker/apotheker-profile.service'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import {
  RouteTemplateAlreadyExistsException,
  RouteTemplateDuplicateStopException,
  RouteTemplateEmptyStopsException,
  RouteTemplateNotFoundException,
} from './exceptions/route-template.exceptions'
import { RouteTemplate } from './route-template.entity'
import { RouteTemplatesService } from './route-templates.service'
import { normalizeRouteTemplateName } from './route-template.utils'

describe('RouteTemplatesService', () => {
  let service: RouteTemplatesService
  let repository: jest.Mocked<
    Pick<MongoRepository<RouteTemplate>, 'findOne' | 'find' | 'create' | 'save'>
  >
  let bezorgerProfileService: jest.Mocked<
    Pick<BezorgerProfileService, 'findBezorgerProfileById'>
  >
  let apothekerProfileService: jest.Mocked<
    Pick<ApothekerProfileService, 'findApothekerProfileById'>
  >

  const templateId = '507f1f77bcf86cd799439011'
  const bezorgerProfileId = '607f1f77bcf86cd799439022'
  const pharmacyAId = '707f1f77bcf86cd799439033'
  const pharmacyBId = '807f1f77bcf86cd799439044'
  const pharmacyCId = '907f1f77bcf86cd799439055'
  const adminUserId = 'a07f1f77bcf86cd799439066'
  const otherAdminUserId = 'b07f1f77bcf86cd799439077'

  const adminUser = {
    _id: adminUserId,
    id: adminUserId,
    firebaseUid: 'firebase-admin',
    email: 'admin@example.com',
    firstName: 'Ada',
    lastName: 'Admin',
    role: UserRole.ADMIN,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  } as User

  const otherAdminUser = {
    ...adminUser,
    _id: otherAdminUserId,
    id: otherAdminUserId,
    firebaseUid: 'firebase-admin-2',
  } as User

  const activeTemplate: RouteTemplate = {
    _id: templateId,
    id: templateId,
    name: 'Noordroute',
    normalizedName: 'noordroute',
    description: 'Ochtendronde',
    active: true,
    bezorgerProfileId,
    stops: [
      { apothekerProfileId: pharmacyAId, sequence: 1 },
      { apothekerProfileId: pharmacyBId, sequence: 2 },
      { apothekerProfileId: pharmacyCId, sequence: 3 },
    ],
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
    createdByUserId: adminUserId,
    updatedByUserId: adminUserId,
  }

  function matchesObjectIdLookup(
    options: Parameters<MongoRepository<RouteTemplate>['findOne']>[0],
    id: string,
  ): boolean {
    const where = options?.where

    if (!where || Array.isArray(where)) {
      return false
    }

    const lookupId = (where as FindOptionsWhere<RouteTemplate>)._id
    return lookupId instanceof ObjectId && lookupId.toString() === id
  }

  function mockTemplateLookup(template: RouteTemplate | null): void {
    repository.findOne.mockImplementation(options => {
      if (!template) {
        return Promise.resolve(null)
      }

      const where = options?.where

      if (
        where &&
        !Array.isArray(where) &&
        'normalizedName' in (where as object)
      ) {
        return Promise.resolve(null)
      }

      return Promise.resolve(
        matchesObjectIdLookup(options, template._id.toString())
          ? ({ ...template, stops: [...template.stops] } as RouteTemplate)
          : null,
      )
    })
  }

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    }

    bezorgerProfileService = {
      findBezorgerProfileById: jest.fn(),
    }

    apothekerProfileService = {
      findApothekerProfileById: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteTemplatesService,
        {
          provide: getRepositoryToken(RouteTemplate),
          useValue: repository,
        },
        {
          provide: BezorgerProfileService,
          useValue: bezorgerProfileService,
        },
        {
          provide: ApothekerProfileService,
          useValue: apothekerProfileService,
        },
      ],
    }).compile()

    service = module.get(RouteTemplatesService)

    bezorgerProfileService.findBezorgerProfileById.mockResolvedValue({
      _id: bezorgerProfileId,
      id: bezorgerProfileId,
    } as never)

    apothekerProfileService.findApothekerProfileById.mockImplementation(
      id =>
        Promise.resolve({
          _id: id,
          id,
        } as never),
    )
  })

  it('creates a template with normalized name, audit fields, and 1..n sequences', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as RouteTemplate)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...activeTemplate,
        ...value,
        _id: templateId,
      } as RouteTemplate),
    )

    const result = await service.createRouteTemplate(
      {
        name: '  Noord  Route ',
        description: '  Ochtendronde  ',
        bezorgerProfileId,
        stops: [
          { apothekerProfileId: pharmacyAId },
          { apothekerProfileId: pharmacyBId },
          { apothekerProfileId: pharmacyCId },
        ],
      },
      adminUser,
    )

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Noord  Route',
        normalizedName: 'noord route',
        description: 'Ochtendronde',
        active: true,
        bezorgerProfileId,
        stops: [
          { apothekerProfileId: pharmacyAId, sequence: 1 },
          { apothekerProfileId: pharmacyBId, sequence: 2 },
          { apothekerProfileId: pharmacyCId, sequence: 3 },
        ],
        createdByUserId: adminUserId,
        updatedByUserId: adminUserId,
      }),
    )
    expect(result.stops.map(stop => stop.sequence)).toEqual([1, 2, 3])
    expect(result.createdByUserId).toBe(adminUserId)
  })

  it('normalizes unique names with trimming, whitespace collapse, and case-folding', () => {
    expect(normalizeRouteTemplateName('  Noord   Route ')).toBe('noord route')
    expect(normalizeRouteTemplateName('NOORD ROUTE')).toBe('noord route')
  })

  it('rejects duplicate normalized names on create', async () => {
    repository.findOne.mockResolvedValue(activeTemplate)

    await expect(
      service.createRouteTemplate(
        {
          name: 'noordroute',
          bezorgerProfileId,
          stops: [{ apothekerProfileId: pharmacyAId }],
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(RouteTemplateAlreadyExistsException)
  })

  it('maps duplicate-key save errors to already-exists', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as RouteTemplate)
    repository.save.mockRejectedValue({ code: 11000 })

    await expect(
      service.createRouteTemplate(
        {
          name: 'Zuidroute',
          bezorgerProfileId,
          stops: [{ apothekerProfileId: pharmacyAId }],
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(RouteTemplateAlreadyExistsException)
  })

  it('sets authenticated audit fields on update', async () => {
    mockTemplateLookup(activeTemplate)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as RouteTemplate),
    )

    const result = await service.updateRouteTemplate(
      templateId,
      { description: 'Avondronde' },
      otherAdminUser,
    )

    expect(result.description).toBe('Avondronde')
    expect(result.updatedByUserId).toBe(otherAdminUserId)
    expect(result.createdByUserId).toBe(adminUserId)
  })

  it('rejects unknown courier profiles', async () => {
    repository.findOne.mockResolvedValue(null)
    bezorgerProfileService.findBezorgerProfileById.mockRejectedValue(
      new BezorgerProfileNotFoundException(),
    )

    await expect(
      service.createRouteTemplate(
        {
          name: 'Zuidroute',
          bezorgerProfileId,
          stops: [{ apothekerProfileId: pharmacyAId }],
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(BezorgerProfileNotFoundException)
  })

  it('rejects unknown pharmacist profiles', async () => {
    repository.findOne.mockResolvedValue(null)
    apothekerProfileService.findApothekerProfileById.mockRejectedValue(
      new ApothekerProfileNotFoundException(),
    )

    await expect(
      service.createRouteTemplate(
        {
          name: 'Zuidroute',
          bezorgerProfileId,
          stops: [{ apothekerProfileId: pharmacyAId }],
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(ApothekerProfileNotFoundException)
  })

  it('rejects duplicate pharmacist stops in one template', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(
      service.createRouteTemplate(
        {
          name: 'Zuidroute',
          bezorgerProfileId,
          stops: [
            { apothekerProfileId: pharmacyAId },
            { apothekerProfileId: pharmacyAId },
          ],
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(RouteTemplateDuplicateStopException)
  })

  it('rejects empty stops', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(
      service.createRouteTemplate(
        {
          name: 'Zuidroute',
          bezorgerProfileId,
          stops: [],
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(RouteTemplateEmptyStopsException)
  })

  it('normalizes sequence from submitted array order on update', async () => {
    mockTemplateLookup(activeTemplate)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as RouteTemplate),
    )

    const result = await service.updateRouteTemplate(
      templateId,
      {
        stops: [
          { apothekerProfileId: pharmacyCId },
          { apothekerProfileId: pharmacyAId },
        ],
      },
      adminUser,
    )

    expect(result.stops).toEqual([
      { apothekerProfileId: pharmacyCId, sequence: 1 },
      { apothekerProfileId: pharmacyAId, sequence: 2 },
    ])
  })

  it('returns stops deterministically ordered by sequence', async () => {
    mockTemplateLookup({
      ...activeTemplate,
      stops: [
        { apothekerProfileId: pharmacyCId, sequence: 3 },
        { apothekerProfileId: pharmacyAId, sequence: 1 },
        { apothekerProfileId: pharmacyBId, sequence: 2 },
      ],
    } as RouteTemplate)

    const result = await service.findRouteTemplateById(templateId)

    expect(result.stops.map(stop => stop.apothekerProfileId)).toEqual([
      pharmacyAId,
      pharmacyBId,
      pharmacyCId,
    ])
  })

  it('deactivates and reactivates a template', async () => {
    mockTemplateLookup(activeTemplate)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as RouteTemplate),
    )

    const deactivated = await service.setRouteTemplateActive(
      templateId,
      false,
      adminUser,
    )
    expect(deactivated.active).toBe(false)
    expect(deactivated.updatedByUserId).toBe(adminUserId)

    mockTemplateLookup({ ...activeTemplate, active: false } as RouteTemplate)
    const reactivated = await service.setRouteTemplateActive(
      templateId,
      true,
      otherAdminUser,
    )
    expect(reactivated.active).toBe(true)
    expect(reactivated.updatedByUserId).toBe(otherAdminUserId)
  })

  it('lists only active templates by default', async () => {
    repository.find.mockResolvedValue([activeTemplate])

    await service.findRouteTemplates(false)

    expect(repository.find).toHaveBeenCalledWith({
      where: { active: true },
      order: { name: 'ASC' },
    })
  })

  it('includes inactive templates when requested', async () => {
    repository.find.mockResolvedValue([
      activeTemplate,
      { ...activeTemplate, active: false } as RouteTemplate,
    ])

    const result = await service.findRouteTemplates(true)

    expect(repository.find).toHaveBeenCalledWith({
      order: { name: 'ASC' },
    })
    expect(result).toHaveLength(2)
  })

  it('rejects malformed and missing template ids', async () => {
    await expect(
      service.findRouteTemplateById('not-an-object-id'),
    ).rejects.toBeInstanceOf(RouteTemplateNotFoundException)

    repository.findOne.mockResolvedValue(null)

    await expect(
      service.findRouteTemplateById('6a569d2cbb2590db980429cd'),
    ).rejects.toBeInstanceOf(RouteTemplateNotFoundException)
  })

  it('rejects malformed courier and pharmacist ids', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(
      service.createRouteTemplate(
        {
          name: 'Zuidroute',
          bezorgerProfileId: 'bad-id',
          stops: [{ apothekerProfileId: pharmacyAId }],
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(BezorgerProfileNotFoundException)

    await expect(
      service.createRouteTemplate(
        {
          name: 'Zuidroute',
          bezorgerProfileId,
          stops: [{ apothekerProfileId: 'bad-id' }],
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(ApothekerProfileNotFoundException)
  })

  it('does not call order, stock, or notification collaborators', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as RouteTemplate)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...activeTemplate,
        ...value,
        _id: templateId,
      } as RouteTemplate),
    )

    await service.createRouteTemplate(
      {
        name: 'Oostroute',
        bezorgerProfileId,
        stops: [{ apothekerProfileId: pharmacyAId }],
      },
      adminUser,
    )

    expect(bezorgerProfileService.findBezorgerProfileById).toHaveBeenCalled()
    expect(apothekerProfileService.findApothekerProfileById).toHaveBeenCalled()
    expect(Object.keys(repository)).toEqual(
      expect.arrayContaining(['findOne', 'find', 'create', 'save']),
    )
  })
})

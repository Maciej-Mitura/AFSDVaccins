import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { ApplicationCacheService } from '../common/cache/application-cache.service'
import { CacheKeys } from '../common/cache/cache-keys'
import { UserRole } from '../user/user-role.enum'
import { Vaccine } from './vaccine.entity'
import { VaccineService } from './vaccine.service'

describe('VaccineService catalogue cache authorization', () => {
  let service: VaccineService
  let repository: jest.Mocked<
    Pick<MongoRepository<Vaccine>, 'findOne' | 'find' | 'create' | 'save'>
  >
  let getOrSet: jest.Mock

  const active: Vaccine = {
    _id: '1',
    id: '1',
    name: 'Active',
    normalizedName: 'active',
    description: '',
    manufacturer: 'X',
    stockQuantity: 1,
    stockWarningThreshold: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const inactive: Vaccine = {
    ...active,
    _id: '2',
    id: '2',
    name: 'Inactive',
    normalizedName: 'inactive',
    active: false,
  }

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    }

    getOrSet = jest.fn(
      async (key: string, loader: () => Promise<unknown>) => {
        if (key === CacheKeys.vaccinesActive()) {
          return [active]
        }
        if (key === CacheKeys.vaccinesAll()) {
          return [active, inactive]
        }
        return loader()
      },
    )

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccineService,
        {
          provide: getRepositoryToken(Vaccine),
          useValue: repository,
        },
        {
          provide: ApplicationCacheService,
          useValue: {
            getOrSet,
            invalidateVaccines: jest.fn(),
            referenceTtlMs: () => 60_000,
          },
        },
      ],
    }).compile()

    service = module.get(VaccineService)
  })

  it('uses vaccines:active for APOTHEKER even when includeInactive is requested', async () => {
    const result = await service.findVaccines(true, UserRole.APOTHEKER)

    expect(getOrSet).toHaveBeenCalledWith(
      CacheKeys.vaccinesActive(),
      expect.any(Function),
      60_000,
    )
    expect(result.every((v) => v.active)).toBe(true)
    expect(result.some((v) => v.name === 'Inactive')).toBe(false)
  })

  it('uses vaccines:active for BEZORGER', async () => {
    await service.findVaccines(false, UserRole.BEZORGER)
    const firstCall = getOrSet.mock.calls[0] as
      | [string, () => Promise<unknown>, number?]
      | undefined
    expect(firstCall?.[0]).toBe(CacheKeys.vaccinesActive())
  })

  it('uses vaccines:all only for ADMIN with includeInactive', async () => {
    const result = await service.findVaccines(true, UserRole.ADMIN)

    expect(getOrSet).toHaveBeenCalledWith(
      CacheKeys.vaccinesAll(),
      expect.any(Function),
      60_000,
    )
    expect(result.some((v) => !v.active)).toBe(true)
  })

  it('uses vaccines:active for ADMIN without includeInactive', async () => {
    await service.findVaccines(false, UserRole.ADMIN)
    const firstCall = getOrSet.mock.calls[0] as
      | [string, () => Promise<unknown>, number?]
      | undefined
    expect(firstCall?.[0]).toBe(CacheKeys.vaccinesActive())
  })
})

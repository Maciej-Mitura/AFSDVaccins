import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { FindOptionsWhere, MongoRepository } from 'typeorm'

import { UserRole } from '../user/user-role.enum'
import {
  VaccineAlreadyExistsException,
  VaccineNotFoundException,
} from './exceptions/vaccine.exceptions'
import { Vaccine } from './vaccine.entity'
import { VaccineService } from './vaccine.service'

describe('VaccineService', () => {
  let service: VaccineService
  let repository: jest.Mocked<
    Pick<MongoRepository<Vaccine>, 'findOne' | 'find' | 'create' | 'save'>
  >

  const vaccineId = '507f1f77bcf86cd799439011'
  const nonexistentVaccineId = '6a569d2cbb2590db980429cd'

  const activeVaccine: Vaccine = {
    _id: vaccineId,
    id: vaccineId,
    name: 'Influenza',
    normalizedName: 'influenza',
    description: 'Seasonal flu vaccine',
    manufacturer: 'PharmaCo',
    stockQuantity: 10,
    stockWarningThreshold: 5,
    active: true,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  function matchesObjectIdLookup(
    options: Parameters<MongoRepository<Vaccine>['findOne']>[0],
    id: string,
  ): boolean {
    const where = options?.where

    if (!where || Array.isArray(where)) {
      return false
    }

    const lookupId = (where as FindOptionsWhere<Vaccine>)._id
    return lookupId instanceof ObjectId && lookupId.toString() === id
  }

  function mockVaccineLookup(vaccine: Vaccine | null): void {
    repository.findOne.mockImplementation(options => {
      if (!vaccine) {
        return Promise.resolve(null)
      }

      return Promise.resolve(
        matchesObjectIdLookup(options, vaccine._id.toString()) ? vaccine : null,
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccineService,
        {
          provide: getRepositoryToken(Vaccine),
          useValue: repository,
        },
      ],
    }).compile()

    service = module.get(VaccineService)
  })

  it('creates a normalized vaccine with defaults', async () => {
    repository.findOne.mockResolvedValue(null)
    repository.create.mockImplementation(value => value as Vaccine)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...activeVaccine,
        ...value,
      } as Vaccine),
    )

    const result = await service.createVaccine({
      name: '  Influenza ',
      description: 'Seasonal flu vaccine',
      manufacturer: 'PharmaCo',
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Influenza',
        normalizedName: 'influenza',
        stockQuantity: 0,
        stockWarningThreshold: 0,
        active: true,
      }),
    )
    expect(result.name).toBe('Influenza')
  })

  it('rejects duplicate normalized names', async () => {
    repository.findOne.mockResolvedValue(activeVaccine)

    await expect(
      service.createVaccine({
        name: 'influenza',
        manufacturer: 'OtherCo',
      }),
    ).rejects.toBeInstanceOf(VaccineAlreadyExistsException)
  })

  it('lists active vaccines for APOTHEKER', async () => {
    repository.find.mockResolvedValue([activeVaccine])

    const result = await service.findVaccines(false, UserRole.APOTHEKER)

    expect(repository.find).toHaveBeenCalledWith({
      where: { active: true },
      order: { name: 'ASC' },
    })
    expect(result).toEqual([activeVaccine])
  })

  it('allows ADMIN to include inactive vaccines', async () => {
    const inactiveVaccine = { ...activeVaccine, active: false } as Vaccine
    repository.find.mockResolvedValue([activeVaccine, inactiveVaccine])

    const result = await service.findVaccines(true, UserRole.ADMIN)

    expect(repository.find).toHaveBeenCalledWith({
      order: { name: 'ASC' },
    })
    expect(result).toHaveLength(2)
  })

  it('converts a valid GraphQL string ID to ObjectId for lookup', async () => {
    mockVaccineLookup(activeVaccine)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as Vaccine),
    )

    await service.updateVaccine(vaccineId, {
      description: 'Updated description',
    })

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { _id: new ObjectId(vaccineId) },
    })
  })

  it('updates approved fields', async () => {
    mockVaccineLookup(activeVaccine)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as Vaccine),
    )

    const result = await service.updateVaccine(vaccineId, {
      description: 'Updated description',
      stockQuantity: 25,
      stockWarningThreshold: 8,
    })

    expect(result.description).toBe('Updated description')
    expect(result.stockQuantity).toBe(25)
    expect(result.stockWarningThreshold).toBe(8)
  })

  it('deactivates an existing vaccine', async () => {
    mockVaccineLookup(activeVaccine)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as Vaccine),
    )

    const deactivated = await service.setVaccineActive(vaccineId, false)

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { _id: new ObjectId(vaccineId) },
    })
    expect(deactivated.active).toBe(false)
  })

  it('reactivates an existing vaccine', async () => {
    mockVaccineLookup({ ...activeVaccine, active: false } as Vaccine)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as Vaccine),
    )

    const reactivated = await service.setVaccineActive(vaccineId, true)

    expect(reactivated.active).toBe(true)
  })

  it('finds vaccines by string ID through the shared lookup path', async () => {
    mockVaccineLookup(activeVaccine)

    const result = await service.findVaccineById(vaccineId, UserRole.ADMIN)

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { _id: new ObjectId(vaccineId) },
    })
    expect(result).toEqual(activeVaccine)
  })

  it('returns VACCINE_NOT_FOUND for malformed IDs', async () => {
    await expect(
      service.updateVaccine('missing-id', { description: 'x' }),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)

    expect(repository.findOne).not.toHaveBeenCalled()
  })

  it('returns VACCINE_NOT_FOUND for valid but nonexistent ObjectIds', async () => {
    mockVaccineLookup(null)

    await expect(
      service.setVaccineActive(nonexistentVaccineId, false),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { _id: new ObjectId(nonexistentVaccineId) },
    })
  })

  it('hides inactive vaccines from APOTHEKER by id', async () => {
    mockVaccineLookup({ ...activeVaccine, active: false } as Vaccine)

    await expect(
      service.findVaccineById(vaccineId, UserRole.APOTHEKER),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)
  })
})

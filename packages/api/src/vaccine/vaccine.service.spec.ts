import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

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

  it('updates approved fields', async () => {
    repository.findOne.mockResolvedValue({ ...activeVaccine } as Vaccine)
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

  it('activates and deactivates vaccines', async () => {
    repository.findOne.mockResolvedValue({ ...activeVaccine } as Vaccine)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as Vaccine),
    )

    const deactivated = await service.setVaccineActive(vaccineId, false)
    expect(deactivated.active).toBe(false)
  })

  it('returns VACCINE_NOT_FOUND for missing vaccines', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(
      service.updateVaccine('missing-id', { description: 'x' }),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)
  })

  it('hides inactive vaccines from APOTHEKER by id', async () => {
    repository.findOne.mockResolvedValue({
      ...activeVaccine,
      active: false,
    } as Vaccine)

    await expect(
      service.findVaccineById(vaccineId, UserRole.APOTHEKER),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)
  })
})

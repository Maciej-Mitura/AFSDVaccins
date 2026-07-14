import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { SettingsInvalidException } from './exceptions/settings-invalid.exception'
import {
  DEFAULT_ORDERING_CLOSING_TIME,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEKLY_WARNING_PERCENTAGE,
  SETTINGS_SINGLETON_KEY,
} from './settings.constants'
import { ApplicationSettings } from './settings.entity'
import { SettingsService } from './settings.service'

describe('SettingsService', () => {
  let service: SettingsService
  let repository: jest.Mocked<
    Pick<MongoRepository<ApplicationSettings>, 'findOne' | 'create' | 'save'>
  >

  const persistedSettings: ApplicationSettings = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    singletonKey: SETTINGS_SINGLETON_KEY,
    timezone: DEFAULT_TIMEZONE,
    orderingClosingTime: DEFAULT_ORDERING_CLOSING_TIME,
    weeklyWarningPercentage: DEFAULT_WEEKLY_WARNING_PERCENTAGE,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(ApplicationSettings),
          useValue: repository,
        },
      ],
    }).compile()

    service = module.get(SettingsService)
  })

  it('returns defaults when none exist', async () => {
    repository.findOne.mockResolvedValueOnce(null)
    repository.create.mockImplementation(value => value as ApplicationSettings)
    repository.save.mockResolvedValue(persistedSettings)

    const result = await service.getApplicationSettings()

    expect(repository.create).toHaveBeenCalledWith({
      singletonKey: SETTINGS_SINGLETON_KEY,
      timezone: DEFAULT_TIMEZONE,
      orderingClosingTime: DEFAULT_ORDERING_CLOSING_TIME,
      weeklyWarningPercentage: DEFAULT_WEEKLY_WARNING_PERCENTAGE,
    })
    expect(result.timezone).toBe(DEFAULT_TIMEZONE)
    expect(result.orderingClosingTime).toBe(DEFAULT_ORDERING_CLOSING_TIME)
    expect(result.weeklyWarningPercentage).toBe(DEFAULT_WEEKLY_WARNING_PERCENTAGE)
  })

  it('does not create duplicates on repeated reads', async () => {
    repository.findOne.mockResolvedValue(persistedSettings)

    await service.getApplicationSettings()
    await service.getApplicationSettings()

    expect(repository.save).not.toHaveBeenCalled()
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('recovers the singleton when concurrent creation races', async () => {
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persistedSettings)
    repository.create.mockImplementation(value => value as ApplicationSettings)
    repository.save.mockRejectedValueOnce(new Error('duplicate key'))

    const result = await service.getApplicationSettings()

    expect(result).toEqual(persistedSettings)
  })

  it('updates closing time and warning percentage', async () => {
    repository.findOne.mockResolvedValue({ ...persistedSettings } as ApplicationSettings)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as ApplicationSettings),
    )

    const result = await service.updateApplicationSettings({
      orderingClosingTime: '15:30',
      weeklyWarningPercentage: 80,
    })

    expect(result.orderingClosingTime).toBe('15:30')
    expect(result.weeklyWarningPercentage).toBe(80)
  })

  it('rejects empty update payloads', async () => {
    await expect(service.updateApplicationSettings({})).rejects.toBeInstanceOf(
      SettingsInvalidException,
    )
  })
})

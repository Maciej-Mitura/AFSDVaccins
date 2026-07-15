import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { SettingsInvalidException } from './exceptions/settings-invalid.exception'
import {
  APPLICATION_SETTINGS_DEFAULTS,
  DEFAULT_DAILY_DOSE_CAP_PER_TYPE,
  DEFAULT_ORDERING_CLOSING_TIME,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEKLY_DOSE_CAP,
  DEFAULT_WEEKLY_WARNING_PERCENTAGE,
  SETTINGS_SINGLETON_KEY,
} from './settings.constants'
import { ApplicationSettings } from './settings.entity'
import { normalizeSettings } from './settings.normalize'
import { SettingsService } from './settings.service'

describe('normalizeSettings', () => {
  const createLegacyDocument = (): ApplicationSettings =>
    ({
      _id: '507f1f77bcf86cd799439011',
      singletonKey: SETTINGS_SINGLETON_KEY,
      timezone: DEFAULT_TIMEZONE,
      orderingClosingTime: DEFAULT_ORDERING_CLOSING_TIME,
      weeklyWarningPercentage: DEFAULT_WEEKLY_WARNING_PERCENTAGE,
      createdAt: new Date('2026-07-14T12:00:00.000Z'),
      updatedAt: new Date('2026-07-14T12:00:00.000Z'),
    }) as ApplicationSettings

  it('fills only missing legacy fields with defaults', () => {
    const legacyDocument = createLegacyDocument()

    const { settings, repaired } = normalizeSettings(legacyDocument)

    expect(repaired).toBe(true)
    expect(settings.weeklyDoseCap).toBe(DEFAULT_WEEKLY_DOSE_CAP)
    expect(settings.dailyDoseCapPerType).toBe(DEFAULT_DAILY_DOSE_CAP_PER_TYPE)
  })

  it('preserves existing custom values', () => {
    const legacyDocument = {
      ...createLegacyDocument(),
      weeklyDoseCap: 175,
    } as ApplicationSettings

    const { settings, repaired } = normalizeSettings(legacyDocument)

    expect(repaired).toBe(true)
    expect(settings.weeklyDoseCap).toBe(175)
    expect(settings.dailyDoseCapPerType).toBe(DEFAULT_DAILY_DOSE_CAP_PER_TYPE)
  })
})

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
    weeklyDoseCap: DEFAULT_WEEKLY_DOSE_CAP,
    dailyDoseCapPerType: DEFAULT_DAILY_DOSE_CAP_PER_TYPE,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const legacyPhase6Document = (): ApplicationSettings =>
    ({
      _id: '507f1f77bcf86cd799439011',
      singletonKey: SETTINGS_SINGLETON_KEY,
      timezone: DEFAULT_TIMEZONE,
      orderingClosingTime: DEFAULT_ORDERING_CLOSING_TIME,
      weeklyWarningPercentage: DEFAULT_WEEKLY_WARNING_PERCENTAGE,
      createdAt: new Date('2026-07-14T12:00:00.000Z'),
      updatedAt: new Date('2026-07-14T12:00:00.000Z'),
    }) as ApplicationSettings

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

    expect(repository.create).toHaveBeenCalledWith(APPLICATION_SETTINGS_DEFAULTS)
    expect(result.weeklyDoseCap).toBe(200)
    expect(result.dailyDoseCapPerType).toBe(50)
  })

  it('backfills missing Phase 7 fields on legacy singleton documents', async () => {
    repository.findOne.mockResolvedValue(legacyPhase6Document())
    repository.save.mockImplementation(value =>
      Promise.resolve(value as ApplicationSettings),
    )

    const result = await service.getApplicationSettings()

    expect(result.weeklyDoseCap).toBe(DEFAULT_WEEKLY_DOSE_CAP)
    expect(result.dailyDoseCapPerType).toBe(DEFAULT_DAILY_DOSE_CAP_PER_TYPE)
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyDoseCap: DEFAULT_WEEKLY_DOSE_CAP,
        dailyDoseCapPerType: DEFAULT_DAILY_DOSE_CAP_PER_TYPE,
      }),
    )
  })

  it('does not rewrite legacy documents on a second read after repair', async () => {
    repository.findOne
      .mockResolvedValueOnce(legacyPhase6Document())
      .mockResolvedValueOnce(persistedSettings)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as ApplicationSettings),
    )

    await service.getApplicationSettings()
    await service.getApplicationSettings()

    expect(repository.save).toHaveBeenCalledTimes(1)
  })

  it('preserves custom cap values while backfilling only missing fields', async () => {
    const legacyWithCustomWeeklyCap = {
      ...legacyPhase6Document(),
      weeklyDoseCap: 175,
    } as ApplicationSettings

    repository.findOne.mockResolvedValue(legacyWithCustomWeeklyCap)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as ApplicationSettings),
    )

    const result = await service.getApplicationSettings()

    expect(result.weeklyDoseCap).toBe(175)
    expect(result.dailyDoseCapPerType).toBe(DEFAULT_DAILY_DOSE_CAP_PER_TYPE)
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

  it('repairs legacy fields after concurrent creation recovery', async () => {
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(legacyPhase6Document())
    repository.create.mockImplementation(value => value as ApplicationSettings)
    repository.save
      .mockRejectedValueOnce(new Error('duplicate key'))
      .mockImplementation(value => Promise.resolve(value as ApplicationSettings))

    const result = await service.getApplicationSettings()

    expect(result.weeklyDoseCap).toBe(DEFAULT_WEEKLY_DOSE_CAP)
    expect(result.dailyDoseCapPerType).toBe(DEFAULT_DAILY_DOSE_CAP_PER_TYPE)
    expect(repository.save).toHaveBeenCalledTimes(2)
  })

  it('updates closing time, warning percentage, and dose caps', async () => {
    repository.findOne.mockResolvedValue({ ...persistedSettings } as ApplicationSettings)
    repository.save.mockImplementation(value =>
      Promise.resolve(value as ApplicationSettings),
    )

    const result = await service.updateApplicationSettings({
      orderingClosingTime: '15:30',
      weeklyWarningPercentage: 80,
      weeklyDoseCap: 180,
      dailyDoseCapPerType: 45,
    })

    expect(result.orderingClosingTime).toBe('15:30')
    expect(result.weeklyWarningPercentage).toBe(80)
    expect(result.weeklyDoseCap).toBe(180)
    expect(result.dailyDoseCapPerType).toBe(45)
  })

  it('rejects empty update payloads', async () => {
    await expect(service.updateApplicationSettings({})).rejects.toBeInstanceOf(
      SettingsInvalidException,
    )
  })
})

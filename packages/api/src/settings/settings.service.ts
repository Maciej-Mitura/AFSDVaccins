import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { ApplicationCacheService } from '../common/cache/application-cache.service'
import { CacheKeys } from '../common/cache/cache-keys'
import { UpdateApplicationSettingsInput } from './dto/update-settings.input'
import { SettingsInvalidException } from './exceptions/settings-invalid.exception'
import { APPLICATION_SETTINGS_DEFAULTS } from './settings.constants'
import { ApplicationSettings } from './settings.entity'
import { normalizeSettings } from './settings.normalize'

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(ApplicationSettings)
    private readonly settingsRepository: MongoRepository<ApplicationSettings>,
    private readonly applicationCache: ApplicationCacheService,
  ) {}

  private createDefaultSettings(): ApplicationSettings {
    return this.settingsRepository.create({
      ...APPLICATION_SETTINGS_DEFAULTS,
    })
  }

  private async repairIfNeeded(
    settings: ApplicationSettings,
  ): Promise<ApplicationSettings> {
    const { settings: normalized, repaired } = normalizeSettings(settings)

    if (!repaired) {
      return normalized
    }

    return this.settingsRepository.save(normalized)
  }

  private async loadApplicationSettingsFromDb(): Promise<ApplicationSettings> {
    const existing = await this.settingsRepository.findOne({
      where: { singletonKey: APPLICATION_SETTINGS_DEFAULTS.singletonKey },
    })

    if (existing) {
      return this.repairIfNeeded(existing)
    }

    try {
      return await this.settingsRepository.save(this.createDefaultSettings())
    } catch {
      const created = await this.settingsRepository.findOne({
        where: { singletonKey: APPLICATION_SETTINGS_DEFAULTS.singletonKey },
      })

      if (created) {
        return this.repairIfNeeded(created)
      }

      throw new SettingsInvalidException(
        'Could not establish application settings singleton',
      )
    }
  }

  async getApplicationSettings(): Promise<ApplicationSettings> {
    return this.applicationCache.getOrSet(
      CacheKeys.settingsCurrent(),
      () => this.loadApplicationSettingsFromDb(),
      this.applicationCache.referenceTtlMs(),
    )
  }

  async updateApplicationSettings(
    input: UpdateApplicationSettingsInput,
  ): Promise<ApplicationSettings> {
    if (
      input.orderingClosingTime === undefined &&
      input.weeklyWarningPercentage === undefined &&
      input.weeklyDoseCap === undefined &&
      input.dailyDoseCapPerType === undefined
    ) {
      throw new SettingsInvalidException('No settings fields were provided')
    }

    const settings = await this.loadApplicationSettingsFromDb()

    if (input.orderingClosingTime !== undefined) {
      settings.orderingClosingTime = input.orderingClosingTime
    }

    if (input.weeklyWarningPercentage !== undefined) {
      settings.weeklyWarningPercentage = input.weeklyWarningPercentage
    }

    if (input.weeklyDoseCap !== undefined) {
      settings.weeklyDoseCap = input.weeklyDoseCap
    }

    if (input.dailyDoseCapPerType !== undefined) {
      settings.dailyDoseCapPerType = input.dailyDoseCapPerType
    }

    const saved = await this.settingsRepository.save(settings)
    await this.applicationCache.invalidateSettings()
    return saved
  }
}

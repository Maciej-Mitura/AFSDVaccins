import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

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

  async getApplicationSettings(): Promise<ApplicationSettings> {
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

    const settings = await this.getApplicationSettings()

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

    return this.settingsRepository.save(settings)
  }
}

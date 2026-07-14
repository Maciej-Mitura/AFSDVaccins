import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { UpdateApplicationSettingsInput } from './dto/update-settings.input'
import { SettingsInvalidException } from './exceptions/settings-invalid.exception'
import {
  DEFAULT_ORDERING_CLOSING_TIME,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEKLY_WARNING_PERCENTAGE,
  SETTINGS_SINGLETON_KEY,
} from './settings.constants'
import { ApplicationSettings } from './settings.entity'

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(ApplicationSettings)
    private readonly settingsRepository: MongoRepository<ApplicationSettings>,
  ) {}

  private createDefaultSettings(): ApplicationSettings {
    return this.settingsRepository.create({
      singletonKey: SETTINGS_SINGLETON_KEY,
      timezone: DEFAULT_TIMEZONE,
      orderingClosingTime: DEFAULT_ORDERING_CLOSING_TIME,
      weeklyWarningPercentage: DEFAULT_WEEKLY_WARNING_PERCENTAGE,
    })
  }

  async getApplicationSettings(): Promise<ApplicationSettings> {
    const existing = await this.settingsRepository.findOne({
      where: { singletonKey: SETTINGS_SINGLETON_KEY },
    })

    if (existing) {
      return existing
    }

    try {
      return await this.settingsRepository.save(this.createDefaultSettings())
    } catch {
      const created = await this.settingsRepository.findOne({
        where: { singletonKey: SETTINGS_SINGLETON_KEY },
      })

      if (created) {
        return created
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
      input.weeklyWarningPercentage === undefined
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

    return this.settingsRepository.save(settings)
  }
}

import { APPLICATION_SETTINGS_FIELD_DEFAULTS } from './settings.constants'
import { ApplicationSettings } from './settings.entity'

type NormalizableSettingsField = keyof typeof APPLICATION_SETTINGS_FIELD_DEFAULTS

export type SettingsNormalizationResult = {
  settings: ApplicationSettings
  repaired: boolean
}

export function normalizeSettings(
  settings: ApplicationSettings,
): SettingsNormalizationResult {
  let repaired = false

  for (const field of Object.keys(
    APPLICATION_SETTINGS_FIELD_DEFAULTS,
  ) as NormalizableSettingsField[]) {
    const currentValue = settings[field]

    if (currentValue === null || currentValue === undefined) {
      ;(
        settings as Record<NormalizableSettingsField, string | number>
      )[field] = APPLICATION_SETTINGS_FIELD_DEFAULTS[field]
      repaired = true
    }
  }

  return { settings, repaired }
}

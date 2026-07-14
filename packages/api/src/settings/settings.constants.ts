export const SETTINGS_SINGLETON_KEY = 'default'

export const DEFAULT_TIMEZONE = 'Europe/Brussels'
export const DEFAULT_ORDERING_CLOSING_TIME = '14:00'
export const DEFAULT_WEEKLY_WARNING_PERCENTAGE = 90
export const DEFAULT_WEEKLY_DOSE_CAP = 200
export const DEFAULT_DAILY_DOSE_CAP_PER_TYPE = 50
export const MAX_DOSE_CAP = 10_000

/** Defaults for user-facing settings fields (used for create and legacy repair). */
export const APPLICATION_SETTINGS_FIELD_DEFAULTS = {
  timezone: DEFAULT_TIMEZONE,
  orderingClosingTime: DEFAULT_ORDERING_CLOSING_TIME,
  weeklyWarningPercentage: DEFAULT_WEEKLY_WARNING_PERCENTAGE,
  weeklyDoseCap: DEFAULT_WEEKLY_DOSE_CAP,
  dailyDoseCapPerType: DEFAULT_DAILY_DOSE_CAP_PER_TYPE,
} as const

/** Full document payload for initial singleton creation. */
export const APPLICATION_SETTINGS_DEFAULTS = {
  singletonKey: SETTINGS_SINGLETON_KEY,
  ...APPLICATION_SETTINGS_FIELD_DEFAULTS,
} as const

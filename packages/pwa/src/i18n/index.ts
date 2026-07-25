import { loadLocaleWithFallback } from './locale-loader'
import { resolveInitialLocale } from './locale-resolution'
import { createAppI18n, type AppI18n } from './app-i18n'
import { FALLBACK_LOCALE, type SupportedLocale } from './supported-locales'

export { flatKeyMessageResolver } from './message-resolver'
export {
  createAppI18n,
  getAppI18n,
  __resetAppI18nForTests,
  type AppI18n,
} from './app-i18n'

export function syncDocumentLang(locale: SupportedLocale): void {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.lang = locale
}

/**
 * Resolve initial locale, load English + active catalogs, create i18n, sync lang.
 * Call once during bootstrap before `app.use(router)`.
 */
export async function bootstrapI18n(): Promise<AppI18n> {
  const initialLocale = resolveInitialLocale()
  const i18n = createAppI18n(initialLocale)
  const { active, fallback } = await loadLocaleWithFallback(initialLocale)

  if (fallback) {
    i18n.global.setLocaleMessage(FALLBACK_LOCALE, fallback)
  }
  i18n.global.setLocaleMessage(initialLocale, active)
  i18n.global.locale.value = initialLocale
  syncDocumentLang(initialLocale)

  return i18n
}

export {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  SUPPORTED_LOCALE_CODES,
  getLocaleBcp47,
  isSupportedLocale,
  type SupportedLocale,
} from './supported-locales'

export {
  LOCALE_STORAGE_KEY,
  detectBrowserLocale,
  normalizeLocale,
  persistLocale,
  readPersistedLocale,
  resolveInitialLocale,
} from './locale-resolution'

export {
  loadLocaleMessages,
  loadLocaleWithFallback,
  isLocaleLoaded,
  unwrapLocaleCatalog,
} from './locale-loader'

export { translate, translatePlural } from './translate'
export { formatDate, formatDateTime, formatNumber } from './format'
export {
  orderStatusLabel,
  routeStatusLabel,
  userRoleLabel,
  apiHealthStatusLabel,
  operationsFeedEventTypeLabel,
  activeInactiveLabel,
  notificationReadLabel,
} from './status-labels'
export {
  isVaccineImageBrowseable,
  vaccineImageValidationStatusLabel,
  vaccineImageValidationStatusExplanation,
  vaccineImageUploadOutcomeMessage,
  formatVaccineImageConfidence,
  boundVaccineImageTags,
} from './vaccine-image-status'
export {
  mapFirebaseAuthError,
  mapUserFacingGraphQLError,
  mapGraphQLError,
} from './error-mapper'
export { extractGraphQLErrorCode } from './graphql-error-code'
export {
  createLoginSchema,
  createRegisterSchema,
  createForgotPasswordSchema,
  createNameFieldsSchema,
  createRegistrationRoleSchema,
  createApothekerProfileSchema,
  createApothekerProfileSchemaOptionalCountry,
  createBezorgerProfileSchema,
} from './validation-schemas'

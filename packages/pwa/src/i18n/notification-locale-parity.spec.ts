/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import nlCatalog from '@/locales/nl.json'
import enCatalog from '@/locales/en.json'
import esCatalog from '@/locales/es.json'
import zhCatalog from '@/locales/zh.json'
import { unwrapLocaleCatalog } from '@/i18n/locale-loader'
import type { SupportedLocale } from '@/i18n'

const LOCALES: SupportedLocale[] = ['nl', 'en', 'es', 'zh']

const catalogs: Record<SupportedLocale, Record<string, string>> = {
  nl: unwrapLocaleCatalog('nl', nlCatalog),
  en: unwrapLocaleCatalog('en', enCatalog),
  es: unwrapLocaleCatalog('es', esCatalog),
  zh: unwrapLocaleCatalog('zh', zhCatalog),
}

/** Structured notification copy keys that must exist in every locale. */
const REQUIRED_NOTIFICATION_KEYS = [
  'notifications.admin.newOrder.title',
  'notifications.admin.newOrder.body',
  'notifications.admin.lowStock.title',
  'notifications.admin.lowStock.body',
  'notifications.apotheker.routeStarted.title',
  'notifications.apotheker.routeStarted.body',
  'notifications.apotheker.nextStop.title',
  'notifications.apotheker.nextStop.body',
  'notifications.apotheker.nextStop.bodyNoCity',
  'notifications.apotheker.deliveryConfirmed.title',
  'notifications.apotheker.deliveryConfirmed.body',
  'notifications.apotheker.orderConfirmation.title',
  'notifications.apotheker.orderConfirmation.body',
  'notifications.apotheker.weekLimitWarning.title',
  'notifications.apotheker.weekLimitWarning.body',
  'notifications.apotheker.orderCancelled.title',
  'notifications.apotheker.orderCancelled.body',
  'notifications.apotheker.orderCancelledByAdmin.body',
  'notifications.apotheker.orderDelivered.title',
  'notifications.apotheker.orderDelivered.body',
  'notifications.bezorger.routeAssigned.title',
  'notifications.bezorger.routeAssigned.body',
  'notifications.bezorger.routeDateReminder.title',
  'notifications.bezorger.routeDateReminder.body',
  'notifications.fallback.pharmacyName',
] as const

describe('notification locale catalog keys', () => {
  it('contains all structured notification keys in every locale', () => {
    for (const locale of LOCALES) {
      for (const key of REQUIRED_NOTIFICATION_KEYS) {
        expect(catalogs[locale][key], `${locale}:${key}`).toBeTruthy()
        expect(catalogs[locale][key].trim(), `${locale}:${key}`).not.toBe('')
        expect(catalogs[locale][key], `${locale}:${key}`).not.toMatch(
          /^notifications\./,
        )
      }
    }
  })
})

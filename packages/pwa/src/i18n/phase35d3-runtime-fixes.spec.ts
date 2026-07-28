/**
 * Phase 35D3 — runtime localisation defect fixes.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import nlCatalog from '@/locales/nl.json'
import enCatalog from '@/locales/en.json'
import esCatalog from '@/locales/es.json'
import zhCatalog from '@/locales/zh.json'
import { unwrapLocaleCatalog } from '@/i18n/locale-loader'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import {
  __resetAppI18nForTests,
  syncDocumentLang,
  translate,
} from '@/i18n'
import { createTestI18n } from '@/i18n/test-utils'
import { useLanguage } from '@/composables/useLanguage'
import { formatHandlingDuration } from '@/composables/courier-analytics-mappers'
import { formatFileSizeBytes } from '@/composables/voice-report/voice-recorder-types'
import { resolveNotificationCopy } from '@/utils/notification-display'
import { resolveOperationsFeedDetail } from '@/utils/operations-feed-display'

const PREVIOUSLY_MISSING = [
  'arrival.arrivedAt',
  'arrival.cancelPending',
  'arrival.cancelPendingConfirm',
  'arrival.conflict',
  'arrival.discardPending',
  'arrival.markArrived',
  'arrival.pending',
  'arrival.retrySync',
  'arrival.synchronising',
  'arrival.unableToRecord',
  'arrival.willSyncWhenOnline',
  'deliveryManifest.downloadRoute',
  'deliveryManifest.downloadRouteAria',
  'deliveryManifest.downloadStop',
  'deliveryManifest.downloadStopAria',
  'deliveryManifest.downloaded',
  'deliveryManifest.error.forbidden',
  'deliveryManifest.error.unable',
  'deliveryManifest.error.unavailable',
  'deliveryManifest.generating',
  'errors.deliveryArrival.generic',
  'errors.deliveryArrival.network',
] as const

const catalogs = {
  nl: unwrapLocaleCatalog('nl', nlCatalog),
  en: unwrapLocaleCatalog('en', enCatalog),
  es: unwrapLocaleCatalog('es', esCatalog),
  zh: unwrapLocaleCatalog('zh', zhCatalog),
}

const pwaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('phase35d3 runtime localisation fixes', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('includes all 22 previously missing keys in all four locales', () => {
    for (const key of PREVIOUSLY_MISSING) {
      for (const locale of ['nl', 'en', 'es', 'zh'] as const) {
        const value = catalogs[locale][key]
        expect(value?.trim().length, `${locale}:${key}`).toBeGreaterThan(0)
        if (locale !== 'en') {
          // Newly added keys must not silently reuse English in nl/es/zh
          // except IEC unit symbols / brand abbreviations.
          const allowSame = new Set([
            'routeVoiceReports.preview.unit.bytes',
            'routeVoiceReports.preview.unit.kib',
            'routeVoiceReports.preview.unit.mib',
            'routeVoiceReports.preview.fileSizeValue',
            'common.emDash',
            'app.shortName',
            'app.title',
          ])
          if (!allowSame.has(key)) {
            expect(value, `${locale}:${key}`).not.toBe(catalogs.en[key])
          }
        }
      }
    }
  })

  it('keeps placeholder parity for previously missing keys', () => {
    const placeholderMultiset = (value: string) =>
      [...(value.match(/\{[^}]+\}/g) ?? [])].sort()

    for (const key of PREVIOUSLY_MISSING) {
      const expected = placeholderMultiset(catalogs.nl[key])
      for (const locale of ['en', 'es', 'zh'] as const) {
        expect(placeholderMultiset(catalogs[locale][key])).toEqual(expected)
      }
    }
  })

  it('never renders raw arrival.* or deliveryManifest.* keys for known UI strings', () => {
    const samples = [
      'arrival.markArrived',
      'arrival.pending',
      'arrival.arrivedAt',
      'deliveryManifest.downloadRoute',
      'deliveryManifest.generating',
      'deliveryManifest.error.unable',
      'errors.deliveryArrival.generic',
      'errors.deliveryArrival.network',
    ]
    for (const key of samples) {
      const value = translate(key, { time: '10:00' })
      expect(value).not.toBe(key)
      expect(value.startsWith('arrival.')).toBe(false)
      expect(value.startsWith('deliveryManifest.')).toBe(false)
      expect(value.startsWith('errors.')).toBe(false)
    }
  })

  it('maps arrival errors to translated messages', () => {
    expect(translate('errors.deliveryArrival.network')).not.toMatch(
      /^errors\./,
    )
    expect(translate('errors.deliveryArrival.generic')).not.toMatch(
      /^errors\./,
    )
  })

  it('localises duration formatting across locales', async () => {
    const { setLocale } = useLanguage()
    await setLocale('en')
    expect(formatHandlingDuration(3725)).toBe('1h 2m')
    await setLocale('nl')
    expect(formatHandlingDuration(3725)).toBe('1u 2m')
    await setLocale('es')
    expect(formatHandlingDuration(125)).toBe('2min 5s')
    await setLocale('zh')
    expect(formatHandlingDuration(45)).toBe('45秒')
  })

  it('localises file-size formatting', () => {
    expect(formatFileSizeBytes(2048)).toContain('KiB')
    expect(formatFileSizeBytes(100)).toMatch(/100/)
  })

  it('uses translated operations-feed detail and never raw event.message', () => {
    const detail = resolveOperationsFeedDetail(
      {
        eventType: 'NEW_ORDER',
        message: 'Nieuwe bestelling SECRET_INTERNAL (3 dosissen)',
        order: {
          id: '507f1f77bcf86cd799439011',
          totalQuantity: 3,
          status: 'PENDING',
        },
      },
      translate,
    )

    expect(detail).not.toContain('SECRET_INTERNAL')
    expect(detail).not.toContain('Nieuwe bestelling')
    expect(detail).toContain('3')
    expect(detail.toLowerCase()).toMatch(/order|doses/)

    const unknown = resolveOperationsFeedDetail(
      {
        eventType: 'SOMETHING_ELSE',
        message: 'should-not-appear',
      },
      translate,
    )
    expect(unknown).toBe(translate('admin.operationsFeed.unknown'))
    expect(unknown).not.toContain('should-not-appear')

    const statusLine = resolveOperationsFeedDetail(
      {
        eventType: 'ORDER_STATUS_CHANGED',
        message: 'Bestelling x status: PENDING',
        order: { id: 'abc12345', status: 'PENDING', totalQuantity: 1 },
      },
      translate,
    )
    expect(statusLine).not.toContain('PENDING')
    expect(statusLine).toContain(translate('status.order.pending'))
  })

  it('notification fallback never shows a raw key', () => {
    const copy = resolveNotificationCopy(
      {
        title: 'notifications.missing.title',
        body: 'notifications.missing.body',
        titleKey: 'notifications.missing.title',
        bodyKey: 'notifications.missing.body',
      },
      translate,
    )
    expect(copy.title).not.toMatch(/^notifications\./)
    expect(copy.body).not.toMatch(/^notifications\./)
    expect(copy.title).toBe(translate('notifications.fallback.title'))
    expect(copy.body).toBe(translate('notifications.fallback.body'))
  })

  it('syncs shell title and meta description from locale catalogs', async () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    meta.setAttribute('content', 'stale')
    document.head.appendChild(meta)

    const { setLocale } = useLanguage()
    await setLocale('en')
    syncDocumentLang('en')
    expect(document.title).toBe(translate('app.title'))
    expect(meta.getAttribute('content')).toBe(translate('app.description'))

    await setLocale('nl')
    syncDocumentLang('nl')
    expect(meta.getAttribute('content')).toBe(
      catalogs.nl['app.description'],
    )
    expect(meta.getAttribute('content')).not.toBe(
      'Platform for vaccine orders, stock and delivery routes.',
    )
  })

  it('removes confirmed Dutch-only hardcodes from shell/manifest sources', () => {
    const indexHtml = fs.readFileSync(
      path.join(pwaRoot, 'index.html'),
      'utf8',
    )
    const viteConfig = fs.readFileSync(
      path.join(pwaRoot, 'vite.config.ts'),
      'utf8',
    )
    expect(indexHtml).not.toContain(
      'Platform voor vaccinbestellingen, voorraad en bezorgroutes.',
    )
    expect(viteConfig).not.toContain(
      'Platform voor vaccinbestellingen, voorraad en bezorgroutes.',
    )
    expect(viteConfig).toContain("lang: 'en'")
  })
})

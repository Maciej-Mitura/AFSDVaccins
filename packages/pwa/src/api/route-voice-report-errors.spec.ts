/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  mapRouteVoiceReportErrorCode,
  mapTranscriptionFailureCode,
} from '@/api/route-voice-report-errors'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

describe('route-voice-report-errors', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('maps domain upload errors to bounded messages', () => {
    expect(
      mapRouteVoiceReportErrorCode('ROUTE_VOICE_REPORT_LIMIT_REACHED'),
    ).toBe(translate('routeVoiceReports.error.limitReached'))
    expect(
      mapRouteVoiceReportErrorCode('ROUTE_VOICE_REPORT_ROUTE_NOT_IN_PROGRESS'),
    ).toBe(translate('routeVoiceReports.error.routeNotActive'))
    expect(
      mapRouteVoiceReportErrorCode('ROUTE_VOICE_REPORT_AUDIO_TOO_LARGE'),
    ).toBe(translate('routeVoiceReports.error.audioTooLarge'))
    expect(mapRouteVoiceReportErrorCode('ROUTE_VOICE_REPORT_FORBIDDEN')).toBe(
      translate('routeVoiceReports.error.forbidden'),
    )
    expect(
      mapRouteVoiceReportErrorCode('ROUTE_VOICE_REPORT_STOP_ID_REQUIRED'),
    ).toBe(translate('routeVoiceReports.error.stopIdRequired'))
    expect(
      mapRouteVoiceReportErrorCode('ROUTE_VOICE_REPORT_STOP_NOT_FOUND'),
    ).toBe(translate('routeVoiceReports.error.stopNotFound'))
    expect(
      mapRouteVoiceReportErrorCode('ROUTE_VOICE_REPORT_STOP_INVALID'),
    ).toBe(translate('routeVoiceReports.error.stopInvalid'))
  })

  it('maps transcription failure codes without exposing raw provider text', () => {
    expect(
      mapTranscriptionFailureCode('ROUTE_VOICE_TRANSCRIPTION_NO_SPEECH'),
    ).toBe(translate('routeVoiceReports.transcription.noSpeech'))
    expect(
      mapTranscriptionFailureCode('ROUTE_VOICE_TRANSCRIPTION_PROVIDER_TIMEOUT'),
    ).toBe(translate('routeVoiceReports.transcription.providerTimeout'))
    expect(mapTranscriptionFailureCode('AZURE_RAW_SECRET')).toBe(
      translate('routeVoiceReports.transcription.failed'),
    )
    expect(mapTranscriptionFailureCode('AZURE_RAW_SECRET')).not.toContain(
      'AZURE',
    )
  })
})

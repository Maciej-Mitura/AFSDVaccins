import { registerEnumType } from '@nestjs/graphql'

/** Requested transcription locale (Phase 34B). AUTO detects among the three. */
export enum RouteVoiceTranscriptionLocale {
  EN_GB = 'en-GB',
  NL_NL = 'nl-NL',
  PL_PL = 'pl-PL',
  AUTO = 'AUTO',
}

export const ROUTE_VOICE_TRANSCRIPTION_MANUAL_LOCALES = [
  RouteVoiceTranscriptionLocale.EN_GB,
  RouteVoiceTranscriptionLocale.NL_NL,
  RouteVoiceTranscriptionLocale.PL_PL,
] as const

export const ROUTE_VOICE_TRANSCRIPTION_AUTO_CANDIDATE_LOCALES = [
  ...ROUTE_VOICE_TRANSCRIPTION_MANUAL_LOCALES,
] as const

registerEnumType(RouteVoiceTranscriptionLocale, {
  name: 'RouteVoiceTranscriptionLocale',
  description:
    'Requested speech locale: en-GB, nl-NL, pl-PL, or AUTO (detect among those three)',
})
